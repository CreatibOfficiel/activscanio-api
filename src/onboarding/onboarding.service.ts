/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { Competitor } from '../competitors/competitor.entity';
import { CharacterVariant } from '../character-variants/character-variant.entity';
import { SearchCompetitorDto } from './dto/search-competitor.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

export interface CompetitorWithAvailability {
  id: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string;
  characterVariant?: {
    id: string;
    label: string;
    imageUrl: string;
    baseCharacter: {
      id: string;
      name: string;
      imageUrl?: string;
    };
  } | null;
  isAvailable: boolean;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    @InjectRepository(CharacterVariant)
    private readonly characterVariantRepository: Repository<CharacterVariant>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Search competitors by name (firstName or lastName)
   * If query is empty, returns all competitors
   * @deprecated Use searchCompetitorsWithAvailability instead
   */
  async searchCompetitors(query: string): Promise<Competitor[]> {
    const qb = this.competitorRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.characterVariant', 'variant')
      .leftJoinAndSelect('variant.baseCharacter', 'base')
      .orderBy('c.firstName', 'ASC');

    // If query is empty, return all competitors
    if (!query || query.trim().length === 0) {
      return await qb.getMany();
    }

    // Otherwise, filter by name
    return await qb
      .where("LOWER(c.firstName || ' ' || c.lastName) LIKE LOWER(:query)", {
        query: `%${query}%`,
      })
      .orWhere('LOWER(c.firstName) LIKE LOWER(:query)', {
        query: `%${query}%`,
      })
      .orWhere('LOWER(c.lastName) LIKE LOWER(:query)', { query: `%${query}%` })
      .limit(20)
      .getMany();
  }

  /**
   * Search competitors with availability status
   * Returns all competitors with isAvailable flag indicating if already linked to a user
   */
  async searchCompetitorsWithAvailability(
    query: string,
  ): Promise<CompetitorWithAvailability[]> {
    const qb = this.competitorRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.characterVariant', 'variant')
      .leftJoinAndSelect('variant.baseCharacter', 'base')
      .orderBy('c.firstName', 'ASC');

    let competitors: Competitor[];

    // If query is empty, return all competitors
    if (!query || query.trim().length === 0) {
      competitors = await qb.getMany();
    } else {
      // Otherwise, filter by name
      competitors = await qb
        .where("LOWER(c.firstName || ' ' || c.lastName) LIKE LOWER(:query)", {
          query: `%${query}%`,
        })
        .orWhere('LOWER(c.firstName) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .orWhere('LOWER(c.lastName) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .limit(20)
        .getMany();
    }

    // Get all competitor IDs that are linked to users
    const competitorIds = competitors.map((c) => c.id);
    if (competitorIds.length === 0) {
      return [];
    }

    const linkedUsers = await this.userRepository.find({
      where: { competitorId: In(competitorIds) },
      select: ['competitorId'],
    });

    const linkedCompetitorIds = new Set(
      linkedUsers.map((u) => u.competitorId).filter(Boolean),
    );

    // Map to response with availability
    return competitors.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      profilePictureUrl: c.profilePictureUrl,
      characterVariant: c.characterVariant
        ? {
            id: c.characterVariant.id,
            label: c.characterVariant.label,
            imageUrl: c.characterVariant.imageUrl,
            baseCharacter: {
              id: c.characterVariant.baseCharacter.id,
              name: c.characterVariant.baseCharacter.name,
              imageUrl: c.characterVariant.baseCharacter.imageUrl,
            },
          }
        : null,
      isAvailable: !linkedCompetitorIds.has(c.id),
    }));
  }

  /**
   * Complete onboarding for a user
   * 1. Create or link competitor
   * 2. Link character variant to competitor
   * 3. Update user role and onboarding flag
   * Uses transaction for atomicity
   */
  async completeOnboarding(
    userId: string,
    dto: CompleteOnboardingDto,
  ): Promise<User> {
    this.logger.log(`Starting onboarding for user ${userId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.hasCompletedOnboarding) {
        throw new BadRequestException('User has already completed onboarding');
      }

      // BETTOR PATH: User chose to be bettor only (no competitor/character)
      if (dto.isSpectator) {
        user.role = UserRole.BETTOR;
        // hasCompletedOnboarding will automatically be true via getter (role=BETTOR)
        const updatedUser = await queryRunner.manager.save(user);
        await queryRunner.commitTransaction();
        this.logger.log(`User ${userId} completed onboarding as BETTOR`);
        return updatedUser;
      }

      // COMPETITOR PATH: Validate required fields
      if (!dto.characterVariantId) {
        throw new BadRequestException(
          'Character variant is required for competitors',
        );
      }

      let competitorId: string;

      // Option 1: Link to existing competitor
      if (dto.existingCompetitorId) {
        const competitor = await queryRunner.manager.findOne(Competitor, {
          where: { id: dto.existingCompetitorId },
        });

        if (!competitor) {
          throw new NotFoundException(
            `Competitor with ID ${dto.existingCompetitorId} not found`,
          );
        }

        // Check if competitor is already linked to another user
        const existingUser = await queryRunner.manager.findOne(User, {
          where: { competitorId: dto.existingCompetitorId },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new ConflictException(
            `Competitor "${competitor.firstName} ${competitor.lastName}" is already linked to another user`,
          );
        }

        competitorId = dto.existingCompetitorId;
        this.logger.log(`Linking user to existing competitor ${competitorId}`);
      }
      // Option 2: Create new competitor
      else if (dto.newCompetitor) {
        // Validate name input
        const firstName = dto.newCompetitor.firstName.trim();
        const lastName = dto.newCompetitor.lastName.trim();

        if (!firstName || !lastName) {
          throw new BadRequestException(
            'First name and last name cannot be empty',
          );
        }

        const newCompetitor = queryRunner.manager.create(Competitor, {
          firstName,
          lastName,
          profilePictureUrl: dto.newCompetitor.profilePictureUrl,
        });

        const savedCompetitor = await queryRunner.manager.save(newCompetitor);
        competitorId = savedCompetitor.id;
        this.logger.log(
          `Created new competitor ${competitorId}: ${firstName} ${lastName}`,
        );
      } else {
        throw new BadRequestException(
          'Must provide either existingCompetitorId or newCompetitor',
        );
      }

      // Verify character variant exists and is not already linked
      const characterVariant = await queryRunner.manager.findOne(
        CharacterVariant,
        {
          where: { id: dto.characterVariantId },
          relations: ['competitor', 'baseCharacter'],
        },
      );

      if (!characterVariant) {
        throw new NotFoundException(
          `Character variant with ID ${dto.characterVariantId} not found`,
        );
      }

      // Check if character variant is already linked to another competitor
      if (
        characterVariant.competitor &&
        characterVariant.competitor.id !== competitorId
      ) {
        throw new ConflictException(
          `Character variant "${characterVariant.baseCharacter.name} - ${characterVariant.label}" is already linked to another competitor`,
        );
      }

      // Link character variant to competitor (FK is on CharacterVariant side)
      characterVariant.competitor = { id: competitorId } as Competitor;
      await queryRunner.manager.save(characterVariant);

      // Update user
      user.competitorId = competitorId;
      user.role = UserRole.PLAYER; // User is now a player (competes, can also bet)
      // hasCompletedOnboarding will automatically be true via getter (role=PLAYER + competitorId set)

      const updatedUser = await queryRunner.manager.save(user);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Onboarding completed successfully for user ${userId} -> competitor ${competitorId}`,
      );

      return updatedUser;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Onboarding failed for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
