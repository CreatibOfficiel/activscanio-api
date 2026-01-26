import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { BaseRepository } from '../../common/repositories/base.repository';
import { CharacterVariant } from '../../character-variants/character-variant.entity';

/**
 * User repository with domain-specific queries
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
    @InjectRepository(CharacterVariant)
    private readonly characterVariantRepository: Repository<CharacterVariant>,
  ) {
    super(repository, 'User');
  }

  /**
   * Find user by Clerk ID
   * @param clerkId - Clerk authentication ID
   */
  async findByClerkId(clerkId: string): Promise<User | null> {
    // First, get the user with competitor
    const user = await this.repository.findOne({
      where: { clerkId },
      relations: ['competitor'],
    });

    if (!user || !user.competitor) {
      return user;
    }

    // Then manually fetch the character variant (inverse relation)
    // because TypeORM doesn't auto-load inverse OneToOne without JoinColumn
    const variant = await this.characterVariantRepository.findOne({
      where: { competitor: { id: user.competitor.id } },
      relations: ['baseCharacter'],
    });

    if (variant) {
      user.competitor.characterVariant = variant;
    }

    return user;
  }

  /**
   * Find user by email
   * @param email - User email address
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
      relations: ['competitor'],
    });
  }

  /**
   * Find all users with competitor relation loaded
   */
  async findAllWithCompetitor(): Promise<User[]> {
    return this.repository.find({
      relations: ['competitor'],
    });
  }
}
