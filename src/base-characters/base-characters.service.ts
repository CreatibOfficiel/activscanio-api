import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCharacter } from './base-character.entity';

@Injectable()
export class BaseCharactersService {
  constructor(
    @InjectRepository(BaseCharacter)
    private readonly baseCharacterRepo: Repository<BaseCharacter>,
  ) {}

  async findAll(): Promise<BaseCharacter[]> {
    // By default, if you want variants eagerly loaded, you can pass relations
    return this.baseCharacterRepo.find({
      relations: ['variants'],
    });
  }

  async findOne(id: string): Promise<BaseCharacter> {
    const character = await this.baseCharacterRepo.findOne({
      where: { id },
      relations: ['variants'],
    });
    if (!character) {
      throw new NotFoundException(`BaseCharacter with ID ${id} not found`);
    }
    return character;
  }

  async findVariants(baseCharacterId: string) {
    // We can simply get the BaseCharacter and return its variants
    const character = await this.findOne(baseCharacterId);
    return character.variants;
  }
}
