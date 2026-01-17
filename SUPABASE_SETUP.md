# 🔐 Configuración de Supabase Auth

## 📋 Pasos para configurar

### 1️⃣ Crear proyecto en Supabase
1. Ve a [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Espera a que se inicialice

### 2️⃣ Obtener credenciales
1. Ve a **Project Settings** → **API**
2. Copia:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 3️⃣ Configurar .env
Actualiza el archivo `.env` con tus credenciales reales:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

JWT_SECRET=cambia-esto-por-un-secreto-seguro
JWT_EXPIRES_IN=7d
```

⚠️ **IMPORTANTE**: Nunca subas `.env` a git (ya está en `.gitignore`)

### 4️⃣ Crear tabla en Supabase
1. Ve a **SQL Editor** en Supabase
2. Copia y ejecuta el contenido de `supabase-schema.sql`
3. Verifica que la tabla `users` se creó correctamente

### 5️⃣ Iniciar el servidor
```bash
npm run start:dev
```

## 🚀 Endpoints disponibles

### Registro
```bash
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123",
  "role": "empresa"
}
```

**Roles válidos**: `admin`, `empresa`, `influencer`

### Login
```bash
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123"
}
```

**Respuesta**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Perfil (ruta protegida)
```bash
GET http://localhost:3000/me
Authorization: Bearer <tu-access-token>
```

### Rutas por rol

**Solo ADMIN**:
```bash
GET http://localhost:3000/admin/users
Authorization: Bearer <token-de-admin>
```

**Solo EMPRESA**:
```bash
GET http://localhost:3000/billing
Authorization: Bearer <token-de-empresa>
```

## 🎯 Próximos pasos

1. ✅ Backend conectado con Supabase
2. 🔄 Frontend consume estos endpoints
3. 📊 Crear módulo de facturación
4. 👤 Crear seed para usuario admin inicial
