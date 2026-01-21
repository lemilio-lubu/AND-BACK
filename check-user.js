// Script temporal para verificar datos del usuario
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const userId = '79dabe3c-f41a-4240-885f-cbe49f7354a4';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUser() {
  console.log('🔍 Verificando usuario:', userId);
  
  // 1. Usuario en tabla users
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  console.log('📋 Usuario en tabla users:', user);
  
  // 2. Relaciones en empresa_users
  const { data: relations } = await supabase
    .from('empresa_users')
    .select('*')
    .eq('user_id', userId);
  
  console.log('🔗 Relaciones en empresa_users:', relations);
  
  // 3. Si hay relación, buscar empresa
  if (relations && relations.length > 0) {
    const { data: empresa } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', relations[0].empresa_id)
      .single();
    
    console.log('🏢 Empresa encontrada:', empresa);
  } else {
    console.log('❌ No hay relaciones en empresa_users para este usuario');
  }
}

checkUser().then(() => process.exit(0));
