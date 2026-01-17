import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  // Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('AND Backend API')
    .setDescription('API de AND - Plataforma de facturación y gamificación')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtenido en /auth/login',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Autenticación')
    .addTag('empresas', 'Gestión de empresas')
    .addTag('facturacion', 'Solicitudes de facturación')
    .addTag('users', 'Información de usuarios')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`✅ Servidor ejecutándose en http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📚 Documentación disponible en http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}
bootstrap();
