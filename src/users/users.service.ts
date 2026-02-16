import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createClerkClient } from '@clerk/backend';
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
  private readonly logger = new Logger(UsersService.name);
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

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
      const newUser = this.userRepository.create({
        clerkId: syncDto.clerkId,
        email: syncDto.email || '',
        firstName: syncDto.firstName || '',
        lastName: syncDto.lastName || '',
        profilePictureUrl: syncDto.profilePictureUrl || undefined,
        role: UserRole.PENDING,
      });
      return await this.userRepository.save(newUser);
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
   * Fetches user data from Clerk API to get email, name, and profile picture
   */
  async getOrCreateByClerkId(clerkId: string): Promise<User> {
    let user = await this.userRepository.findByClerkId(clerkId);

    if (!user) {
      const clerkUser = await this.clerkClient.users.getUser(clerkId);

      const newUser = this.userRepository.create({
        clerkId,
        email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
        firstName: clerkUser.firstName || '',
        lastName: clerkUser.lastName || '',
        profilePictureUrl: clerkUser.imageUrl || undefined,
        role: UserRole.PENDING,
      });
      user = await this.userRepository.save(newUser);
      this.logger.log(
        `Auto-created user for Clerk ID ${clerkId}: ${user.firstName} ${user.lastName}`,
      );
    } else if (!user.profilePictureUrl) {
      try {
        const clerkUser = await this.clerkClient.users.getUser(clerkId);
        if (clerkUser.imageUrl) {
          user.profilePictureUrl = clerkUser.imageUrl;
          user = await this.userRepository.save(user);
          this.logger.log(
            `Synced profilePictureUrl for user ${user.id} (Clerk ID: ${clerkId})`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to sync profilePictureUrl for Clerk ID ${clerkId}: ${error instanceof Error ? error.message : error}`,
        );
      }
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

    user.competitorId = null;

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
          oldVariant.competitor = null!;
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
