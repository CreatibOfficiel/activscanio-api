import { Module } from '@nestjs/common';
import { CharacterVariantsService } from './character-variants.service';
import { CharacterVariantsController } from './character-variants.controller';

@Module({
  controllers: [CharacterVariantsController],
  providers: [CharacterVariantsService],
})
export class CharacterVariantsModule {}
