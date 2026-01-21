import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GetUser } from './auth/decorators/get-user.decorator';
import { Roles } from './auth/decorators/roles.decorator';
import { UserRole } from './users/user.types';

@ApiTags('users')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Health check',
    description: 'Verifica que la API está en funcionamiento',
  })
  @ApiResponse({
    status: 200,
    description: 'API funcionando correctamente',
  })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener perfil del usuario',
    description: 'Retorna información del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Información del usuario',
    schema: {
      example: {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'empresa',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token inválido o expirado',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@GetUser() user: any) {
    console.log('🔐 [/me] Usuario del token JWT:', user);
    console.log('🔐 [/me] userId extraído:', user.userId);
    return this.appService.getProfile(user.userId);
  }

  @ApiOperation({
    summary: 'Debug: Verificar conexión Supabase',
    description: 'Endpoint de debug para verificar que Supabase funcione correctamente',
  })
  @Get('debug/supabase')
  async debugSupabase() {
    return this.appService.debugSupabase();
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lista de usuarios (solo admin)',
    description: 'Obtiene lista de todos los usuarios del sistema',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuarios',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado, solo admin',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/users')
  getAllUsers() {
    return { message: 'Lista de todos los usuarios (solo admin)' };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dashboard de facturación',
    description: 'Acceso exclusivo para empresas',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard de facturación',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado, solo empresas',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPRESA)
  @Get('billing')
  getBilling(@GetUser() user: any) {
    return { message: 'Facturación local', userId: user.userId };
  }
}
