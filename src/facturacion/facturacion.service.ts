import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateRequestDto, FacturacionEstado } from './dto/create-request.dto';
import { DashboardStatsResponse } from './dto/dashboard-stats.dto';
import { GamificacionService } from '../gamificacion/gamificacion.service';
import { SocketService } from '../socket/socket.service';

@Injectable()
export class FacturacionService {
  constructor(
    private supabase: SupabaseService,
    private gamificacion: GamificacionService,
    private configService: ConfigService,
    private socketService: SocketService,
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

    // 🔔 Notificar a Admins
    this.socketService.notifyAdmins('billing:new-request', data);

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


    // Nuevo cálculo según imagen:
    // Costo Base: monto solicitado
    // ISD: 0
    // IVA: 15% del monto solicitado
    // Inversión Neta: monto solicitado + IVA
    const montoSolicitado = parseFloat(request.monto_solicitado);
    const baseCalculada = montoSolicitado;
    const isd = 0;
    const iva = montoSolicitado * 0.15;
    const totalFacturado = montoSolicitado + iva;

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
      iva: req.iva ? parseFloat(req.iva) : req.monto_solicitado * 0.15,
      isd: 0,
      inversion_neta: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado) * 1.15,
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

    return data.map(req => ({
      ...req,
      monto: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado),
      iva: req.iva ? parseFloat(req.iva) : req.monto_solicitado * 0.15,
      isd: 0,
      inversion_neta: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado) * 1.15,
      fecha: req.created_at
    }));
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

    // 🔔 Notificaciones
    // 1. Al dueño de la solicitud
    if (data.created_by) {
      this.socketService.notifyUser(data.created_by, 'billing:status-changed', data);
    }
    // 2. A todos los admins (para actualizar tablas en tiempo real)
    this.socketService.notifyAdmins('billing:update', data);

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
      const isd = 0;

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
        iva: req.iva ? parseFloat(req.iva) : req.monto_solicitado * 0.15,
        isd: 0,
        inversion_neta: req.total_facturado ? parseFloat(req.total_facturado) : parseFloat(req.monto_solicitado) * 1.15,
        estado: req.estado,
        fecha: req.created_at,
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

    // Traer request y empresa
    const { data: request, error } = await localClient
      .from('facturacion_requests')
      .select('*, empresas(*)')
      .eq('id', requestId)
      .single();

    // Traer correo real del usuario creador desde auth.users
    let userEmail = null;
    if (request?.created_by) {
      // Consulta a la vista pública user_emails (debes crearla en tu DB)
      const { data: userEmailData } = await localClient
        .from('user_emails')
        .select('email')
        .eq('id', request.created_by)
        .single();
      userEmail = userEmailData?.email || null;
    }

    if (error || !request) {
      throw new NotFoundException('Factura no encontrada');
    }

    if (
      !request.total_facturado &&
      request.estado !== FacturacionEstado.INVOICED &&
      request.estado !== FacturacionEstado.PAID &&
      request.estado !== FacturacionEstado.COMPLETED
    ) {
      if (request.estado === FacturacionEstado.REQUEST_CREATED) {
        throw new BadRequestException('La solicitud aún no ha sido procesada.');
      }
    }

    const formatCurrency = (v: any) => {
      const n = parseFloat(v || 0);
      return `$ ${n.toFixed(2)}`;
    };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 48;
      let yCursor = margin;

      // --- MARCA DE AGUA (encapsulada para no afectar el resto) ---
      try {
        doc.save();
        doc.opacity(0.08);
        doc.font('Helvetica-Bold');
        doc.fontSize(80);
        doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] });
        doc.text('AND', pageWidth / 2 - 200, pageHeight / 2 - 40, { align: 'center' });
        doc.rotate(45, { origin: [pageWidth / 2, pageHeight / 2] });
        doc.restore();
      } catch (e) {
        // In case opacity/rotate not available, ignore watermark error
      }

      // --- HEADER corporativo ---
      // Logo box
      doc.save();
      doc.rect(margin, yCursor, 120, 48).fill('#0b3d91');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text('AND', margin + 12, yCursor + 10);
      doc.font('Helvetica').fontSize(8).text('Advanced Network & Delivery', margin + 12, yCursor + 32);
      doc.restore();

      // Invoice meta (right)
      // Ajuste: bloque meta separado del borde derecho
      const metaBlockWidth = 280;
      const rightX = pageWidth - margin - metaBlockWidth;
      doc.font('Helvetica-Bold').fillColor('black').fontSize(18).text('FACTURA', rightX, yCursor + 6, { width: metaBlockWidth, align: 'right' });
      doc.font('Helvetica').fontSize(9).text(`N°: ${request.id}`, rightX, yCursor + 30, { width: metaBlockWidth, align: 'right' });
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, rightX, yCursor + 44, { width: metaBlockWidth, align: 'right' });
      doc.text(`Estado: ${request.estado}`, rightX, yCursor + 58, { width: metaBlockWidth, align: 'right' });

      yCursor += 80;

      // --- Cliente / Empresa ---
      doc.font('Helvetica-Bold').fontSize(11).fillColor('black').text('Facturar a:', margin, yCursor);
      doc.font('Helvetica').fontSize(10).text(`${request.empresas?.razon_social || 'N/A'}`, margin, yCursor + 18);
      doc.text(`RUC: ${request.empresas?.ruc || 'N/A'}`, margin, yCursor + 34);
      doc.text(`Dirección: ${request.empresas?.direccion || request.empresas?.ciudad || 'N/A'}`, margin, yCursor + 50);
      doc.text(`Email: ${userEmail || request.empresas?.correo || 'N/A'}`, margin, yCursor + 66);

      // Company info block on right
      doc.font('Helvetica-Bold').fontSize(9).text('AND CORPORATE', pageWidth - margin - 180, yCursor);
      doc.font('Helvetica').fontSize(8).text('Av. Corporativa 1234, Lima, Perú', pageWidth - margin - 180, yCursor + 16);
      doc.text('contacto@and.company | +51 1 234 5678', pageWidth - margin - 180, yCursor + 30);

      yCursor += 110;

      // Line separator
      doc.moveTo(margin, yCursor - 8).lineTo(pageWidth - margin, yCursor - 8).stroke('#eeeeee');

      // --- Tabla de conceptos ---
      // Siguiendo layout sugerido: columnas numéricas con ancho fijo para garantizar alineación
      const contentWidth = pageWidth - margin * 2;
      const colWidth = 70;
      const gap = 10;

      // Posiciones X calculadas de derecha a izquierda
      const totalX = pageWidth - margin - colWidth;
      const priceX = totalX - colWidth - gap;
      const qtyX = priceX - colWidth - gap;

      // Descripción ocupa el resto
      const itemX = margin;
      const descWidth = qtyX - itemX - gap;

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Descripción', itemX, yCursor);
      doc.text('Monto', qtyX, yCursor, { width: colWidth, align: 'right' });
      doc.text('Impuesto', priceX, yCursor, { width: colWidth, align: 'right' });
      doc.text('Total', totalX, yCursor, { width: colWidth, align: 'right' });

      yCursor += 22;
      doc.moveTo(margin, yCursor - 6).lineTo(pageWidth - margin, yCursor - 6).stroke('#cccccc');

      doc.font('Helvetica').fontSize(10);

      const rows = [
        { label: 'Monto Solicitado (Recarga)', value: request.monto_solicitado || 0 },
        { label: 'Base Imponible', value: request.base_calculada || 0 },
        { label: 'IVA (15%)', value: request.iva || 0 },
      ];

      function ensureSpace(requiredHeight = 36) {
        const footerReserve = 140;
        if (yCursor + requiredHeight > pageHeight - margin - footerReserve) {
          doc.addPage();
          yCursor = margin;
          // Re-draw header on new page minimal (logo + title area)
          doc.font('Helvetica-Bold').fontSize(16).text('FACTURA (continuación)', margin, yCursor);
          yCursor += 24;
        }
      }

      rows.forEach((row) => {
        // Preparar opciones para descripción y medir altura
        const descOptions = { width: descWidth, align: 'left' };
        doc.font('Helvetica').fontSize(10);
        const descHeight = doc.heightOfString(String(row.label), descOptions);
        const lineHeight = 18;
        const rowHeight = Math.max(descHeight, lineHeight);

        // Asegurar espacio según altura dinámica
        ensureSpace(rowHeight + 10);

        // Escribir campos
        doc.text(row.label, itemX, yCursor, descOptions);
        doc.text(formatCurrency(row.value), qtyX, yCursor, { width: colWidth, align: 'right' });
        if (row.label.includes('IVA')) {
          doc.text(formatCurrency(row.value), priceX, yCursor, { width: colWidth, align: 'right' });
        } else {
          doc.text('-', priceX, yCursor, { width: colWidth, align: 'right' });
        }
        doc.text(formatCurrency(row.value), totalX, yCursor, { width: colWidth, align: 'right' });

        // Avanzar cursor (alto dinámico + padding)
        yCursor += rowHeight + 10;
      });

      // Totales block (right)
      ensureSpace(80);
      const totalsBlockWidth = 200;
      const totalsX = pageWidth - margin - totalsBlockWidth;
      const totalsY = yCursor + 8;

      doc.save();
      doc.rect(totalsX, totalsY - 6, totalsBlockWidth, 40).fill('#0b3d91');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text('TOTAL', totalsX + 12, totalsY, { align: 'left' });
      doc.font('Helvetica-Bold').fontSize(12).text(formatCurrency(request.total_facturado || request.monto_solicitado || 0), totalsX + 12, totalsY + 18, { align: 'left' });
      doc.restore();

      yCursor = totalsY + 60;

      // --- Notas / Pie ---
      ensureSpace(6);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('black').text('Notas:', margin, yCursor);
      doc.font('Helvetica').fontSize(8).text('Esta factura fue generada por AND. Conserva este comprobante para efectos contables.', margin, yCursor + 16, {
        width: pageWidth - margin * 2 - 20,
      });

      yCursor += 60;
      doc.fontSize(9).text('__________________________', pageWidth - margin - 220, yCursor);
      doc.text('Firma Autorizada', pageWidth - margin - 180, yCursor + 14);

      // Small legal footer
      doc.fontSize(7).fillColor('grey').text('AND © ' + new Date().getFullYear() + ' • Documento generado electrónicamente.', margin, pageHeight - margin - 20, { align: 'center', width: pageWidth - margin * 2 });

      doc.end();
    });
  }
}
