import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, UserRole } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SyncClerkUserDto } from './dto/sync-clerk-user.dto';
import { UserRepository } from './repositories/user.repository';
import { CharacterVariant } from '../character-variants/character-variant.entity';
import {
  UserNotFoundException,
  UserAlreadyExistsException,
  ValidationException,
} from '../common/exceptions';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    @InjectRepository(CharacterVariant)
    private readonly characterVariantRepository: Repository<CharacterVariant>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user with this clerkId already exists
    const existingUser = await this.userRepository.findByClerkId(
      createUserDto.clerkId,
    );

    if (existingUser) {
      throw new UserAlreadyExistsException(createUserDto.clerkId);
    }

    const user = this.userRepository.create(createUserDto);
    return await this.userRepository.save(user);
  }

  /**
   * Sync user from Clerk (webhook handler)
   * Creates user if doesn't exist, updates if exists
   */
  async syncFromClerk(syncDto: SyncClerkUserDto): Promise<User> {
    let user = await this.userRepository.findByClerkId(syncDto.clerkId);

    if (user) {
      // Update existing user
      if (syncDto.email) user.email = syncDto.email;
      if (syncDto.firstName) user.firstName = syncDto.firstName;
      if (syncDto.lastName) user.lastName = syncDto.lastName;
      if (syncDto.profilePictureUrl)
        user.profilePictureUrl = syncDto.profilePictureUrl;

      return await this.userRepository.save(user);
    } else {
      // Create new user with PENDING role (onboarding not completed)
      user = this.userRepository.create({
        clerkId: syncDto.clerkId,
        email: syncDto.email || '',
        firstName: syncDto.firstName || '',
        lastName: syncDto.lastName || '',
        profilePictureUrl: syncDto.profilePictureUrl,
        role: UserRole.PENDING,
      });

      return await this.userRepository.save(user);
    }
  }

  /**
   * Find all users
   */
  async findAll(): Promise<User[]> {
    return await this.userRepository.findAllWithCompetitor();
  }

  /**
   * Find one user by ID
   */
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne(id, ['competitor']);

    if (!user) {
      throw new UserNotFoundException(id);
    }

    return user;
  }

  /**
   * Find user by Clerk ID
   */
  async findByClerkId(clerkId: string): Promise<User | null> {
    return await this.userRepository.findByClerkId(clerkId);
  }

  /**
   * Get or create user by Clerk ID
   * Creates user with PENDING role if doesn't exist (auto-sync on first API call)
   */
  async getOrCreateByClerkId(clerkPayload: {
    clerkId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profilePictureUrl?: string;
  }): Promise<User> {
    let user = await this.userRepository.findByClerkId(clerkPayload.clerkId);

    if (!user) {
      // Auto-create user with PENDING role
      user = this.userRepository.create({
        clerkId: clerkPayload.clerkId,
        email: clerkPayload.email || '',
        firstName: clerkPayload.firstName || '',
        lastName: clerkPayload.lastName || '',
        profilePictureUrl: clerkPayload.profilePictureUrl,
        role: UserRole.PENDING,
      });

      user = await this.userRepository.save(user);
    }

    return user;
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Merge updates
    Object.assign(user, updateUserDto);

    return await this.userRepository.save(user);
  }

  /**
   * Link user to a competitor
   */
  async linkCompetitor(userId: string, competitorId: string): Promise<User> {
    const user = await this.findOne(userId);

    // Update role if currently bettor
    if (user.role === UserRole.BETTOR) {
      user.role = UserRole.PLAYER;
    }

    user.competitorId = competitorId;

    return await this.userRepository.save(user);
  }

  /**
   * Unlink user from competitor
   */
  async unlinkCompetitor(userId: string): Promise<User> {
    const user = await this.findOne(userId);

    if (!user.competitorId) {
      throw new ValidationException(
        'competitorId',
        'User is not linked to any competitor',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    user.competitorId = null as any; // TypeORM accepts null for nullable columns

    // Update role
    if (user.role === UserRole.PLAYER) {
      user.role = UserRole.BETTOR;
    }

    return await this.userRepository.save(user);
  }

  /**
   * Delete user
   */
  async remove(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  /**
   * Change the character variant for a user's competitor
   * Validates that the variant is available (not taken by another competitor)
   */
  async changeCharacterVariant(
    userId: string,
    newVariantId: string,
  ): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get user with competitor
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        relations: ['competitor', 'competitor.characterVariant'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.competitor) {
        throw new BadRequestException('User is not linked to a competitor');
      }

      // Get the new character variant
      const newVariant = await queryRunner.manager.findOne(CharacterVariant, {
        where: { id: newVariantId },
        relations: ['competitor', 'baseCharacter'],
      });

      if (!newVariant) {
        throw new NotFoundException('Character variant not found');
      }

      // Check if the new variant is already taken by another competitor
      if (
        newVariant.competitor &&
        newVariant.competitor.id !== user.competitor.id
      ) {
        throw new ConflictException(
          `Ce personnage est déjà pris par ${newVariant.competitor.firstName}`,
        );
      }

      // If same variant, no change needed
      if (user.competitor.characterVariant?.id === newVariantId) {
        await queryRunner.commitTransaction();
        return user;
      }

      // Remove the old variant link (if any)
      if (user.competitor.characterVariant) {
        const oldVariant = await queryRunner.manager.findOne(CharacterVariant, {
          where: { id: user.competitor.characterVariant.id },
        });
        if (oldVariant) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          oldVariant.competitor = null as any;
          await queryRunner.manager.save(oldVariant);
        }
      }

      // Link the new variant to the competitor
      newVariant.competitor = user.competitor;
      await queryRunner.manager.save(newVariant);

      await queryRunner.commitTransaction();

      // Return updated user with new character variant
      return (await this.userRepository.findOne(userId, [
        'competitor',
        'competitor.characterVariant',
        'competitor.characterVariant.baseCharacter',
      ])) as User;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
