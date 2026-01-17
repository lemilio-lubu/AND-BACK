# 📚 Documentación OpenAPI - AND Backend

## 📖 Acceder a la Documentación

Una vez que el servidor esté en ejecución, puedes acceder a la documentación interactiva en:

```
http://localhost:3000/api/docs
```

### Iniciar el servidor

```bash
npm run start:dev
```

Verás en la consola:
```
✅ Servidor ejecutándose en http://localhost:3000
📚 Documentación disponible en http://localhost:3000/api/docs
```

## 🎯 Características de la Documentación

### ✅ Interfaz Swagger UI

- Descripción de todos los endpoints
- Ejemplos de request y response
- Especificación de parámetros requeridos y opcionales
- Códigos de estado HTTP esperados
- Validaciones automáticas

### 🔐 Autenticación JWT

Todos los endpoints protegidos requieren:

1. Obtener token: `POST /auth/login`
2. Copiar el `access_token`
3. En Swagger, hacer clic en el botón **"Authorize"** (arriba a la derecha)
4. Pegar el token con el formato: `Bearer <token>`
5. Hacer clic en "Authorize"

### 📋 Secciones de la API

#### 🔓 Auth (sin autenticación requerida)
- `POST /auth/register` - Registrar nuevo usuario
- `POST /auth/login` - Iniciar sesión

#### 🏢 Empresas (requiere JWT + role EMPRESA)
- `POST /empresas` - Crear empresa
- `GET /empresas/mine` - Obtener mi empresa

#### 💰 Facturación (requiere JWT)
**Para Empresas:**
- `POST /facturacion/request` - Crear solicitud
- `PUT /facturacion/approve` - Aprobar solicitud
- `GET /facturacion/mine` - Mis solicitudes

**Para Admin:**
- `GET /facturacion/all` - Ver todas
- `PUT /facturacion/:id/invoice` - Emitir factura
- `PUT /facturacion/:id/paid` - Marcar pagado
- `PUT /facturacion/:id/complete` - Completar

#### 👤 Usuarios
- `GET /me` - Mi perfil (JWT requerido)
- `GET /admin/users` - Lista de usuarios (solo admin)
- `GET /billing` - Dashboard facturación (solo empresa)

## 🧪 Flujo de Prueba Recomendado

### 1. Registrar Usuario (Empresa)

```bash
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "email": "empresa@example.com",
  "password": "password123",
  "role": "empresa"
}
```

Respuesta:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Crear Empresa

```bash
POST http://localhost:3000/empresas
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "razonSocial": "Tech Solutions S.A.C.",
  "correoCorporativo": "contacto@techsolutions.com",
  "ruc": "20123456789",
  "telefono": "+51987654321",
  "ciudad": "Lima"
}
```

### 3. Crear Solicitud de Facturación

```bash
POST http://localhost:3000/facturacion/request
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "empresaId": "<empresa-id-obtenido-del-paso-anterior>",
  "plataforma": "meta",
  "montoSolicitado": 1500.50
}
```

### 4. Aprobar Solicitud

```bash
PUT http://localhost:3000/facturacion/approve
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "requestId": "<request-id-obtenido-del-paso-anterior>"
}
```

## 🌐 Exportar Especificación OpenAPI

La especificación completa en formato JSON está disponible en:

```
http://localhost:3000/api-json
```

Puedes descargarlo y usarlo en:
- Postman
- Insomnia
- Swagger Editor
- Otros clientes HTTP

## 📝 Notas Importantes

- Todos los DTOs incluyen ejemplos reales
- Cada endpoint tiene descripción clara
- Los códigos de error HTTP están documentados
- Las validaciones se describen automáticamente
- Los enums muestran valores permitidos

## 🔄 Regenerar Documentación

La documentación se regenera automáticamente cada vez que:
- Cambias decoradores `@Api*`
- Modificas DTOs
- Agregas nuevos endpoints
- Cambias validaciones

No necesitas hacer nada especial, Swagger se actualiza al recargar.

## 🚀 Próximos Pasos

1. ✅ Documentación OpenAPI integrada
2. 🔄 Consumir desde frontend
3. 📊 Agregar métricas
4. 🔒 Agregar más seguridad
