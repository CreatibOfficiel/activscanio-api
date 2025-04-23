import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { BaseCharactersService } from './base-characters.service';
import { BaseCharacter } from './base-character.entity';

@Controller('base-characters')
export class BaseCharactersController {
  constructor(private readonly baseCharactersService: BaseCharactersService) {}

  // GET /base-characters/available
  @Get('available')
  async findAvailable(): Promise<BaseCharacter[]> {
    return this.baseCharactersService.findAllWithAvailableVariants();
  }

  // GET /base-characters/:id/variants
  @Get(':id/variants')
  async findVariants(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.baseCharactersService.findVariants(id);
  }

  // GET /base-characters/:id
  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<BaseCharacter> {
    return this.baseCharactersService.findOne(id);
  }

  // GET /base-characters/:id/available-variants
  @Get(':id/available-variants')
  async findAvailableVariants(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.baseCharactersService.findAvailableVariants(id);
  }

  // GET /base-characters
  @Get()
  async findAll(): Promise<BaseCharacter[]> {
    return this.baseCharactersService.findAll();
  }
}
