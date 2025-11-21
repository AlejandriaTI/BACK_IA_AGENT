import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ CORS configurado correctamente
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'https://chat-ui-prueba-ggpldka9x-ti-sistemas-projects.vercel.app',
      'http://localhost:5173',
      'https://chat-ui-prueba.vercel.app',
      'http://localhost:4173',
      'http://localhost:19006',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`🚀 App running on port ${process.env.PORT ?? 3000}`);
}

bootstrap();
