import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum Plataforma {
  Meta = 'meta',
  Google = 'google',
  TikTok = 'tiktok',
  Otra = 'otro',
}

export enum FacturacionEstado {
  REQUEST_CREATED = 'REQUEST_CREATED',
  CALCULATED = 'CALCULATED',
  APPROVED_BY_CLIENT = 'APPROVED_BY_CLIENT',
  INVOICED = 'INVOICED', // Admin subió la factura
  PAID = 'PAID',         // Admin confirmó el pago
  COMPLETED = 'COMPLETED', // Admin ejecutó recarga
  ERROR = 'ERROR',
}

export class CreateRequestDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID de la empresa (Opcional si el usuario ya tiene empresa asignada)',
    required: false
  })
  @IsOptional()
  @IsUUID()
  empresaId?: string;

  @ApiProperty({
    enum: Plataforma,
    example: Plataforma.Meta,
    description: 'Plataforma de donde provienen los ingresos',
  })
  @IsEnum(Plataforma)
  plataforma: Plataforma;

  @ApiProperty({
    example: 25.0,
    description: 'Monto solicitado a facturar (USD)',
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  montoSolicitado: number;
}
