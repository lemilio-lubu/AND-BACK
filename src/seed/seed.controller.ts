import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecutar seed de datos',
    description: 'Limpia la base de datos y crea datos de prueba para desarrollo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Seed ejecutado exitosamente',
    schema: {
      example: {
        message: 'Seed completado exitosamente',
        credentials: [
          {
            email: 'admin@and.dev',
            password: 'AdminAND123!@#',
            role: 'admin',
            userId: 'uuid',
          },
        ],
        stats: {
          usuariosCreados: 3,
          empresasCreadas: 1,
          solicitudesFacturacion: 1,
          gamificacionRegistros: 3,
        },
      },
    },
  })
  async executeSeed(): Promise<any> {
    return await this.seedService.executeSeed();
  }
}
