import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateRequestDto, FacturacionEstado } from './dto/create-request.dto';
import { DashboardStatsResponse } from './dto/dashboard-stats.dto';
import { GamificacionService } from '../gamificacion/gamificacion.service';

@Injectable()
export class FacturacionService {
  constructor(
    private supabase: SupabaseService,
    private gamificacion: GamificacionService,
    private configService: ConfigService,
  ) {}

  private getLocalClient() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    
    // --- CLIENTE LOCAL (ROBUST DEPLOY) ---
    const { createClient } = require('@supabase/supabase-js');
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
    // -------------------------------------
  }

  // 1. Envías tu solicitud
  async createRequest(dto: CreateRequestDto, userId: string) {
    const localClient = this.getLocalClient();

    let empresaId = dto.empresaId;

    // Si no viene ID de empresa, buscar la del usuario logueado
    if (!empresaId) {
      const { data: relations, error } = await localClient
        .from('empresa_users')
        .select('empresa_id')
        .eq('user_id', userId);
      
      const relation = relations?.[0];

      if (error) {
        console.error('Error buscando empresa users para:', userId, error);
      }
      
      if (!relation) {
        console.warn('Usuario sin empresa intentando facturar. UserID:', userId);
        throw new BadRequestException('El usuario no tiene una empresa asociada. (Tabla empresa_users vacía para este ID)');
      }
      empresaId = relation.empresa_id;
    }

    const { data, error } = await localClient
      .from('facturacion_requests')
      .insert({
        empresa_id: empresaId,
        plataforma: dto.plataforma,
        monto_solicitado: dto.montoSolicitado,
        estado: FacturacionEstado.REQUEST_CREATED,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
        console.error('Error insertando request:', error);
        throw new BadRequestException('Error al crear la solicitud: ' + error.message);
    }

    // 2. AND calcula el monto final (Manual por Admin)
    // return await this.calculateRequest(data.id);
    return data;
  }

  async calculateRequest(requestId: string) {
    const localClient = this.getLocalClient();
    const { data: request, error } = await localClient
      .from('facturacion_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error) {
        console.error('Error finding request to calculate:', error);
        throw new NotFoundException('Solicitud no encontrada');
    }

    const montoSolicitado = parseFloat(request.monto_solicitado);
    const baseCalculada = montoSolicitado / 1.12; 
    const iva = baseCalculada * 0.12;
    const isd = montoSolicitado * 0.05; 
    const totalFacturado = montoSolicitado;

    const { data: updated, error: updateError } = await localClient
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

    await this.createAuditLog(
      requestId,
      FacturacionEstado.REQUEST_CREATED,
      FacturacionEstado.CALCULATED,
      null,
    );

    return updated;
  }

  // 3. Apruebas el valor (Cliente)
  async approveRequest(requestId: string, userId: string) {
    const localClient = this.getLocalClient();
    // Validar estado actual antes de aprobar
    const { data: request } = await localClient
        .from('facturacion_requests')
        .select('*')
        .eq('id', requestId)
        .single();
    
    if (!request) {
        throw new NotFoundException('Solicitud no encontrada');
    }

    // Solo se puede aprobar si está en estado CALCULATED
    if (request.estado !== FacturacionEstado.CALCULATED) {
        throw new BadRequestException(`No se puede aprobar una solicitud en estado ${request.estado}. Debe estar en CALCULATED.`);
    }

    return this.updateEstado(requestId, FacturacionEstado.APPROVED_BY_CLIENT, userId);
  }

  // 4. AND emite la factura (Admin)
  async emitInvoice(requestId: string, adminId: string) {
    return this.updateEstado(requestId, FacturacionEstado.INVOICED, adminId);
  }

  // 5. Realizas el pago (Empresa)
  async payRequest(requestId: string, userId: string) {
      // Validar que sea dueño de la solicitud
      const request = await this.validateOwnership(requestId, userId);

      if (request.estado !== FacturacionEstado.INVOICED) {
          throw new BadRequestException('Solo se pueden pagar solicitudes facturadas (INVOICED).');
      }

      return this.updateEstado(requestId, FacturacionEstado.PAID, userId);
  }

  // Helper para Admin: Confirmar pago (Legacy o alternativo)
  async confirmPayment(requestId: string, adminId: string) {
    return this.updateEstado(requestId, FacturacionEstado.PAID, adminId);
  }

  // 6. AND ejecuta la recarga (Admin - Final)
  async completeOrder(requestId: string, adminId: string) {
    const localClient = this.getLocalClient();
    const result = await this.updateEstado(requestId, FacturacionEstado.COMPLETED, adminId);
    
    // Gamificación: primera factura completada
    const { data: req } = await localClient
        .from('facturacion_requests')
        .select('created_by')
        .eq('id', requestId)
        .single();
        
    if (req?.created_by) {
        await this.gamificacion.handleFirstInvoice(req.created_by);
    }
    
    return result;
  }

  // Helper para Admin: Listar todas
  async findAll() {
    const localClient = this.getLocalClient();

    const { data, error } = await localClient
      .from('facturacion_requests')
      .select('*, empresas(*)')
      .order('created_at', { ascending: false });

    if (error) {
        console.error('Error in findAll (Admin):', error);
        throw error;
    }
    
    // Mapeo seguro para el frontend
    return data.map(req => ({
        ...req,
        monto: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado),
        fecha: req.created_at
    }));
  }

  // Helper para Empresa: Listar propias
  async findByUserId(userId: string) {
    const localClient = this.getLocalClient();

    const { data: relations } = await localClient
      .from('empresa_users')
      .select('empresa_id')
      .eq('user_id', userId);
    
    const empresaUser = relations?.[0];

    if (!empresaUser) return [];

    const { data, error } = await localClient
      .from('facturacion_requests')
      .select('*')
      .eq('empresa_id', empresaUser.empresa_id)
      .order('created_at', { ascending: false });
      
    if (error) {
        console.error('Error in findByUserId:', error);
        throw error;
    }

    return data;
  }

  private async validateOwnership(requestId: string, userId: string) {
      const localClient = this.getLocalClient();
      const { data: request } = await localClient
          .from('facturacion_requests')
          .select('*, empresas(id, empresa_users(user_id))') // Join complejo, simplifiquemos
          .eq('id', requestId)
          .single();
      
      if (!request) throw new NotFoundException('Solicitud no encontrada');

      // Verificación simple por ahora: buscar empresa del usuario y comparar
      const { data: relations } = await localClient
          .from('empresa_users')
          .select('empresa_id')
          .eq('user_id', userId)
          .single();
          
      if (!relations || relations.empresa_id !== request.empresa_id) {
          throw new BadRequestException('No tienes permiso para operar esta solicitud');
      }
      return request;
  }

  // Helper Genérico para cambio de estados
  private async updateEstado(requestId: string, nuevoEstado: FacturacionEstado, actorId: string) {
    const localClient = this.getLocalClient();
    const { data: request } = await localClient
       .from('facturacion_requests')
       .select('estado')
       .eq('id', requestId)
       .maybeSingle();
       
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    const oldEstado = request.estado;

    const { data, error } = await localClient
      .from('facturacion_requests')
      .update({
        estado: nuevoEstado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    await this.createAuditLog(requestId, oldEstado, nuevoEstado, actorId);
    return data;
  }

  private async createAuditLog(
    requestId: string,
    oldEstado: FacturacionEstado | null,
    newEstado: FacturacionEstado,
    actor: string | null,
  ) {
    const localClient = this.getLocalClient();
    await localClient.from('facturacion_audit_log').insert({
      request_id: requestId,
      old_estado: oldEstado,
      new_estado: newEstado,
      actor: actor,
    });
  }

  // --- DASHBOARD ANALYTICS ---

  async getDashboardStats(userId: string, role?: string): Promise<DashboardStatsResponse> {
    console.log(`🔍 Consultando Dashboard para UserID: ${userId} (Role: ${role})`);

    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // --- CLIENTE LOCAL PARA DASHBOARD ---
    const { createClient } = require('@supabase/supabase-js');
    const localClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
    // ------------------------------------

    // CASO ADMIN: Ver todo globalmente
    if (role === 'admin') {
      console.log('👑 [Dashboard] Usuario es ADMIN, obteniendo estadísticas globales...');
      
      const { data: allRequests, error: globalError } = await localClient
        .from('facturacion_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (globalError) {
        console.error('❌ [Dashboard] Error obteniendo requests globales:', globalError);
        return this.getEmptyDashboard();
      }
      
      console.log(`👑 [Dashboard] Admin: ${allRequests?.length || 0} solicitudes encontradas.`);
      return this.calculateStatsFromRequests(allRequests || []);
    }

    // 1. Identificar Empresa (Caso Empresa)
    const { data: relations, error: relationError } = await localClient // Usamos localClient temporalmente
      .from('empresa_users')
      .select('empresa_id')
      .eq('user_id', userId);
    
    console.log(`📊 [Dashboard] Resultado consulta empresa_users (LocalClient):`, { 
      relations, 
      relationError,
      hayDatos: !!relations,
      cantidadRelaciones: relations?.length || 0,
      envKeyStart: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 5)
    });
    
    if (relationError) {
      console.error('❌ [Dashboard] Error buscando empresa_users:', relationError);
      return this.getEmptyDashboard();
    }
    
    // Tomamos la primera relación
    const relation = relations && relations.length > 0 ? relations[0] : null;

    if (!relation) {
      console.warn(`⚠️ [Dashboard] Usuario ${userId} no tiene empresa asociada - Relations:`, relations);
      return this.getEmptyDashboard();
    }

    const empresaId = relation.empresa_id;
    console.log(`✅ [Dashboard] Empresa encontrada: ${empresaId}`);

    // 2. Traer solicitudes
    const { data: requests, error } = await localClient
      .from('facturacion_requests')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching requests:', error);
        return this.getEmptyDashboard();
    }
    
    if (!requests || requests.length === 0) {
        console.warn(`ℹ️ La empresa ${empresaId} no tiene solicitudes registradas.`);
    } else {
        console.log(`📊 Encontradas ${requests.length} solicitudes.`);
    }

    // 3. Calcular
    return this.calculateStatsFromRequests(requests);
  }

  private getEmptyDashboard(): DashboardStatsResponse {
    return {
      summary: {
        totalFacturado: { value: 0, percentageChange: 0 },
        ahorroFiscal: { value: 0, percentageChange: 0 },
        facturasEmitidas: { value: 0, percentageChange: 0 },
        solicitudesActivas: { value: 0, percentageChange: 0 },
      },
      recentRequests: [],
      businessNetwork: { activePlatforms: 0, regions: 0, topPlatforms: [] },
      charts: { monthlyPerformance: [], weeklyTrend: [] },
    };
  }

  private calculateStatsFromRequests(requests: any[]): DashboardStatsResponse {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Mes anterior
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(currentMonth - 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    let currentMonthFacturado = 0;
    let lastMonthFacturado = 0;
    let currentMonthAhorro = 0;
    let lastMonthAhorro = 0;
    let currentMonthCount = 0;
    let lastMonthCount = 0;
    let activeCount = 0;

    const platformsSet = new Set<string>();
    const monthlyStats: Record<string, { facturado: number; ahorro: number }> =
      {};
    const platformCounts: Record<string, number> = {};

    requests.forEach((req) => {
      const date = new Date(req.created_at);
      const m = date.getMonth();
      const y = date.getFullYear();

      // Métricas financieras
      const monto = parseFloat(req.total_facturado || req.monto_solicitado || 0);
      const isd = parseFloat(req.isd_evitado || 0);

      // Current Month
      if (m === currentMonth && y === currentYear) {
        currentMonthFacturado += monto;
        currentMonthAhorro += isd;
        if (req.estado === 'INVOICED' || req.estado === 'COMPLETED' || req.estado === 'PAID') {
           currentMonthCount++;
        }
      }

      // Last Month
      if (m === lastMonth && y === lastMonthYear) {
        lastMonthFacturado += monto;
        lastMonthAhorro += isd;
        if (req.estado === 'INVOICED' || req.estado === 'COMPLETED' || req.estado === 'PAID') {
           lastMonthCount++;
        }
      }

      // Activas
      if (
        !['COMPLETED', 'ERROR', 'CANCELLED'].includes(req.estado)
      ) {
        activeCount++;
      }

      // Plataformas
      if (req.plataforma) {
        platformsSet.add(req.plataforma);
        platformCounts[req.plataforma] =
          (platformCounts[req.plataforma] || 0) + 1;
      }

      // Charts (Agrupar por mes string 'Ene', 'Feb')
      // Nota: Esto agrupa todos los años juntos si no cuidamos, idealmente usar 'Jan 2024'.
      // Usaremos key simple para el ejemplo
      const monthLabel = date.toLocaleString('es-ES', { month: 'short' });
      if (!monthlyStats[monthLabel])
        monthlyStats[monthLabel] = { facturado: 0, ahorro: 0 };
      monthlyStats[monthLabel].facturado += monto;
      monthlyStats[monthLabel].ahorro += isd;
    });

    const calcPct = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    const totalReqs = requests.length || 1;
    const topPlatforms = Object.entries(platformCounts)
      .map(([name, count]) => ({
        name,
        percentage: Math.round((count / totalReqs) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);

    // Convertir monthlyStats a array para gráfico
    const monthlyPerformance = Object.entries(monthlyStats).map(
      ([month, data]) => ({
        month,
        ...data,
      }),
    ).reverse(); // Recientes suelen estar arriba en foreach, asi que reverse para cronologico (aprox)

    // Mapeo seguro para el frontend
    const recentRequestsSafe = requests.slice(0, 5).map(req => ({
        id: req.id,
        plataforma: req.plataforma,
        monto: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado),
        estado: req.estado,
        fecha: req.created_at,
        // Campos legacy o raw por si acaso
        monto_solicitado: req.monto_solicitado,
        total_facturado: req.total_facturado,
        created_at: req.created_at
    }));

    return {
      summary: {
        totalFacturado: {
          value: currentMonthFacturado,
          percentageChange: calcPct(currentMonthFacturado, lastMonthFacturado),
        },
        ahorroFiscal: {
          value: currentMonthAhorro,
          percentageChange: calcPct(currentMonthAhorro, lastMonthAhorro),
        },
        facturasEmitidas: {
          value: currentMonthCount,
          percentageChange: calcPct(currentMonthCount, lastMonthCount),
        },
        solicitudesActivas: {
          value: activeCount,
          percentageChange: 0, // Placeholder
        },
      },
      recentRequests: recentRequestsSafe,
      businessNetwork: {
        activePlatforms: platformsSet.size,
        regions: 1, 
        topPlatforms,
      },
      charts: {
        monthlyPerformance,
        weeklyTrend: [],
      },
    };
  }

  // --- PDF GENERATION ---
  async generateInvoicePdf(requestId: string): Promise<Buffer> {
    const PDFDocument = require('pdfkit');
    const localClient = this.getLocalClient();
    
    // 1. Obtener datos
    const { data: request, error } = await localClient
      .from('facturacion_requests')
      .select('*, empresas(*)')
      .eq('id', requestId)
      .single();

    if (error || !request) {
        throw new NotFoundException('Factura no encontrada');
    }

    if (!request.total_facturado && request.estado !== FacturacionEstado.INVOICED && request.estado !== FacturacionEstado.PAID && request.estado !== FacturacionEstado.COMPLETED) {
        // Permitir descargar proforma o throw error?
        // Asumiremos que solo se descarga si ya se calculó o emitió
        if (request.estado === FacturacionEstado.REQUEST_CREATED) {
            throw new BadRequestException('La solicitud aún no ha sido procesada.');
        }
    }

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on('error', reject);

        // --- CONTENIDO PDF ---
        
        // Header
        doc.fontSize(20).text('AND - Factura Electrónica', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`ID Solicitud: ${request.id}`, { align: 'right' });
        doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, { align: 'right' });
        
        doc.moveDown();
        doc.text(`Estado: ${request.estado.toUpperCase()}`, { align: 'right' });

        doc.moveDown();
        
        // Datos Empresa
        doc.fontSize(14).text('Datos del Cliente:', { underline: true });
        doc.fontSize(10);
        doc.text(`Razón Social: ${request.empresas?.razon_social || 'N/A'}`);
        doc.text(`RUC: ${request.empresas?.ruc || 'N/A'}`);
        doc.text(`Dirección: ${request.empresas?.direccion || request.empresas?.ciudad || 'N/A'}`);
        doc.text(`Email: ${request.empresas?.correo || 'N/A'}`);

        doc.moveDown(2);

        // Tabla de Valores
        doc.fontSize(14).text('Detalle de Facturación:', { underline: true });
        doc.moveDown();

        const tableTop = doc.y;
        const itemX = 50;
        const amountX = 400;

        doc.fontSize(10);
        
        // Header Tabla
        doc.text('Concepto', itemX, tableTop, { bold: true });
        doc.text('Monto (USD)', amountX, tableTop, { bold: true });
        
        let y = tableTop + 20;
        
        // Rows
        const rows = [
            { label: 'Monto Solicitado (Recarga)', value: request.monto_solicitado },
            { label: 'Base Imponible', value: request.base_calculada },
            { label: 'IVA (12%)', value: request.iva },
            { label: 'Total Facturado', value: request.total_facturado }
        ];

        rows.forEach(row => {
            if (row.value) {
                doc.text(row.label, itemX, y);
                doc.text(`$ ${parseFloat(row.value.toString()).toFixed(2)}`, amountX, y);
                y += 20;
            }
        });

        // Footer
        doc.moveDown(4);
        doc.fontSize(8).text('Este documento es un comprobante generado automáticamente por la plataforma AND.', { align: 'center', color: 'grey' });

        doc.end();
    });
  }
}
