import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface SeedCredentials {
  email: string;
  password: string;
  role: string;
  userId: string;
}

const testUsers = [
  {
    email: 'admin@and.dev',
    password: 'AdminAND123!@#',
    role: 'admin',
    name: 'Admin AND',
  },
  {
    email: 'empresa@and.dev',
    password: 'EmpresaAND123!@#',
    role: 'empresa',
    name: 'Tech Solutions',
  },
  {
    email: 'influencer@and.dev',
    password: 'InfluencerAND123!@#',
    role: 'influencer',
    name: 'Juan Influencer',
  },
];

const testCompany = {
  razonSocial: 'Tech Solutions S.A.C.',
  correoCorporativo: 'contacto@techsolutions.com',
  ruc: '20123456789',
  telefono: '+51987654321',
  ciudad: 'Lima',
};

@Injectable()
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(private readonly supabase: SupabaseService) {}

  async executeSeed() {
    this.logger.log('🌱 Iniciando seed de datos...');

    try {
      await this.cleanDatabase();
      return await this.seedDatabase();
    } catch (error) {
      this.logger.error('❌ Error en seed:', error);
      throw error;
    }
  }

  private async cleanDatabase() {
    this.logger.log('🧹 Limpiando base de datos...');

    const client = this.supabase.getClient();

    try {
      // Eliminar registros en orden de dependencias
      await client.from('facturacion_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('facturacion_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('empresa_users').delete().neq('empresa_id', '00000000-0000-0000-0000-000000000000');
      await client.from('empresas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('gamificacion_estado').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
      await client.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Eliminar usuarios de auth
      const { data: authUsers } = await client.auth.admin.listUsers();
      for (const user of authUsers.users) {
        if (testUsers.some((tu) => tu.email === user.email)) {
          await client.auth.admin.deleteUser(user.id);
        }
      }

      this.logger.log('✅ Base de datos limpia');
    } catch (error) {
      this.logger.warn('⚠️ Error limpiando base de datos:', error);
    }
  }

  private async seedDatabase() {
    const client = this.supabase.getClient();
    const credentials: SeedCredentials[] = [];
    const createdUserIds: Record<string, string> = {};

    // 1. Crear usuarios de auth y en tabla users
    for (const testUser of testUsers) {
      try {
        this.logger.log(`📝 Creando usuario: ${testUser.email}`);

        // Crear en auth
        const { data, error } = await client.auth.admin.createUser({
          email: testUser.email,
          password: testUser.password,
          email_confirm: true,
        });

        if (error) throw error;

        const userId = data.user.id;
        createdUserIds[testUser.role] = userId;

        // Crear en tabla users
        await client.from('users').insert({
          id: userId,
          role: testUser.role,
          is_new: testUser.role === 'empresa' ? true : false,
        });

        // Inicializar gamificación
        await client.from('gamificacion_estado').insert({
          user_id: userId,
          nivel: 'iniciando',
          puntos: 0,
          visible: testUser.role === 'empresa',
        });

        credentials.push({
          email: testUser.email,
          password: testUser.password,
          role: testUser.role,
          userId: userId,
        });

        this.logger.log(`✅ Usuario creado: ${testUser.email}`);
      } catch (error) {
        this.logger.error(`❌ Error creando usuario ${testUser.email}:`, error);
      }
    }

    // 2. Crear empresa
    this.logger.log('📋 Creando empresa...');
    try {
      const { data: empresa, error } = await client
        .from('empresas')
        .insert({
          razon_social: testCompany.razonSocial,
          correo_corporativo: testCompany.correoCorporativo,
          ruc: testCompany.ruc,
          telefono: testCompany.telefono,
          ciudad: testCompany.ciudad,
          estado_tributario: 'pendiente',
        })
        .select()
        .single();

      if (error) throw error;

      this.logger.log(`✅ Empresa creada: ${empresa.id}`);

      // 3. Crear relación empresa_users
      this.logger.log('🔗 Vinculando usuario con empresa...');
      const empresaUserId = createdUserIds['empresa'];

      await client.from('empresa_users').insert({
        empresa_id: empresa.id,
        user_id: empresaUserId,
        role_en_empresa: 'OWNER',
      });

      this.logger.log('✅ Usuario empresa vinculado');

      // 4. Crear solicitud de facturación de prueba
      this.logger.log('💰 Creando solicitud de facturación de ejemplo...');

      const { data: request, error: requestError } = await client
        .from('facturacion_requests')
        .insert({
          empresa_id: empresa.id,
          plataforma: 'meta',
          monto_solicitado: 1500.5,
          estado: 'REQUEST_CREATED',
          created_by: empresaUserId,
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Calcular automáticamente
      const montoSolicitado = 1500.5;
      const baseCalculada = montoSolicitado / 1.12;
      const iva = baseCalculada * 0.12;
      const isd = montoSolicitado * 0.05;

      await client
        .from('facturacion_requests')
        .update({
          base_calculada: baseCalculada,
          iva: iva,
          isd_evitado: isd,
          total_facturado: montoSolicitado,
          estado: 'CALCULATED',
        })
        .eq('id', request.id);

      this.logger.log(`✅ Solicitud de facturación creada: ${request.id}`);
    } catch (error) {
      this.logger.error('❌ Error creando empresa:', error);
    }

    this.logger.log('🎉 SEED COMPLETADO EXITOSAMENTE 🎉');

    return {
      message: 'Seed completado exitosamente',
      credentials,
      stats: {
        usuariosCreados: credentials.length,
        empresasCreadas: 1,
        solicitudesFacturacion: 1,
        gamificacionRegistros: credentials.length,
      },
    };
  }
}
