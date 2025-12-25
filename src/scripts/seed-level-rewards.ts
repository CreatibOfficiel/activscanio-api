import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { LevelRewardsService } from '../achievements/services/level-rewards.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const levelRewardsService = app.get(LevelRewardsService);

  console.log('🌱 Seeding level rewards...');

  try {
    await levelRewardsService.seedLevelRewards();
    console.log('✅ Level rewards seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding level rewards:', error);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

bootstrap();
