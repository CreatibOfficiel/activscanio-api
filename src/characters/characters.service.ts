import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from './character.entity';
import { CreateCharacterDto } from './dtos/create-character.dto';

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character)
    private charactersRepo: Repository<Character>,
  ) {}

  findAll(): Promise<Character[]> {
    return this.charactersRepo.find();
  }

  findOne(id: string): Promise<Character | null> {
    return this.charactersRepo.findOne({ where: { id } });
  }

  async create(dto: CreateCharacterDto): Promise<Character> {
    const character = this.charactersRepo.create(dto);
    return this.charactersRepo.save(character);
  }
}
