import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CharacterVariantsService } from './character-variants.service';
import { CharacterVariant } from './character-variant.entity';

@Controller('character-variants')
export class CharacterVariantsController {
  constructor(private readonly variantsService: CharacterVariantsService) {}

  // GET /character-variants
  @Get()
  async findAll(): Promise<CharacterVariant[]> {
    return this.variantsService.findAll();
  }

  // GET /character-variants/:id
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<CharacterVariant> {
    const variant = await this.variantsService.findOne(id);
    return variant;
  }

  // GET /character-variants/available
  @Get('available')
  async findAvailable(): Promise<CharacterVariant[]> {
    return this.variantsService.findAvailable();
  }
}