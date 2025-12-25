import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AchievementSeedService } from './achievements/services/achievement-seed.service';

async function bootstrap() {
  console.log('🌱 Starting achievement seeding...\n');

  try {
    // Create application context
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn'],
    });

    // Get the achievement seed service
    const seedService = app.get(AchievementSeedService);

    // Run the seeding
    const count = await seedService.seedAchievements();

    // Get stats
    const stats = await seedService.getAchievementStats();

    console.log('\n✅ Achievement seeding completed successfully!');
    console.log(`\n📊 Statistics:`);
    console.log(`   Total achievements: ${stats.total}`);
    console.log(`   By category:`);
    Object.entries(stats.byCategory).forEach(([category, count]) => {
      console.log(`     - ${category}: ${count}`);
    });
    console.log(`   By rarity:`);
    Object.entries(stats.byRarity).forEach(([rarity, count]) => {
      console.log(`     - ${rarity}: ${count}`);
    });

    // Close the application
    await app.close();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Achievement seeding failed:');
    console.error(error);
    process.exit(1);
  }
}

bootstrap();
