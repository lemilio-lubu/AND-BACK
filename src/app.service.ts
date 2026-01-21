import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';
import { UserRole } from './users/user.types';

@Injectable()
export class AppService {
  constructor(private supabase: SupabaseService) {}
  
  getHello(): string {
    return 'Hello World!';
  }

  async debugSupabase() {
    console.log('🧪 [Debug] Testing Supabase connection...');
    
    const userId = '79dabe3c-f41a-4240-885f-cbe49f7354a4';
    
    // Test 1: Consulta sin filtros
    const { data: all, error: allError } = await this.supabase.client
      .from('empresa_users')
      .select('*');
    
    console.log('Test 1 - Todas las relaciones:', all);
    console.log('Test 1 - Error:', allError);
    
    // Test 2: Consulta con filtro
    const { data: filtered, error: filteredError } = await this.supabase.client
      .from('empresa_users')
      .select('*')
      .eq('user_id', userId);
    
    console.log('Test 2 - Relaciones filtradas:', filtered);
    console.log('Test 2 - Error:', filteredError);
    
    return {
      test1: { data: all, error: allError },
      test2: { data: filtered, error: filteredError }
    };
  }

  async getProfile(userId: string) {
    console.log(`🔍 [getProfile] Obteniendo perfil para userId: "${userId}" (tipo: ${typeof userId}, length: ${userId?.length})`);
    
    if (!userId) {
      console.error('❌ [getProfile] userId es undefined o null');
      throw new NotFoundException('userId es requerido');
    }

    // --- DIAGNÓSTICO TEMPORAL: Cliente Local ---
    // Creamos cliente directo con process.env para descartar problemas de inyección
    // Importamos createClient dinámicamente o asumimos que ya está disponible si importamos supabase-js
    const { createClient } = require('@supabase/supabase-js');
    console.log('🧪 [getProfile] Creando cliente Supabase local para verificación...');
    const localClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Verificamos si este cliente local ve los datos
    const { data: localData, error: localError } = await localClient
        .from('empresa_users')
        .select('*')
        .eq('user_id', userId);
    console.log('🧪 [getProfile] Cliente Local - Relaciones encontradas:', localData);
    if (localError) console.error('🧪 [getProfile] Cliente Local - Error:', localError);
    // -------------------------------------------
    
    // 1. Obtener usuario de la tabla pública 'users'
    let publicUser: any = null;
    let userError = null;

    // Intento 1: Cliente Inyectado
    const { data: u1, error: e1 } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!u1) {
         console.warn(`⚠️ [getProfile] 'users' no encontrado con cliente inyectado, probando localClient...`);
         const { data: u2, error: e2 } = await localClient
           .from('users')
           .select('*')
           .eq('id', userId)
           .single();
         publicUser = u2;
         userError = e2;
    } else {
         publicUser = u1;
         userError = e1;
    }

    if (userError || !publicUser) {
      console.error(`❌ [getProfile] Usuario no encontrado en tabla users:`, userError);
      throw new NotFoundException('Usuario no encontrado');
    }

    console.log(`✅ [getProfile] Usuario encontrado en tabla users:`, publicUser);

    // 2. Obtener email de Supabase Auth
    const { data: authUser, error: authError } = await this.supabase.client.auth.admin.getUserById(userId);
    
    // Si falla authadmin (raro), manejarlo
    const email = authUser?.user?.email || null;
    console.log(`📧 [getProfile] Email obtenido: ${email}`);

    const response: any = {
      id: publicUser.id,
      email: email,
      role: publicUser.role,
      is_new: publicUser.is_new,
      has_emitted_first_invoice: publicUser.has_emitted_first_invoice,
    };

    // 3. Si es EMPRESA, buscar datos de la empresa
    if (publicUser.role === UserRole.EMPRESA) {
      console.log(`🏢 [getProfile] Usuario es EMPRESA, buscando relación en empresa_users...`);
      
      // DIAGNÓSTICO: Usar client local si client principal falla (temporal hasta que se arregle el singleton)
      let relations: any[] = [];
      let relationError = null;
      
      // Intento 1: Cliente Inyectado
      const { data: rels1, error: err1 } = await this.supabase.client
        .from('empresa_users')
        .select('*') // Forzar select *
        .eq('user_id', userId);
        
      if (!rels1 || rels1.length === 0) {
        console.warn('⚠️ [getProfile] Cliente inyectado falló, intentando con cliente local...');
         // Intento 2: Cliente Local (Fallback)
         const { data: rels2, error: err2 } = await localClient
           .from('empresa_users')
            .select('*')
            .eq('user_id', userId);
            
         relations = rels2;
         relationError = err2;
      } else {
         relations = rels1;
         relationError = err1;
      }
      
      if (relationError) {
        console.error(`❌ [getProfile] Error al buscar en empresa_users:`, relationError);
      }
      
      console.log(`🔗 [getProfile] Relaciones encontradas:`, relations);
      
      // Tomamos la primera empresa vinculada
      const relation = relations && relations.length > 0 ? relations[0] : null;

      if (relation) {
        console.log(`✅ [getProfile] Relación encontrada, buscando empresa con id: ${relation.empresa_id}`);
        
        // Usar también fallback para empresa
        let empresa = null;
        const { data: emp1, error: empErr1 } = await this.supabase.client
          .from('empresas')
          .select('*')
          .eq('id', relation.empresa_id)
          .single();
          
        if (!emp1) {
             const { data: emp2 } = await localClient
              .from('empresas')
              .select('*')
              .eq('id', relation.empresa_id)
              .single();
             empresa = emp2;
        } else {
             empresa = emp1;
        }

        if (empresa) {
          console.log(`✅ [getProfile] Empresa encontrada:`, empresa);
          response.empresa = empresa;
        } else {
          console.warn(`⚠️ [getProfile] No se encontró empresa con id: ${relation.empresa_id}`);
        }
      } else {
        console.warn(`⚠️ [getProfile] No hay relaciones en empresa_users para userId: ${userId}`);
      }
    }

    console.log(`✅ [getProfile] Respuesta final:`, response);
    return response;
  }
}
