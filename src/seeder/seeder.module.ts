import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { Character } from 'src/characters/character.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Character])],
  providers: [SeederService],
})
export class SeederModule {}
