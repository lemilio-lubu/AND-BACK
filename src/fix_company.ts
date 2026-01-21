import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Intentar cargar .env desde raiz
try {
  dotenv.config({ path: resolve(__dirname, '../.env') });
} catch (e) {
  dotenv.config(); // fallback
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  console.error('Asegúrate de ejecutar este script desde la raiz del proyecto o tener el .env accesible.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixCompany() {
  const targetEmail = process.argv[2];

  if (!targetEmail) {
    console.log('\n❌ Debes especificar el email del usuario.');
    console.log('Uso: npx ts-node src/fix_company.ts <EMAIL_DEL_USUARIO>\n');
    console.log('--- Usuarios encontrados en BD ---');
    
    // Listar usuarios recientes para ayudar
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (!error && users) {
        users.slice(0, 10).forEach(u => console.log(` - ${u.email} (ID: ${u.id})`));
    }
    process.exit(1);
  }

  console.log(`\n🔍 Buscando usuario: ${targetEmail}...`);

  // Buscar usuario
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
      console.error('Error Auth:', authError.message);
      return;
  }
  
  const user = users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());

  if (!user) {
    console.error(`❌ El usuario "${targetEmail}" no existe en Authentication.`);
    process.exit(1);
  }

  console.log(`✅ ID encontrado: ${user.id}`);

  // Verificar link existente
  const { data: link } = await supabase
    .from('empresa_users')
    .select('id, empresa_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (link) {
    console.log(`⚠️ Este usuario YA tiene empresa asignada (Link ID: ${link.id}, Empresa ID: ${link.empresa_id}).`);
    console.log('Si sigues teniendo error 400, asegúrate de refrescar tu token (Logout/Login).');
    process.exit(0);
  }

  console.log('🛠 El usuario no tiene empresa. Creando "Empresa Reparada"...');

  // Crear empresa Dummy
  // Generar datos aleatorios para evitar colisión de Unique Keys (ruc, correo corp)
  const randomSuffix = Math.floor(Math.random() * 10000);
  
  const { data: empresa, error: empError } = await supabase
    .from('empresas')
    .insert({
      razon_social: `Empresa Fix ${randomSuffix}`,
      correo_corporativo: `fix_${randomSuffix}@empresa.com`,
      ruc: `20${Date.now()}0`, // RUC 11 digitos aprox
      estado_tributario: 'activo',
      telefono: '999999999',
      ciudad: 'Sistema'
    })
    .select()
    .single();

  if (empError) {
    console.error('❌ Error creando empresa:', empError.message);
    process.exit(1);
  }

  console.log(`✅ Empresa creada: ${empresa.razon_social} [${empresa.id}]`);

  // Vincular
  const { error: linkError } = await supabase
    .from('empresa_users')
    .insert({
      user_id: user.id,
      empresa_id: empresa.id,
      role_en_empresa: 'OWNER'
    });

  if (linkError) {
    console.error('❌ Error vinculando:', linkError.message);
  } else {
    console.log('🎉 ¡REPARADO! El usuario ahora tiene empresa.');
    console.log('👉 IMPORTANTE: Haz Logout y Login de nuevo en el Frontend para actualizar tu Token si contiene claims personalizados, aunque la búsqueda en BD es en tiempo real.');
  }
}

fixCompany();
