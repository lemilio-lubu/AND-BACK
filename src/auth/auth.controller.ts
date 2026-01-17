import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description: 'Crea un nuevo usuario con email, contraseña y rol',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
    schema: {
      example: {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwicm9sZSI6ImVtcHJlc2EifQ...',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Email inválido o datos incompletos',
  })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Autentica usuario y retorna JWT token',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
    schema: {
      example: {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwicm9sZSI6ImVtcHJlc2EifQ...',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
