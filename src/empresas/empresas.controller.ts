import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/user.types';

@ApiTags('empresas')
@ApiBearerAuth('JWT-auth')
@Controller('empresas')
export class EmpresasController {
  constructor(private empresasService: EmpresasService) {}

  @ApiOperation({
    summary: 'Crear empresa',
    description: 'Crea una nueva empresa y asocia al usuario autenticado como OWNER',
  })
  @ApiResponse({
    status: 201,
    description: 'Empresa creada exitosamente',
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        razon_social: 'Tech Solutions S.A.C.',
        correo_corporativo: 'contacto@techsolutions.com',
        ruc: '20123456789',
        telefono: '+51987654321',
        ciudad: 'Lima',
        estado_tributario: 'pendiente',
        created_at: '2026-01-17T10:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado, solo rol EMPRESA',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Post()
  create(@Body() dto: CreateEmpresaDto, @GetUser() user: any) {
    return this.empresasService.create(dto, user.userId);
  }

  @ApiOperation({
    summary: 'Obtener mi empresa',
    description: 'Retorna datos de la empresa asociada al usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Empresa encontrada',
    schema: {
      example: {
        empresa_id: '123e4567-e89b-12d3-a456-426614174000',
        empresas: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          razon_social: 'Tech Solutions S.A.C.',
          estado_tributario: 'pendiente',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no tiene empresa asociada',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Get('mine')
  getMine(@GetUser() user: any) {
    return this.empresasService.findByUserId(user.userId);
  }
}
