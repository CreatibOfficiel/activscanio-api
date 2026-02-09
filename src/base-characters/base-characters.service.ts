import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCharacter } from './base-character.entity';

export interface CharacterVariantWithAvailability {
  id: string;
  label: string;
  imageUrl: string;
  isAvailable: boolean;
  takenBy?: {
    competitorId: string;
    firstName: string;
    profilePictureUrl?: string;
  };
}

export interface BaseCharacterWithAvailability {
  id: string;
  name: string;
  imageUrl: string;
  variants: CharacterVariantWithAvailability[];
  hasAvailableVariants: boolean;
}

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

  /**
   * Get all base characters with availability status for each variant.
   * Shows ALL characters (available and taken) with info about who took them.
   */
  async findAllWithAvailabilityStatus(): Promise<
    BaseCharacterWithAvailability[]
  > {
    const baseCharacters = await this.baseCharacterRepo.find({
      relations: ['variants', 'variants.competitor'],
      order: { name: 'ASC' },
    });

    return baseCharacters.map((baseChar) => {
      const variantsWithStatus: CharacterVariantWithAvailability[] =
        baseChar.variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          imageUrl: variant.imageUrl,
          isAvailable: !variant.competitor,
          takenBy: variant.competitor
            ? {
                competitorId: variant.competitor.id,
                firstName: variant.competitor.firstName,
                profilePictureUrl: variant.competitor.profilePictureUrl,
              }
            : undefined,
        }));

      const hasAvailableVariants = variantsWithStatus.some(
        (v) => v.isAvailable,
      );

      return {
        id: baseChar.id,
        name: baseChar.name,
        imageUrl: baseChar.imageUrl,
        variants: variantsWithStatus,
        hasAvailableVariants,
      };
    });
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
