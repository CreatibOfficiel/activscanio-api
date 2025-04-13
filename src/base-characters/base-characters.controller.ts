import { Controller, Get, Param } from '@nestjs/common';
import { BaseCharactersService } from './base-characters.service';
import { BaseCharacter } from './base-character.entity';

@Controller('base-characters')
export class BaseCharactersController {
  constructor(private readonly baseCharactersService: BaseCharactersService) {}

  // GET /base-characters
  @Get()
  async findAll(): Promise<BaseCharacter[]> {
    return this.baseCharactersService.findAll();
  }

  // GET /base-characters/:id
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<BaseCharacter> {
    return this.baseCharactersService.findOne(id);
  }

  // GET /base-characters/:id/variants
  @Get(':id/variants')
  async findVariants(@Param('id') id: string) {
    return this.baseCharactersService.findVariants(id);
  }
}
