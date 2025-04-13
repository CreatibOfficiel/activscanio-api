import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterVariant } from './character-variant.entity';

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
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }
    return variant;
  }
}
