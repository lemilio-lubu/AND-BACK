SEED DE DATOS PARA PRUEBAS

COMANDO

npm run seed

QUE HACE EL SEED

1. Limpia la base de datos (elimina todos los registros de prueba)
2. Crea 3 usuarios de prueba
   - Admin
   - Empresa
   - Influencer
3. Crea una empresa de prueba
4. Vincula el usuario empresa con la empresa
5. Inicializa gamificación para cada usuario
6. Crea una solicitud de facturación de ejemplo
7. Muestra todas las credenciales en la consola

USUARIOS CREADOS

ADMIN
Email: admin@and.dev
Contraseña: AdminAND123!@#
Rol: admin

EMPRESA
Email: empresa@and.dev
Contraseña: EmpresaAND123!@#
Rol: empresa

INFLUENCER
Email: influencer@and.dev
Contraseña: InfluencerAND123!@#
Rol: influencer

EMPRESA CREADA

Razón Social: Tech Solutions S.A.C.
RUC: 20123456789
Email Corporativo: contacto@techsolutions.com
Teléfono: +51987654321
Ciudad: Lima
Estado: Pendiente

DATOS DE PRUEBA CREADOS

1 Solicitud de facturación
   Plataforma: META
   Monto: 1500.50
   Estado: CALCULATED (ya calculado)
   Detalles:
   - Base calculada: 1339.93
   - IVA: 160.79
   - ISD evitado: 75.03
   - Total: 1500.50

CÓMO USAR EL SEED

1. Asegúrate de tener configuradas las variables de entorno en .env
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...

2. Ejecutar el seed
   npm run seed

3. Ver las credenciales impresas en la consola

4. Iniciar el servidor
   npm run start:dev

5. Ir a http://localhost:3000/api/docs

6. Hacer clic en Authorize

7. Copiar el access_token obtenido del login

8. Pegar en el campo de autenticación

9. Hacer clic en Authorize

10. Ahora puedes probar todos los endpoints

FLUJO DE PRUEBA RECOMENDADO

1. Login como EMPRESA
   POST /auth/login
   Email: empresa@and.dev
   Contraseña: EmpresaAND123!@#

2. Obtener mi empresa
   GET /empresas/mine
   Verás la empresa creada

3. Ver mis solicitudes
   GET /facturacion/mine
   Verás la solicitud CALCULATED

4. Aprobar solicitud
   PUT /facturacion/approve
   requestId: <ID de la solicitud anterior>

5. Logout y login como ADMIN
   Email: admin@and.dev
   Contraseña: AdminAND123!@#

6. Ver todas las solicitudes
   GET /facturacion/all
   Verás la solicitud que aprobaste

7. Emitir factura
   PUT /facturacion/:id/invoice
   Esto marcará como INVOICED y activará gamificación

8. Ver solicitud actualizada
   GET /facturacion/:id

LIMPIAR DATOS

El seed automáticamente limpia los datos anteriores cuando se ejecuta.
Si necesitas preservar datos, comenta la función cleanDatabase() en seed.ts

AGREGAR MAS DATOS

Puedes editar src/seed.ts y agregar mas usuarios o empresas en los arrays:
- testUsers
- testCompany

Luego ejecuta npm run seed nuevamente

IMPORTANTE

El seed usaría las variables de entorno de .env
Asegúrate de que SUPABASE_SERVICE_ROLE_KEY sea válida
El seed no debe ejecutarse en producción
Los datos de prueba son genéricos y seguros
