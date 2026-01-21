// Script para verificar la conexión de Supabase y RLS
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const userId = '79dabe3c-f41a-4240-885f-cbe49f7354a4';

console.log('🔍 Verificando configuración de Supabase...');
console.log('📍 SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('🔑 SERVICE_ROLE_KEY presente:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('🔑 SERVICE_ROLE_KEY (primeros 20 chars):', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20));

// Cliente con service role (debe bypass RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function testConnection() {
  console.log('\n🧪 Test 1: Consulta directa a empresa_users');
  const { data: allRelations, error: allError } = await supabaseAdmin
    .from('empresa_users')
    .select('*');
  
  console.log('Todas las relaciones:', allRelations);
  console.log('Error:', allError);
  
  console.log('\n🧪 Test 2: Consulta con filtro por user_id');
  const { data: userRelations, error: userError } = await supabaseAdmin
    .from('empresa_users')
    .select('*')
    .eq('user_id', userId);
  
  console.log('Relaciones del usuario:', userRelations);
  console.log('Error:', userError);
  
  console.log('\n🧪 Test 3: Consulta solo empresa_id');
  const { data: empresaIds, error: empresaError } = await supabaseAdmin
    .from('empresa_users')
    .select('empresa_id')
    .eq('user_id', userId);
  
  console.log('Empresa IDs:', empresaIds);
  console.log('Error:', empresaError);
}

testConnection().then(() => {
  console.log('\n✅ Tests completados');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
