import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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
export class FacturacionController {
  constructor(private facturacionService: FacturacionService) {}

  @ApiOperation({
    summary: 'Crear solicitud de facturación',
    description: 'Empresa crea solicitud para facturar ingresos de una plataforma',
  })
  @ApiResponse({
    status: 201,
    description: 'Solicitud creada y calculada automáticamente',
    schema: {
      example: {
        id: '456f1234-e89b-12d3-a456-426614174001',
        empresa_id: '123e4567-e89b-12d3-a456-426614174000',
        plataforma: 'meta',
        monto_solicitado: 1500.5,
        base_calculada: 1339.93,
        iva: 160.79,
        isd_evitado: 75.03,
        total_facturado: 1500.5,
        estado: 'CALCULATED',
        created_at: '2026-01-17T10:30:00Z',
      },
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Post('request')
  createRequest(@Body() dto: CreateRequestDto, @GetUser() user: any) {
    return this.facturacionService.createRequest(dto, user.userId);
  }

  @ApiOperation({
    summary: 'Aprobar solicitud',
    description: 'Empresa aprueba su solicitud de facturación',
  })
  @ApiResponse({
    status: 200,
    description: 'Solicitud aprobada por cliente',
    schema: {
      example: {
        id: '456f1234-e89b-12d3-a456-426614174001',
        estado: 'APPROVED_BY_CLIENT',
      },
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Put('approve')
  approveRequest(@Body() dto: ApproveRequestDto, @GetUser() user: any) {
    return this.facturacionService.approveRequest(dto.requestId, user.userId);
  }

  @ApiOperation({
    summary: 'Mis solicitudes de facturación',
    description: 'Obtiene todas las solicitudes de facturación de la empresa del usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de solicitudes',
    isArray: true,
    schema: {
      example: [
        {
          id: '456f1234-e89b-12d3-a456-426614174001',
          plataforma: 'meta',
          monto_solicitado: 1500.5,
          estado: 'APPROVED_BY_CLIENT',
          created_at: '2026-01-17T10:30:00Z',
        },
      ],
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Get('mine')
  getMine(@GetUser() user: any) {
    return this.facturacionService.findByUserId(user.userId);
  }

  @ApiOperation({
    summary: 'Ver todas las solicitudes',
    description: 'Admin obtiene todas las solicitudes de facturación del sistema',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de todas las solicitudes',
    isArray: true,
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  getAll() {
    return this.facturacionService.findAll();
  }

  @ApiOperation({
    summary: 'Emitir factura',
    description: 'Admin emite la factura y marca como primera factura si aplica',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la solicitud',
    example: '456f1234-e89b-12d3-a456-426614174001',
  })
  @ApiResponse({
    status: 200,
    description: 'Factura emitida exitosamente',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id/invoice')
  invoice(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.invoiceRequest(id, user.userId);
  }

  @ApiOperation({
    summary: 'Marcar como pagado',
    description: 'Admin marca la factura como pagada',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la solicitud',
  })
  @ApiResponse({
    status: 200,
    description: 'Factura marcada como pagada',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id/paid')
  markAsPaid(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.markAsPaid(id, user.userId);
  }

  @ApiOperation({
    summary: 'Completar solicitud',
    description: 'Admin finaliza el proceso de facturación',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la solicitud',
  })
  @ApiResponse({
    status: 200,
    description: 'Solicitud completada',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id/complete')
  complete(@Param('id') id: string, @GetUser() user: any) {
    return this.facturacionService.completeRequest(id, user.userId);
  }
}
