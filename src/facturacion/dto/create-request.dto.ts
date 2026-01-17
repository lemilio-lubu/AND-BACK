import { IsEnum, IsNumber, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum Plataforma {
  META = 'meta',
  TIKTOK = 'tiktok',
  GOOGLE = 'google',
  OTRO = 'otro',
}

export enum FacturacionEstado {
  REQUEST_CREATED = 'REQUEST_CREATED',
  CALCULATED = 'CALCULATED',
  APPROVED_BY_CLIENT = 'APPROVED_BY_CLIENT',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export class CreateRequestDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID de la empresa',
  })
  @IsUUID()
  empresaId: string;

  @ApiProperty({
    enum: Plataforma,
    example: Plataforma.META,
    description: 'Plataforma de donde provienen los ingresos',
  })
  @IsEnum(Plataforma)
  plataforma: Plataforma;

  @ApiProperty({
    example: 1500.5,
    description: 'Monto solicitado a facturar',
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  montoSolicitado: number;
}
