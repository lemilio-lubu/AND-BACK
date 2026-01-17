import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateRequestDto, FacturacionEstado } from './dto/create-request.dto';
import { GamificacionService } from '../gamificacion/gamificacion.service';

@Injectable()
export class FacturacionService {
  constructor(
    private supabase: SupabaseService,
    private gamificacion: GamificacionService,
  ) {}

  async createRequest(dto: CreateRequestDto, userId: string) {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .insert({
        empresa_id: dto.empresaId,
        plataforma: dto.plataforma,
        monto_solicitado: dto.montoSolicitado,
        estado: FacturacionEstado.REQUEST_CREATED,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    // Calcular automáticamente
    await this.calculateRequest(data.id);

    return data;
  }

  async calculateRequest(requestId: string) {
    // Obtener request
    const { data: request, error } = await this.supabase.client
      .from('facturacion_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error) throw error;

    // Cálculos
    const montoSolicitado = parseFloat(request.monto_solicitado);
    const baseCalculada = montoSolicitado / 1.12; // Base sin IVA
    const iva = baseCalculada * 0.12;
    const isd = montoSolicitado * 0.05; // ISD evitado
    const totalFacturado = montoSolicitado;

    // Actualizar request
    const { data: updated, error: updateError } = await this.supabase.client
      .from('facturacion_requests')
      .update({
        base_calculada: baseCalculada,
        iva: iva,
        isd_evitado: isd,
        total_facturado: totalFacturado,
        estado: FacturacionEstado.CALCULATED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Audit log
    await this.createAuditLog(
      requestId,
      FacturacionEstado.REQUEST_CREATED,
      FacturacionEstado.CALCULATED,
      null,
    );

    return updated;
  }

  async approveRequest(requestId: string, userId: string) {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .update({
        estado: FacturacionEstado.APPROVED_BY_CLIENT,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    await this.createAuditLog(
      requestId,
      FacturacionEstado.CALCULATED,
      FacturacionEstado.APPROVED_BY_CLIENT,
      userId,
    );

    return data;
  }

  async invoiceRequest(requestId: string, adminId: string) {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .update({
        estado: FacturacionEstado.INVOICED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    await this.createAuditLog(
      requestId,
      FacturacionEstado.APPROVED_BY_CLIENT,
      FacturacionEstado.INVOICED,
      adminId,
    );

    // Verificar si es primera factura
    const { data: request } = await this.supabase.client
      .from('facturacion_requests')
      .select('created_by')
      .eq('id', requestId)
      .single();

    if (request) {
      await this.gamificacion.handleFirstInvoice(request.created_by);
    }

    return data;
  }

  async markAsPaid(requestId: string, adminId: string) {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .update({
        estado: FacturacionEstado.PAID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    await this.createAuditLog(
      requestId,
      FacturacionEstado.INVOICED,
      FacturacionEstado.PAID,
      adminId,
    );

    return data;
  }

  async completeRequest(requestId: string, adminId: string) {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .update({
        estado: FacturacionEstado.COMPLETED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    await this.createAuditLog(
      requestId,
      FacturacionEstado.PAID,
      FacturacionEstado.COMPLETED,
      adminId,
    );

    return data;
  }

  async findByUserId(userId: string) {
    // Obtener empresa del usuario
    const { data: empresaUser } = await this.supabase.client
      .from('empresa_users')
      .select('empresa_id')
      .eq('user_id', userId)
      .single();

    if (!empresaUser) return [];

    // Obtener requests de la empresa
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .select('*')
      .eq('empresa_id', empresaUser.empresa_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findAll() {
    const { data, error } = await this.supabase.client
      .from('facturacion_requests')
      .select('*, empresas(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  private async createAuditLog(
    requestId: string,
    oldEstado: FacturacionEstado | null,
    newEstado: FacturacionEstado,
    actor: string | null,
  ) {
    await this.supabase.client.from('facturacion_audit_log').insert({
      request_id: requestId,
      old_estado: oldEstado,
      new_estado: newEstado,
      actor,
    });
  }
}
