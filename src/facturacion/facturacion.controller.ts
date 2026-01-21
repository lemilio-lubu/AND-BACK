import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Patch,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FacturacionService } from './facturacion.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/user.types';

@ApiTags('facturacion')
@ApiBearerAuth('JWT-auth')
@Controller('facturacion')
@UseGuards(JwtAuthGuard, RolesGuard) // Global Guard
export class FacturacionController {
  constructor(private facturacionService: FacturacionService) {}

  // --- DASHBOARD ---
  @ApiOperation({ summary: 'Obtener métricas para Dashboard' })
  @ApiResponse({ status: 200, description: 'Datos del dashboard' })
  @Roles(UserRole.EMPRESA, UserRole.ADMIN)
  @Get('dashboard')
  getDashboard(@GetUser() user: any) {
    return this.facturacionService.getDashboardStats(user.userId, user.role);
  }

  // --- EMPRESA ---

  @ApiOperation({ summary: '1. Empresa envía solicitud' })
  @ApiResponse({ status: 201, description: 'Solicitud creada' })
  @Roles(UserRole.EMPRESA)
  @Post()
  createRequest(@Body() dto: CreateRequestDto, @GetUser() user: any) {
    return this.facturacionService.createRequest(dto, user.userId);
  }

  @ApiOperation({ summary: 'Listar mis solicitudes' })
  @ApiResponse({ status: 200, isArray: true })
  @Roles(UserRole.EMPRESA, UserRole.ADMIN)
  @Get('mine')
  getMyRequests(@GetUser() user: any) {
    if (user.role === UserRole.ADMIN) {
      return this.facturacionService.findAll();
    }
    return this.facturacionService.findByUserId(user.userId);
  }

  @ApiOperation({ summary: '3. Empresa aprueba el valor calculado' })
  @ApiResponse({ status: 200, description: 'Aprobado por cliente' })
  @Roles(UserRole.EMPRESA)
  @Patch(':id/approve')
  approveRequest(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.approveRequest(id, user.userId);
  }

  @ApiOperation({ summary: '5. Empresa realiza el pago' })
  @ApiResponse({ status: 200, description: 'Pagado' })
  @Roles(UserRole.EMPRESA)
  @Patch(':id/pay')
  payRequest(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.payRequest(id, user.userId);
  }

  // --- ADMIN ---

  @ApiOperation({ summary: 'Listar todas las solicitudes (Admin)' })
  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  getAllRequests() {
    return this.facturacionService.findAll();
  }

  @ApiOperation({ summary: '2. Admin calcula y envía (simulado con calculate)' })
  @Patch(':id/calculate')
  @Roles(UserRole.ADMIN)
  calculateRequest(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.calculateRequest(id);
  }

  @ApiOperation({ summary: '4. Admin emite factura' })
  @Patch(':id/emit-invoice')
  @Roles(UserRole.ADMIN)
  emitInvoice(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.emitInvoice(id, user.userId);
  }

  @ApiOperation({ summary: '5. Admin confirma pago recibido' })
  @Patch(':id/confirm-payment')
  @Roles(UserRole.ADMIN)
  confirmPayment(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.confirmPayment(id, user.userId);
  }

  @ApiOperation({ summary: '6. Admin completa la recarga y finaliza orden' })
  @Patch(':id/complete')
  @Roles(UserRole.ADMIN)
  completeOrder(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.completeOrder(id, user.userId);
  }

  @ApiOperation({ summary: 'Descargar Factura PDF' })
  @Roles(UserRole.EMPRESA, UserRole.ADMIN)
  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
      const buffer = await this.facturacionService.generateInvoicePdf(id);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factura-${id}.pdf"`,
        'Content-Length': buffer.length,
      });

      res.end(buffer);
  }
}
