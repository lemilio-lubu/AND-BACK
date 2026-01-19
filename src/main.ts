import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Configuración de CORS
    app.enableCors({
      origin: [
        'http://localhost:3000', // Desarrollo frontend
        'http://localhost:3001', // Backend
        'http://127.0.0.1:3000', // localhost alternativo
      ],
      credentials: true, // Permitir cookies
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    // Validación global
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Configurar Swagger
    const config = new DocumentBuilder()
      .setTitle('AND Backend API')
      .setDescription('API de AND - Plataforma de facturación y gamificación')
      .setVersion('1.0.0')
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

    const port = parseInt(process.env.PORT || '3001', 10);

    await app.listen(port);

    logger.log(`✅ Servidor ejecutándose en http://localhost:${port}`);
    logger.log(`📚 Documentación en http://localhost:${port}/api/docs`);

    process.on('SIGTERM', async () => {
      logger.warn('Cerrando servidor...');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.warn('Cerrando servidor...');
      await app.close();
      process.exit(0);
    });

    // Manejo de errores no capturados
    process.on('uncaughtException', (error: Error) => {
      logger.error('Error no capturado:', error.stack);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Promise rechazado no manejado:', reason);
      process.exit(1);
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error fatal: ${error.message}`);
    } else {
      logger.error('Error fatal desconocido:', error);
    }
    process.exit(1);
  }
}

bootstrap();
