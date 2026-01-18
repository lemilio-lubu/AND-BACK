import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const testUsers = [
  {
    email: 'admin@and.dev',
    password: 'AdminAND123!@#',
    role: 'admin',
  },
  {
    email: 'empresa@and.dev',
    password: 'EmpresaAND123!@#',
    role: 'empresa',
  },
  {
    email: 'influencer@and.dev',
    password: 'InfluencerAND123!@#',
    role: 'influencer',
  },
];

const testCompany = {
  razonSocial: 'Tech Solutions S.A.C.',
  correoCorporativo: 'contacto@techsolutions.com',
  ruc: '20123456789',
  telefono: '+51987654321',
  ciudad: 'Lima',
};

async function cleanDatabase() {
  console.log('🧹 Limpiando base de datos...');

  try {
    await supabase.from('facturacion_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('facturacion_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('empresa_users').delete().neq('empresa_id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('empresas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('gamificacion_estado').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    for (const user of authUsers.users) {
      if (testUsers.some((tu) => tu.email === user.email)) {
        await supabase.auth.admin.deleteUser(user.id);
      }
    }

    console.log('✅ Base de datos limpia');
  } catch (error) {
    console.error('⚠️ Error limpiando base de datos:', error);
  }
}

async function seedDatabase() {
  console.log('🌱 Iniciando seed de datos...\n');

  const credentials: Array<{ email: string; password: string; role: string; userId: string }> = [];
  const createdUserIds: Record<string, string> = {};

  for (const testUser of testUsers) {
    try {
      console.log(`📝 Creando usuario: ${testUser.email}`);

      const { data, error } = await supabase.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        email_confirm: true,
      });

      if (error) throw error;

      const userId = data.user.id;
      createdUserIds[testUser.role] = userId;

      await supabase.from('users').insert({
        id: userId,
        role: testUser.role,
        is_new: testUser.role === 'empresa' ? true : false,
      });

      await supabase.from('gamificacion_estado').insert({
        user_id: userId,
        nivel: 'iniciando',
        puntos: 0,
        visible: testUser.role === 'empresa',
      });

      credentials.push({
        email: testUser.email,
        password: testUser.password,
        role: testUser.role,
        userId: userId,
      });

      console.log(`✅ Usuario creado: ${testUser.email}`);
    } catch (error) {
      console.error(`❌ Error creando usuario ${testUser.email}:`, error);
    }
  }

  console.log('\n📋 Creando empresa...');
  try {
    const { data: empresa, error } = await supabase
      .from('empresas')
      .insert({
        razon_social: testCompany.razonSocial,
        correo_corporativo: testCompany.correoCorporativo,
        ruc: testCompany.ruc,
        telefono: testCompany.telefono,
        ciudad: testCompany.ciudad,
        estado_tributario: 'pendiente',
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Empresa creada: ${empresa.id}`);

    console.log('\n🔗 Vinculando usuario con empresa...');
    const empresaUserId = createdUserIds['empresa'];

    await supabase.from('empresa_users').insert({
      empresa_id: empresa.id,
      user_id: empresaUserId,
      role_en_empresa: 'OWNER',
    });

    console.log(`✅ Usuario empresa vinculado`);

    console.log('\n💰 Creando solicitud de facturación de ejemplo...');

    const { data: request, error: requestError } = await supabase
      .from('facturacion_requests')
      .insert({
        empresa_id: empresa.id,
        plataforma: 'meta',
        monto_solicitado: 1500.5,
        estado: 'REQUEST_CREATED',
        created_by: empresaUserId,
      })
      .select()
      .single();

    if (requestError) throw requestError;

    const montoSolicitado = 1500.5;
    const baseCalculada = montoSolicitado / 1.12;
    const iva = baseCalculada * 0.12;
    const isd = montoSolicitado * 0.05;

    await supabase
      .from('facturacion_requests')
      .update({
        base_calculada: baseCalculada,
        iva: iva,
        isd_evitado: isd,
        total_facturado: montoSolicitado,
        estado: 'CALCULATED',
      })
      .eq('id', request.id);

    console.log(`✅ Solicitud de facturación creada: ${request.id}`);
  } catch (error) {
    console.error('❌ Error creando empresa:', error);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE 🎉');
  console.log('='.repeat(70) + '\n');

  console.log('📝 CREDENCIALES DE PRUEBA:\n');
  credentials.forEach((cred) => {
    console.log(`${cred.role.toUpperCase()}`);
    console.log(`  Email: ${cred.email}`);
    console.log(`  Contraseña: ${cred.password}`);
    console.log(`  ID: ${cred.userId}\n`);
  });

  console.log('🔐 PARA PROBAR LA API:\n');
  console.log('1. Inicia el servidor: npm run start:dev\n');
  console.log('2. Login para obtener token:');
  console.log('   POST /auth/login');
  console.log('   { "email": "admin@and.dev", "password": "AdminAND123!@#" }\n');
  console.log('3. Ir a http://localhost:3001/api/docs\n');
  console.log('4. Hacer clic en "Authorize" y pegar el JWT token\n');
  console.log('5. Probar endpoints (incluyendo POST /seed)\n');

  console.log('📊 DATOS CREADOS:\n');
  console.log(`✅ Usuarios: ${credentials.length}`);
  console.log(`✅ Empresa: 1 (Tech Solutions S.A.C.)`);
  console.log(`✅ Solicitud de facturación: 1 (estado: CALCULATED)`);
  console.log(`✅ Gamificación: ${credentials.length} registros\n`);

  console.log('💡 EJECUTAR SEED DESDE LA API:\n');
  console.log('POST /seed (protegido con JWT - solo ADMIN)\n');
  console.log('='.repeat(70));
}

async function main() {
  try {
    console.log('🚀 Iniciando seed...\n');
    await cleanDatabase();
    await seedDatabase();
    console.log('\n✨ ¡Listo para desarrollar!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
}

main();
