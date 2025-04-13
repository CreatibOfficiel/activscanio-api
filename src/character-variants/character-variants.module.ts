import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharacterVariantsService } from './character-variants.service';
import { CharacterVariantsController } from './character-variants.controller';
import { CharacterVariant } from './character-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CharacterVariant])],
  controllers: [CharacterVariantsController],
  providers: [CharacterVariantsService],
  exports: [CharacterVariantsService, TypeOrmModule],
})
export class CharacterVariantsModule {}
