import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CharacterVariant } from './character-variant.entity';
import { In, IsNull, Repository } from 'typeorm';

@Injectable()
export class CharacterVariantsService {
  constructor(
    @InjectRepository(CharacterVariant)
    private readonly variantRepo: Repository<CharacterVariant>,
  ) {}

  async findAll(): Promise<CharacterVariant[]> {
    return this.variantRepo.find({
      relations: ['baseCharacter', 'competitor'],
    });
  }

  async findOne(id: string): Promise<CharacterVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id },
      relations: ['baseCharacter', 'competitor'],
    });
    if (!variant) {
      throw new NotFoundException(`Character variant with ID ${id} not found`);
    }
    return variant;
  }

  async findByCompetitorIds(competitorIds: string[]): Promise<CharacterVariant[]> {
    if (!competitorIds.length) return [];
    return this.variantRepo.find({
      where: {
        competitor: {
          id: In(competitorIds),
        },
      },
      relations: ['competitor', 'baseCharacter', 'baseCharacter.variants'],
    });
  }
}
