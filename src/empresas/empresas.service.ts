import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEmpresaDto, EstadoTributario } from './dto/create-empresa.dto';

@Injectable()
export class EmpresasService {
  constructor(private supabase: SupabaseService) {}

  async create(dto: CreateEmpresaDto, userId: string) {
    // Crear empresa
    const { data: empresa, error: empresaError } = await this.supabase.client
      .from('empresas')
      .insert({
        razon_social: dto.razonSocial,
        correo_corporativo: dto.correoCorporativo,
        ruc: dto.ruc,
        telefono: dto.telefono,
        ciudad: dto.ciudad,
        estado_tributario: EstadoTributario.PENDIENTE,
      })
      .select()
      .single();

    if (empresaError) throw empresaError;

    // Crear relación empresa_users
    const { error: relationError } = await this.supabase.client
      .from('empresa_users')
      .insert({
        empresa_id: empresa.id,
        user_id: userId,
        role_en_empresa: 'OWNER',
      });

    if (relationError) throw relationError;

    return empresa;
  }

  async findByUserId(userId: string) {
    const { data, error } = await this.supabase.client
      .from('empresa_users')
      .select('empresa_id, empresas(*)')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async findById(empresaId: string) {
    const { data, error } = await this.supabase.client
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .single();

    if (error) throw error;
    return data;
  }
}
