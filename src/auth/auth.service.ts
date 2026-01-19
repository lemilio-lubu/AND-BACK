import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { data, error } = await this.supabase.client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (error) throw error;

    console.log('✅ Usuario creado en auth.users:', data.user.id);

    const { error: userError } = await this.supabase.client.from('users').insert({
      id: data.user.id,
      role: dto.role,
      is_new: true,
    });

    // ✅ LOG: Ver qué error da
    if (userError) {
      console.error('❌ Error insertando en tabla users:', userError);
      await this.supabase.client.auth.admin.deleteUser(data.user.id);
      throw userError;
    }

    console.log('✅ Usuario creado en tabla users');

    const { error: gamError } = await this.supabase.client
      .from('gamificacion_estado')
      .insert({
        user_id: data.user.id,
        nivel: 'iniciando',
        puntos: 0,
        visible: true,
      });

    if (gamError) {
      console.error('❌ Error insertando gamificación:', gamError);
      await this.supabase.client.auth.admin.deleteUser(data.user.id);
      throw gamError;
    }

    console.log('✅ Gamificación creada');
    return this.signToken(data.user.id, dto.role);
  }

  async login(dto: LoginDto) {
    const { data, error } =
      await this.supabase.client.auth.signInWithPassword(dto);

    if (error || !data?.user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const { data: user, error: userError } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !user) {
      throw new UnauthorizedException('Usuario no encontrado en la base de datos');
    }

    return this.signToken(user.id, user.role);
  }

  // ✅ Refresh token - MEJORADO
  async refreshToken(refreshToken: string) {
    // ✅ VALIDACIÓN: Verificar que refresh_token no está vacío
    if (!refreshToken) {
      throw new BadRequestException('Refresh token requerido');
    }

    try {
      // ✅ SEGURIDAD: Usar variable de entorno, no default débil
      const refreshSecret = process.env.JWT_REFRESH_SECRET;
      if (!refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET no configurado');
      }

      const decoded = this.jwt.verify(refreshToken, {
        secret: refreshSecret,
      });

      const userId = decoded.sub;

      const { data: user, error } = await this.supabase.client
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error || !user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      return this.signToken(userId, user.role);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  private signToken(userId: string, role: string) {
    // ✅ SEGURIDAD: Validar que las variables de entorno existen
    const accessSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!accessSecret || !refreshSecret) {
      throw new Error(
        'JWT_SECRET y JWT_REFRESH_SECRET deben estar configurados',
      );
    }

    const accessToken = this.jwt.sign(
      {
        sub: userId,
        role,
      },
      {
        secret: accessSecret,
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwt.sign(
      {
        sub: userId,
      },
      {
        secret: refreshSecret,
        expiresIn: '7d',
      },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }
}
