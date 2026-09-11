import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl) or any web origin
      callback(null, true);
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Id',
      'X-Tenant-Slug',
      'X-Tenant-Domain',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
  });

  await app.listen(3000, '0.0.0.0');
  console.log('SaaS Multi-Tenant School Portal Server running on http://0.0.0.0:3000');
}

await bootstrap();
