-- Tabla users en Supabase
-- Ejecutar en Supabase → SQL Editor

create table users (
  id uuid primary key,
  email text not null,
  role text not null,
  is_new boolean default true,
  ruc_connected boolean default false,
  has_emitted_first_invoice boolean default false,
  created_at timestamp default now()
);

-- Índice para búsquedas rápidas por email
create index idx_users_email on users(email);

-- RLS (Row Level Security) - opcional pero recomendado
alter table users enable row level security;

-- Policy: los usuarios solo pueden ver su propia info
create policy "Users can view own data"
  on users for select
  using (auth.uid() = id);

-- Policy: solo service role puede insertar (desde backend)
create policy "Service role can insert"
  on users for insert
  with check (true);
