-- Schema completo de Supabase para AND Backend
-- Ejecutar en Supabase → SQL Editor

-- ============================================
-- ENUMS
-- ============================================

-- Enum para roles de usuario
CREATE TYPE user_role AS ENUM ('admin', 'empresa', 'influencer');

-- Enum para estado tributario
CREATE TYPE estado_tributario AS ENUM ('pendiente', 'activo', 'suspendido', 'inactivo');

-- Enum para plataformas de ads
CREATE TYPE plataforma_ads AS ENUM ('meta', 'tiktok', 'google', 'otro');

-- Enum para estados de facturación
CREATE TYPE facturacion_estado AS ENUM (
  'REQUEST_CREATED',
  'CALCULATED',
  'APPROVED_BY_CLIENT',
  'INVOICED',
  'PAID',
  'COMPLETED',
  'ERROR'
);

-- ============================================
-- TABLAS
-- ============================================

-- Tabla users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  role user_role NOT NULL,
  is_new boolean DEFAULT true,
  has_emitted_first_invoice boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Tabla empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  correo_corporativo text NOT NULL,
  ruc text NOT NULL UNIQUE,
  telefono text NOT NULL,
  ciudad text NOT NULL,
  estado_tributario estado_tributario DEFAULT 'pendiente'::estado_tributario,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT empresas_pkey PRIMARY KEY (id)
);

-- Índice para RUC
CREATE INDEX IF NOT EXISTS idx_empresas_ruc ON public.empresas(ruc);

-- Tabla empresa_users (relación many-to-many)
CREATE TABLE IF NOT EXISTS public.empresa_users (
  empresa_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_en_empresa text DEFAULT 'OWNER'::text,
  CONSTRAINT empresa_users_pkey PRIMARY KEY (empresa_id, user_id),
  CONSTRAINT empresa_users_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT empresa_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Tabla facturacion_requests
CREATE TABLE IF NOT EXISTS public.facturacion_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  plataforma plataforma_ads NOT NULL,
  monto_solicitado numeric NOT NULL CHECK (monto_solicitado > 0::numeric),
  base_calculada numeric,
  iva numeric,
  isd_evitado numeric,
  total_facturado numeric,
  estado facturacion_estado DEFAULT 'REQUEST_CREATED'::facturacion_estado,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  error_message text,
  CONSTRAINT facturacion_requests_pkey PRIMARY KEY (id),
  CONSTRAINT facturacion_requests_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE,
  CONSTRAINT facturacion_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Índices para facturacion_requests
CREATE INDEX IF NOT EXISTS idx_facturacion_empresa_id ON public.facturacion_requests(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_estado ON public.facturacion_requests(estado);

-- Tabla facturacion_audit_log
CREATE TABLE IF NOT EXISTS public.facturacion_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid,
  old_estado facturacion_estado,
  new_estado facturacion_estado NOT NULL,
  actor uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT facturacion_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT facturacion_audit_log_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.facturacion_requests(id) ON DELETE CASCADE
);

-- Índice para audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON public.facturacion_audit_log(request_id);

-- Tabla gamificacion_estado
CREATE TABLE IF NOT EXISTS public.gamificacion_estado (
  user_id uuid NOT NULL,
  nivel text DEFAULT 'iniciando'::text,
  puntos integer DEFAULT 0,
  visible boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT gamificacion_estado_pkey PRIMARY KEY (user_id),
  CONSTRAINT gamificacion_estado_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturacion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturacion_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamificacion_estado ENABLE ROW LEVEL SECURITY;

-- Policies para users
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Service role can manage users" ON public.users
  FOR ALL USING (true);

-- Policies para empresas
CREATE POLICY "Empresas visible to related users" ON public.empresas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.empresa_users 
      WHERE empresa_users.empresa_id = empresas.id 
      AND empresa_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage empresas" ON public.empresas
  FOR ALL USING (true);

-- Policies para empresa_users
CREATE POLICY "Users can view their empresa relations" ON public.empresa_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage empresa_users" ON public.empresa_users
  FOR ALL USING (true);

-- Policies para facturacion_requests
CREATE POLICY "Users can view their empresa requests" ON public.facturacion_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.empresa_users 
      WHERE empresa_users.empresa_id = facturacion_requests.empresa_id 
      AND empresa_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage facturacion_requests" ON public.facturacion_requests
  FOR ALL USING (true);

-- Policies para facturacion_audit_log
CREATE POLICY "Users can view audit logs for their requests" ON public.facturacion_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.facturacion_requests fr
      JOIN public.empresa_users eu ON eu.empresa_id = fr.empresa_id
      WHERE fr.id = facturacion_audit_log.request_id
      AND eu.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage audit logs" ON public.facturacion_audit_log
  FOR ALL USING (true);

-- Policies para gamificacion_estado
CREATE POLICY "Users can view own gamification" ON public.gamificacion_estado
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage gamification" ON public.gamificacion_estado
  FOR ALL USING (true);
