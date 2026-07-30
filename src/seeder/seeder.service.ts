import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedBaseCharacters } from './seeds/character.seed';
import { seedCompetitors } from './seeds/competitor.seed';
import { seedUsers } from './seeds/user.seed';
import { seedRaces } from './seeds/race.seed';
import { seedSeasonArchives } from './seeds/season.seed';
import { AchievementSeedService } from '../achievements/services/achievement-seed.service';

@Injectable()
export class SeederService implements OnModuleInit {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly achievementSeedService: AchievementSeedService,
  ) {}

  async onModuleInit() {
    if (process.env.SEED === 'true') {
      this.logger.log('🌱 Running seeders...');
      await this.run();
    } else {
      this.logger.log('🚫 SEED DISABLED');
    }
  }

  async run() {
    // 1. Base data (always seeded)
    this.logger.log('📦 Seeding base data...');
    await seedBaseCharacters(this.dataSource);
    await seedCompetitors(this.dataSource);

    // 2. Seed achievements
    this.logger.log('🎯 Seeding achievements...');
    await this.achievementSeedService.seedAchievements();
    this.logger.log('✅ Achievements seeded successfully');

    // 3. Full seed (only when SEED_FULL=true)
    if (process.env.SEED_FULL === 'true') {
      this.logger.log('🚀 Running FULL seed (test data)...');
      await this.runFullSeed();
    }
  }

  /**
   * Full seed with test data for development/testing
   * Triggered by SEED_FULL=true environment variable
   */
  async runFullSeed() {
    this.logger.log('👤 Seeding test users...');
    await seedUsers(this.dataSource);

    this.logger.log('📅 Seeding betting weeks...');

    this.logger.log('🏁 Seeding races...');
    await seedRaces(this.dataSource);

    this.logger.log('🎲 Seeding bets...');

    this.logger.log('📊 Seeding season archives...');
    await seedSeasonArchives(this.dataSource);

    this.logger.log('🎉 Full seed completed successfully!');
  }
}
