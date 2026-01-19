import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface SeedCredentials {
  email: string;
  password: string;
  role: string;
  userId: string;
}

// ✅ USUARIOS (Admin + 3 Empresas)
const testUsers = [
  {
    email: 'admin@and.ec',
    password: 'AdminAND123!@#',
    role: 'admin',
    label: 'Admin AND',
  },
  {
    email: 'empresa1@techsolutions.ec',
    password: 'Empresa123!@#',
    role: 'empresa',
    label: 'Tech Solutions',
  },
  {
    email: 'empresa2@marketingcorp.ec',
    password: 'Empresa123!@#',
    role: 'empresa',
    label: 'Marketing Corp',
  },
  {
    email: 'empresa3@startupx.ec',
    password: 'Empresa123!@#',
    role: 'empresa',
    label: 'Startup X',
  },
];

// ✅ EMPRESAS (RUC ecuatoriano válido: 10 dígitos + 001)
const testCompanies = [
  {
    key: 'TECH',
    razonSocial: 'Tech Solutions S.A.',
    correo: 'facturacion@techsolutions.ec',
    ruc: '0912345678001',
    telefono: '+593987654321',
    ciudad: 'Quito',
    userEmail: 'empresa1@techsolutions.ec',
  },
  {
    key: 'MARKETING',
    razonSocial: 'Marketing Corp S.A.',
    correo: 'pagos@marketingcorp.ec',
    ruc: '0923456789001',
    telefono: '+593987654322',
    ciudad: 'Guayaquil',
    userEmail: 'empresa2@marketingcorp.ec',
  },
  {
    key: 'STARTUP',
    razonSocial: 'Startup X E.I.R.L.',
    correo: 'admin@startupx.ec',
    ruc: '0934567890001',
    telefono: '+593987654323',
    ciudad: 'Ambato',
    userEmail: 'empresa3@startupx.ec',
  },
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(private readonly supabase: SupabaseService) {}

  async executeSeed() {
    this.logger.log('🌱 Iniciando seed de datos...');

    try {
      await this.cleanDatabase();
      return await this.seedDatabase();
    } catch (error) {
      this.logger.error('❌ Error en seed:', error);
      throw error;
    }
  }

  private async cleanDatabase() {
    this.logger.log('🧹 Limpiando base de datos...');

    const client = this.supabase.getClient();

    try {
      // Eliminar registros en orden de dependencias
      await client.from('facturacion_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('facturacion_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('empresa_users').delete().neq('empresa_id', '00000000-0000-0000-0000-000000000000');
      await client.from('empresas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await client.from('gamificacion_estado').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
      await client.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Eliminar usuarios de auth
      const { data: authUsers } = await client.auth.admin.listUsers();
      for (const user of authUsers.users) {
        if (testUsers.some((tu) => tu.email === user.email)) {
          await client.auth.admin.deleteUser(user.id);
        }
      }

      this.logger.log('✅ Base de datos limpia');
    } catch (error) {
      this.logger.warn('⚠️ Error limpiando base de datos:', error);
    }
  }

  private async seedDatabase() {
    const client = this.supabase.getClient();
    const credentials: SeedCredentials[] = [];
    const createdUserIds: Record<string, string> = {};

    // ===== PASO 1: Crear usuarios =====
    this.logger.log('\n📝 Creando usuarios...');
    for (const testUser of testUsers) {
      try {
        // 1. Crear en auth
        const { data, error } = await client.auth.admin.createUser({
          email: testUser.email,
          password: testUser.password,
          email_confirm: true,
        });

        if (error) throw error;

        const userId = data.user.id;
        createdUserIds[testUser.email] = userId;

        // 2. Crear en tabla users
        const { error: userError } = await client.from('users').insert({
          id: userId,
          role: testUser.role,
          is_new: testUser.role === 'empresa',
        });

        if (userError) throw userError;

        // 3. Inicializar gamificación
        const { error: gamError } = await client
          .from('gamificacion_estado')
          .insert({
            user_id: userId,
            nivel: 'iniciando',
            puntos: 0,
            visible: testUser.role === 'empresa',
          });

        if (gamError) throw gamError;

        credentials.push({
          email: testUser.email,
          password: testUser.password,
          role: testUser.role,
          userId: userId,
        });

        this.logger.log(`✅ Usuario creado: ${testUser.email} (${testUser.label})`);
      } catch (error) {
        this.logger.error(`❌ Error creando usuario ${testUser.email}:`, error);
      }
    }

    // ===== PASO 2: Crear empresas =====
    this.logger.log('\n🏢 Creando empresas...');
    const empresasCreadas: Record<string, string> = {};

    for (const company of testCompanies) {
      try {
        const { data: empresa, error } = await client
          .from('empresas')
          .insert({
            razon_social: company.razonSocial,
            correo_corporativo: company.correo,
            ruc: company.ruc,
            telefono: company.telefono,
            ciudad: company.ciudad,
            estado_tributario: 'pendiente',
          })
          .select()
          .single();

        if (error) throw error;

        empresasCreadas[company.key] = empresa.id;

        // Vincular usuario con empresa
        const userId = createdUserIds[company.userEmail];
        if (userId) {
          await client.from('empresa_users').insert({
            empresa_id: empresa.id,
            user_id: userId,
            role_en_empresa: 'OWNER',
          });
        }

        this.logger.log(`✅ Empresa creada: ${company.razonSocial} (RUC: ${company.ruc})`);
      } catch (error) {
        this.logger.error(`❌ Error creando empresa ${company.razonSocial}:`, error);
      }
    }

    // ===== PASO 3: Crear solicitudes en diferentes estados =====
    this.logger.log('\n💰 Creando solicitudes de facturación...');

    let requestCount = 0;

    // EMPRESA TECH: REQUEST_CREATED
    try {
      const empresaId = empresasCreadas['TECH'];
      const userId = createdUserIds['empresa1@techsolutions.ec'];

      if (empresaId && userId) {
        const { error } = await client.from('facturacion_requests').insert({
          empresa_id: empresaId,
          plataforma: 'Meta',
          monto_solicitado: 1200,
          estado: 'REQUEST_CREATED',
          created_by: userId,
        });

        if (error) throw error;
        requestCount++;
        this.logger.log(`✅ Solicitud 1: TECH - REQUEST_CREATED (Meta, S/ 1200)`);
      }
    } catch (error) {
      this.logger.error('❌ Error creando solicitud TECH:', error);
    }

    // EMPRESA MARKETING: CALCULATED
    try {
      const empresaId = empresasCreadas['MARKETING'];
      const userId = createdUserIds['empresa2@marketingcorp.ec'];
      const monto = 2000;

      if (empresaId && userId) {
        const baseCalculada = monto / 1.12;
        const iva = baseCalculada * 0.12;
        const isd = monto * 0.05;

        const { error } = await client.from('facturacion_requests').insert({
          empresa_id: empresaId,
          plataforma: 'Google',
          monto_solicitado: monto,
          base_calculada: baseCalculada,
          iva: iva,
          isd_evitado: isd,
          total_facturado: monto,
          estado: 'CALCULATED',
          created_by: userId,
        });

        if (error) throw error;
        requestCount++;
        this.logger.log(`✅ Solicitud 2: MARKETING - CALCULATED (Google, S/ 2000)`);
      }
    } catch (error) {
      this.logger.error('❌ Error creando solicitud MARKETING:', error);
    }

    // EMPRESA STARTUP: APPROVED_BY_CLIENT
    try {
      const empresaId = empresasCreadas['STARTUP'];
      const userId = createdUserIds['empresa3@startupx.ec'];
      const monto = 1500;

      if (empresaId && userId) {
        const baseCalculada = monto / 1.12;
        const iva = baseCalculada * 0.12;
        const isd = monto * 0.05;

        const { error } = await client.from('facturacion_requests').insert({
          empresa_id: empresaId,
          plataforma: 'TikTok',
          monto_solicitado: monto,
          base_calculada: baseCalculada,
          iva: iva,
          isd_evitado: isd,
          total_facturado: monto,
          estado: 'APPROVED_BY_CLIENT',
          created_by: userId,
        });

        if (error) throw error;
        requestCount++;
        this.logger.log(`✅ Solicitud 3: STARTUP - APPROVED_BY_CLIENT (TikTok, S/ 1500)`);
      }
    } catch (error) {
      this.logger.error('❌ Error creando solicitud STARTUP:', error);
    }

    // ===== RESUMEN FINAL =====
    this.logger.log('\n' + '='.repeat(70));
    this.logger.log('🎉 SEED COMPLETADO EXITOSAMENTE 🎉');
    this.logger.log('='.repeat(70) + '\n');

    this.logger.log('📝 CREDENCIALES (LOGIN):');
    this.logger.log('\n🔐 ADMIN (ve todas las solicitudes)');
    this.logger.log('  Email: admin@and.ec');
    this.logger.log('  Password: AdminAND123!@#\n');

    this.logger.log('🏢 EMPRESA 1 - Tech Solutions');
    this.logger.log('  Email: empresa1@techsolutions.ec');
    this.logger.log('  Password: Empresa123!@#');
    this.logger.log('  RUC: 0912345678001\n');

    this.logger.log('🏢 EMPRESA 2 - Marketing Corp');
    this.logger.log('  Email: empresa2@marketingcorp.ec');
    this.logger.log('  Password: Empresa123!@#');
    this.logger.log('  RUC: 0923456789001\n');

    this.logger.log('🏢 EMPRESA 3 - Startup X');
    this.logger.log('  Email: empresa3@startupx.ec');
    this.logger.log('  Password: Empresa123!@#');
    this.logger.log('  RUC: 0934567890001\n');

    this.logger.log('📊 DATOS CREADOS:');
    this.logger.log(`  ✅ Usuarios: ${credentials.length}`);
    this.logger.log(`  ✅ Empresas: ${Object.keys(empresasCreadas).length}`);
    this.logger.log(`  ✅ Solicitudes: ${requestCount}\n`);

    this.logger.log('='.repeat(70));

    return {
      message: 'Seed completado exitosamente',
      credentials,
      stats: {
        usuariosCreados: credentials.length,
        empresasCreadas: Object.keys(empresasCreadas).length,
        solicitudesFacturacion: requestCount,
        gamificacionRegistros: credentials.length,
      },
    };
  }
}
