import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../users/user.types';

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

    // Crear usuario en tabla users
    await this.supabase.client.from('users').insert({
      id: data.user.id,
      role: dto.role,
      is_new: true,
    });

    // Inicializar gamificación
    await this.supabase.client.from('gamificacion_estado').insert({
      user_id: data.user.id,
      nivel: 'iniciando',
      puntos: 0,
      visible: true,
    });

    return this.signToken(data.user.id, dto.role);
  }

  async login(dto: LoginDto) {
    const { data, error } =
      await this.supabase.client.auth.signInWithPassword(dto);

    if (error) throw new UnauthorizedException();

    const { data: user } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return this.signToken(user.id, user.role);
  }

  private signToken(userId: string, role: string) {
    return {
      access_token: this.jwt.sign({
        sub: userId,
        role,
      }),
    };
  }
}
