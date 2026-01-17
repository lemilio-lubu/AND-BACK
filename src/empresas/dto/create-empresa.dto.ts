import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum EstadoTributario {
  PENDIENTE = 'pendiente',
  ACTIVO = 'activo',
  SUSPENDIDO = 'suspendido',
}

export class CreateEmpresaDto {
  @ApiProperty({
    example: 'Empresa S.A.C.',
    description: 'Razón social de la empresa',
  })
  @IsString()
  razonSocial: string;

  @ApiProperty({
    example: 'contacto@empresa.com',
    description: 'Correo corporativo',
  })
  @IsEmail()
  correoCorporativo: string;

  @ApiProperty({
    example: '20123456789',
    description: 'RUC de la empresa (único)',
  })
  @IsString()
  ruc: string;

  @ApiProperty({
    example: '+51987654321',
    description: 'Teléfono de contacto',
  })
  @IsString()
  telefono: string;

  @ApiProperty({
    example: 'Lima',
    description: 'Ciudad donde opera',
  })
  @IsString()
  ciudad: string;
}
