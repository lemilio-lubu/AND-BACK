import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/user.types';

export class RegisterDto {
  @ApiProperty({
    example: 'usuario@empresa.com',
    description: 'Email del usuario',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña',
    minLength: 6,
  })
  @IsString()
  password: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.EMPRESA,
    description: 'Rol del usuario',
  })
  @IsEnum(UserRole)
  role: UserRole;
}
