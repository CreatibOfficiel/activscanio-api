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

  async findAllWithAvailableVariants(): Promise<BaseCharacter[]> {
    // Retrieve all base characters with their variants
    const baseCharacters = await this.baseCharacterRepo.find({
      relations: ['variants', 'variants.competitor'],
    });

    // Filter available variants for each base character
    for (const baseChar of baseCharacters) {
      baseChar.variants = baseChar.variants.filter(
        (variant) => !variant.competitor,
      );
    }

    // Return only the base characters that have at least one available variant
    return baseCharacters.filter((baseChar) => baseChar.variants.length > 0);
  }

  async findVariants(baseCharacterId: string) {
    // We can simply get the BaseCharacter and return its variants
    const character = await this.findOne(baseCharacterId);
    return character.variants;
  }

  async findAvailableVariants(baseCharacterId: string) {
    // Get the base character with its variants and their competitor
    const baseCharacter = await this.baseCharacterRepo.findOne({
      where: { id: baseCharacterId },
      relations: ['variants', 'variants.competitor'],
    });
    if (!baseCharacter) {
      throw new NotFoundException(
        `BaseCharacter with ID ${baseCharacterId} not found`,
      );
    }
    // Filter the variants to only include those that are available (i.e., not linked to a competitor)
    return baseCharacter.variants.filter((variant) => !variant.competitor);
  }
}
