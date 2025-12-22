import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedBaseCharacters } from './seeds/character.seed';
import { seedCompetitors } from './seeds/competitor.seed';

@Injectable()
export class SeederService implements OnModuleInit {
  private readonly logger = new Logger(SeederService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (process.env.SEED === 'true') {
      this.logger.log('🌱 Running seeders...');
      await this.run();
    } else {
      this.logger.log('🚫 SEED DISABLED');
    }
  }

  async run() {
    await seedBaseCharacters(this.dataSource);
    await seedCompetitors(this.dataSource);
  }
}
