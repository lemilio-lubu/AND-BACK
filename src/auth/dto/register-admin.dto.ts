import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterAdminDto {
  @ApiProperty({
    example: 'Admin Name',
    description: 'Nombre completo del administrador',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    example: 'admin@and.com',
    description: 'Correo administrativo',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Código autorizado',
    description: 'Código de seguridad para permitir el registro de administradores',
  })
  @IsString()
  @IsNotEmpty()
  adminSecret: string;

  @ApiProperty({
    example: 'password_seguro',
    description: 'Contraseña',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;
}
