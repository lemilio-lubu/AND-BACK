import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { UserRole } from '../users/user.types';

import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    private jwt: JwtService,
  ) {}

  async changePassword(userId: string, dto: ChangePasswordDto) {
    // Si se envía currentPassword, idealmente deberíamos re-autenticar para validar
    // Con Supabase Admin API no hay método directo para validar password sin hacer signIn
    // Pero como ya tenemos el userId del token validado por el Guard, asumimos que es el usuario.
    // Si queremos ser estrictos con la verificación de currentPassword:
    
    if (dto.currentPassword) {
      // Necesitamos el email para hacer signInWithPassword
      const { data: userData, error: userError } = await this.supabase.client.auth.admin.getUserById(userId);
      if (userError || !userData.user?.email) {
         throw new BadRequestException('No se pudo verificar el usuario');
      }

      const { error: signInError } = await this.supabase.client.auth.signInWithPassword({
        email: userData.user.email,
        password: dto.currentPassword,
      });

      if (signInError) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }
    }

    // Actualizar contraseña
    const { error: updateError } = await this.supabase.client.auth.admin.updateUserById(
      userId,
      { password: dto.newPassword }
    );

    if (updateError) {
      throw new BadRequestException('Error al actualizar la contraseña: ' + updateError.message);
    }

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async registerAdmin(dto: RegisterAdminDto) {
    // 1. Validar código secreto
    // NOTA: En producción, esto debe venir estrictamente de variables de entorno
    const VALID_SECRET = process.env.ADMIN_SECRET_KEY || 'AND_ADMIN_2026';
    
    // Comparación simple
    if (dto.adminSecret !== VALID_SECRET) {
      throw new UnauthorizedException('Código de acceso administrativo inválido');
    }

    // 2. Crear usuario en Auth
    const { data: authData, error: authError } = await this.supabase.client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.fullName }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        throw new ConflictException('El correo electrónico ya está registrado.');
      }
      throw new BadRequestException(authError.message);
    }

    const userId = authData.user.id;
    console.log('✅ Admin Auth creado:', userId);

    try {
      // 3. Insertar en tabla users con rol ADMIN
      const { error: userError } = await this.supabase.client.from('users').insert({
        id: userId,
        role: UserRole.ADMIN,
        is_new: false,
      });

      if (userError) throw userError;

      // 4. Retornar tokens
      const tokens = this.signToken(userId, UserRole.ADMIN);

      return {
        message: 'Administrador registrado exitosamente',
        user: authData.user,
        ...tokens
      };

    } catch (error) {
      console.error('❌ Rolling back admin creation:', error);
      await this.supabase.client.auth.admin.deleteUser(userId);
      throw error;
    }
  }

  async registerCompany(dto: RegisterCompanyDto) {
    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await this.supabase.client.auth.admin.createUser({
      email: dto.correoCorporativo,
      password: dto.password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        throw new ConflictException('El correo electrónico ya está registrado.');
      }
      throw new BadRequestException(authError.message);
    }

    const userId = authData.user.id;
    console.log('✅ Usuario auth creado (Company Owner):', userId);

    try {
      // 2. Insertar en tabla users
      const { error: userError } = await this.supabase.client.from('users').insert({
        id: userId,
        role: UserRole.EMPRESA,
        is_new: true,
      });
      if (userError) throw userError;

      // 3. Crear empresa
      const { data: empresa, error: empresaError } = await this.supabase.client
        .from('empresas')
        .insert({
          razon_social: dto.razonSocial,
          correo_corporativo: dto.correoCorporativo,
          ruc: dto.ruc,
          telefono: dto.telefono,
          ciudad: dto.ciudad,
          estado_tributario: 'pendiente',
        })
        .select()
        .single();
      
      if (empresaError) {
        if (empresaError.code === '23505') { // Código de error Supabase para unique_violation
          throw new ConflictException('El RUC o correo de la empresa ya están registrados.');
        }
        throw empresaError;
      }

      // 4. Vincular owner
      const { error: relationError } = await this.supabase.client
        .from('empresa_users')
        .insert({
          empresa_id: empresa.id,
          user_id: userId,
          role_en_empresa: 'OWNER',
        });
        
      if (relationError) throw relationError;

       // 5. Init Gamificacion
       await this.supabase.client
        .from('gamificacion_estado')
        .insert({
          user_id: userId,
          nivel: 'iniciando',
          puntos: 0,
          visible: true,
        });
      
      const tokens = this.signToken(userId, UserRole.EMPRESA);

      return { 
        message: 'Empresa y usuario registrados exitosamente', 
        user: authData.user,
        empresa: empresa,
        ...tokens
      };

    } catch (error) {
       console.error('❌ Rolling back company user creation:', error);
       await this.supabase.client.auth.admin.deleteUser(userId);
       throw error;
    }
  }

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
