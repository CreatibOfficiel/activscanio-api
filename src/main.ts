import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Register global exception filters
  // Order matters: HttpExceptionFilter catches HttpException, AllExceptionsFilter catches everything else
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  app.enableCors();
  app.setGlobalPrefix('api');

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('ActivScanIO API')
    .setDescription('Fantasy Racing Mario Kart - API Documentation')
    .setVersion('1.0')
    .addTag('onboarding', 'User onboarding and competitor linking')
    .addTag('betting', 'Betting system and weekly predictions')
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
bootstrap();
