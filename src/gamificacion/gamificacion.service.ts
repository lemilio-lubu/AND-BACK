import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class GamificacionService {
  constructor(private supabase: SupabaseService) {}

  async handleFirstInvoice(userId: string) {
    // Verificar si ya tiene factura emitida
    const { data: user } = await this.supabase.client
      .from('users')
      .select('has_emitted_first_invoice')
      .eq('id', userId)
      .single();

    if (user?.has_emitted_first_invoice) {
      return; // Ya procesado
    }

    // Marcar primera factura
    await this.supabase.client
      .from('users')
      .update({
        has_emitted_first_invoice: true,
        is_new: false,
      })
      .eq('id', userId);

    // Ocultar gamificación
    await this.supabase.client
      .from('gamificacion_estado')
      .update({
        visible: false,
      })
      .eq('user_id', userId);
  }

  async initGamificacion(userId: string) {
    const { error } = await this.supabase.client
      .from('gamificacion_estado')
      .insert({
        user_id: userId,
        nivel: 'iniciando',
        puntos: 0,
        visible: true,
      });

    if (error && error.code !== '23505') {
      // Ignorar duplicados
      throw error;
    }
  }

  async getEstado(userId: string) {
    const { data, error } = await this.supabase.client
      .from('gamificacion_estado')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }
}
