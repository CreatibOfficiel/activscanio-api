import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { BaseRepository } from '../../common/repositories/base.repository';

/**
 * User repository with domain-specific queries
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, 'User');
  }

  /**
   * Find user by Clerk ID
   * @param clerkId - Clerk authentication ID
   */
  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.repository.findOne({
      where: { clerkId },
      relations: ['competitor'],
    });
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
