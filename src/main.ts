import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  /**
   * Run the class-validator decorators on request bodies.
   *
   * Without this pipe none of them execute — every @IsEnum, @Min and
   * @ArrayMaxSize in the codebase was decorative, and a client could post a
   * match with forty sets or an invented sport preference.
   *
   * `whitelist` is deliberately OFF. It strips undeclared properties, and
   * five existing input DTOs carry no decorators at all (the character and
   * base-character ones, plus UpdateUserDto) — turning it on would empty
   * their bodies and break those endpoints silently. Enabling it means
   * annotating those DTOs first.
   *
   * `transform` is on so @Type(() => SetScoreDto) actually builds nested
   * instances; without it, nested validation never runs.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  /**
   * Trust exactly one reverse proxy hop.
   *
   * In production nginx sits in front of this process, so every connection
   * arrives from the proxy's address. Express reports that single address as
   * req.ip for every request unless it is told to trust the proxy.
   *
   * That matters because ThrottlerGuard is registered globally at 100
   * requests per minute keyed on req.ip. Without this, all users share one
   * bucket: a few hundred requests a minute across the whole userbase — which
   * a handful of active people generate easily — would start returning 429 to
   * everyone at once, and the rate limit would effectively be a global cap
   * rather than a per-client one.
   *
   * The value is 1, not `true`. It means "the last hop is our nginx, trust
   * exactly one entry from the right of X-Forwarded-For". `true` would trust
   * the entire header, letting any client spoof req.ip by sending their own
   * X-Forwarded-For and bypass the throttler entirely.
   *
   * If another proxy is ever added in front of nginx (a CDN, for instance),
   * this number must increase to match the number of trusted hops.
   */
  app.set('trust proxy', 1);

  // Register global exception filters
  // Order matters: HttpExceptionFilter catches HttpException, AllExceptionsFilter catches everything else
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  // Serve static files for generated images using Express static middleware
  // This must be done BEFORE setting the global prefix
  // __dirname in compiled code is dist/src, so we need to go up 2 levels to reach project root
  const publicPath = path.join(__dirname, '..', '..', 'public');
  console.log(`📁 Serving static files from: ${publicPath}`);
  app.use('/images', express.static(path.join(publicPath, 'images')));

  // Set global prefix for API routes
  app.setGlobalPrefix('api');

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('ActivScanIO API')
    .setDescription('Fantasy Racing Mario Kart - API Documentation')
    .setVersion('1.0')
    .addTag('onboarding', 'User onboarding and competitor linking')
    .addTag('seasons', 'Season archives and historical data')
    .addTag('competitors', 'Competitor management and rankings')
    .addTag('races', 'Race results and analysis')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');

  console.log(
    `🚀 API running on: http://localhost:${process.env.PORT ?? 3000}/api`,
  );
  console.log(
    `📚 Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api/docs`,
  );
}
void bootstrap();
