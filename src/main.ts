import { randomUUID } from 'crypto';

// Minimal polyfill to inject randomUUID into globalThis.crypto
if (!globalThis.crypto) {
  (globalThis as any).crypto = {
    randomUUID: () => randomUUID(),
  };
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
