/* eslint-disable */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DailyStatsCronService } from './betting/services/daily-stats-cron.service';

async function bootstrap() {
  console.log('🧪 Testing Daily Stats Cron Job...\n');

  try {
    // Create application context
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn'],
    });

    // Get the cron service
    const cronService = app.get(DailyStatsCronService);

    // Test manual trigger for yesterday
    console.log('📊 Triggering manual aggregation for yesterday...\n');
    await cronService.triggerManualAggregation();

    console.log('\n✅ Daily stats cron job test completed successfully!');
    console.log(
      '\n💡 The cron job is scheduled to run automatically every day at 3:00 AM (Europe/Paris timezone)',
    );
    console.log(
      '💡 To verify the data, check the daily_user_stats table in your database\n',
    );

    // Close the application
    await app.close();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Daily stats cron job test failed:');
    console.error(error);
    process.exit(1);
  }
}

bootstrap();
