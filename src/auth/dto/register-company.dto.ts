import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterCompanyDto {
  @ApiProperty({
    example: 'Tech Solutions S.A.C.',
    description: 'Razón social de la empresa',
  })
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @ApiProperty({
    example: 'contacto@empresa.com',
    description: 'Correo corporativo (será usado para login)',
  })
  @IsEmail()
  correoCorporativo: string;

  @ApiProperty({
    example: '20123456789',
    description: 'RUC / Identificación Fiscal',
  })
  @IsString()
  @IsNotEmpty()
  ruc: string;

  @ApiProperty({
    example: '+593 99 999 9999',
    description: 'Teléfono de contacto',
  })
  @IsString()
  @IsNotEmpty()
  telefono: string;

  @ApiProperty({
    example: 'Quito',
    description: 'Ciudad',
  })
  @IsString()
  @IsNotEmpty()
  ciudad: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña para la cuenta',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;
}
