import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedCharacters } from './seeds/character.seed';

@Injectable()
export class SeederService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (process.env.SEED === 'true') {
      console.log('🌱 Running seeders...');
      await this.run();
    } else {
      console.log('🚫 SEED DISABLED');
    }
  }  

  async run() {
    await seedCharacters(this.dataSource);
    // TODO : Competitors seeding
  }
}