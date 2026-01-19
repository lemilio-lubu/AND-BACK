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

const testCompanies = [
  { razonSocial: 'Tech Solutions S.A.C.', correo: 'contacto@techsolutions.com', ruc: '20123456789', telefono: '+51987654321', ciudad: 'Lima' },
  { razonSocial: 'Digital Marketing Pro', correo: 'info@digimarket.com', ruc: '20234567890', telefono: '+51987654322', ciudad: 'Lima' },
  { razonSocial: 'Social Media Agency', correo: 'contact@socialmedia.com', ruc: '20345678901', telefono: '+51987654323', ciudad: 'Arequipa' },
  { razonSocial: 'Creative Minds LLC', correo: 'hello@creativeminds.com', ruc: '20456789012', telefono: '+51987654324', ciudad: 'Lima' },
  { razonSocial: 'Data Analytics Corp', correo: 'support@dataanalytics.com', ruc: '20567890123', telefono: '+51987654325', ciudad: 'Trujillo' },
  { razonSocial: 'Cloud Services Inc', correo: 'info@cloudservices.com', ruc: '20678901234', telefono: '+51987654326', ciudad: 'Lima' },
  { razonSocial: 'E-commerce Solutions', correo: 'sales@ecommerce.com', ruc: '20789012345', telefono: '+51987654327', ciudad: 'Cusco' },
  { razonSocial: 'Brand Development', correo: 'team@branddev.com', ruc: '20890123456', telefono: '+51987654328', ciudad: 'Lima' },
  { razonSocial: 'Influencer Network', correo: 'network@influencers.com', ruc: '20901234567', telefono: '+51987654329', ciudad: 'Lima' },
  { razonSocial: 'Content Creator Hub', correo: 'hub@contentcreator.com', ruc: '20012345678', telefono: '+51987654330', ciudad: 'Piura' },
  { razonSocial: 'Marketing Automation', correo: 'auto@marketing.com', ruc: '20112345679', telefono: '+51987654331', ciudad: 'Lima' },
  { razonSocial: 'SEO Experts Group', correo: 'seo@experts.com', ruc: '20212345680', telefono: '+51987654332', ciudad: 'Lima' },
  { razonSocial: 'Video Production Co', correo: 'video@production.com', ruc: '20312345681', telefono: '+51987654333', ciudad: 'Iquitos' },
  { razonSocial: 'Mobile App Dev', correo: 'dev@mobileapp.com', ruc: '20412345682', telefono: '+51987654334', ciudad: 'Lima' },
  { razonSocial: 'Design Studio Pro', correo: 'design@studio.com', ruc: '20512345683', telefono: '+51987654335', ciudad: 'Tacna' },
  { razonSocial: 'AI Solutions Ltd', correo: 'ai@solutions.com', ruc: '20612345684', telefono: '+51987654336', ciudad: 'Lima' },
  { razonSocial: 'Blockchain Startup', correo: 'info@blockchain.com', ruc: '20712345685', telefono: '+51987654337', ciudad: 'Lima' },
  { razonSocial: 'Consulting Group', correo: 'consult@group.com', ruc: '20812345686', telefono: '+51987654338', ciudad: 'Ayacucho' },
  { razonSocial: 'Finance Tech Inc', correo: 'fintech@inc.com', ruc: '20912345687', telefono: '+51987654339', ciudad: 'Lima' },
  { razonSocial: 'Education Platform', correo: 'edu@platform.com', ruc: '20013456788', telefono: '+51987654340', ciudad: 'Lima' },
  { razonSocial: 'Healthcare Solutions', correo: 'health@solutions.com', ruc: '20113456789', telefono: '+51987654341', ciudad: 'Junín' },
  { razonSocial: 'Real Estate Tech', correo: 'real@estate.com', ruc: '20213456790', telefono: '+51987654342', ciudad: 'Lima' },
];

const plataformas = ['Meta', 'Google', 'TikTok', 'X'];

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

  console.log('\n📋 Creando empresas y solicitudes de facturación...');
  
  let createdCompanies = 0;
  let createdRequests = 0;
  const empresaUserId = createdUserIds['empresa'];

  for (const company of testCompanies) {
    try {
      const { data: empresa, error } = await supabase
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

      createdCompanies++;

      // Vincular usuario con empresa
      await supabase.from('empresa_users').insert({
        empresa_id: empresa.id,
        user_id: empresaUserId,
        role_en_empresa: 'OWNER',
      });

      // Crear 2-3 solicitudes de facturación por empresa
      const numRequests = Math.floor(Math.random() * 2) + 2; // 2-3 solicitudes

      for (let i = 0; i < numRequests; i++) {
        const plataforma = plataformas[Math.floor(Math.random() * plataformas.length)];
        const monto = Math.floor(Math.random() * 5000) + 500; // 500-5500

        const { data: request, error: requestError } = await supabase
          .from('facturacion_requests')
          .insert({
            empresa_id: empresa.id,
            plataforma: plataforma,
            monto_solicitado: monto,
            estado: 'REQUEST_CREATED',
            created_by: empresaUserId,
          })
          .select()
          .single();

        if (requestError) throw requestError;

        // Calcular automáticamente
        const baseCalculada = monto / 1.12;
        const iva = baseCalculada * 0.12;
        const isd = monto * 0.05;

        await supabase
          .from('facturacion_requests')
          .update({
            base_calculada: baseCalculada,
            iva: iva,
            isd_evitado: isd,
            total_facturado: monto,
            estado: 'CALCULATED',
          })
          .eq('id', request.id);

        createdRequests++;
      }

      console.log(`✅ Empresa creada: ${company.razonSocial} (RUC: ${company.ruc})`);
    } catch (error) {
      console.error(`❌ Error creando empresa ${company.razonSocial}:`, error);
    }
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
  console.log('5. Probar endpoints\n');

  console.log('📊 DATOS CREADOS:\n');
  console.log(`✅ Usuarios: ${credentials.length}`);
  console.log(`✅ Empresas: ${createdCompanies}`);
  console.log(`✅ Solicitudes de facturación: ${createdRequests}`);
  console.log(`✅ Gamificación: ${credentials.length} registros\n`);

  console.log('💡 NOTAS:\n');
  console.log(`- Todas las empresas están vinculadas al usuario: ${credentials[1].email}`);
  console.log(`- El admin (${credentials[0].email}) puede ver todas las solicitudes`);
  console.log(`- Cada empresa tiene 2-3 solicitudes de facturación`);
  console.log(`- Los montos son aleatorios entre S/ 500 y S/ 5500\n`);
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
