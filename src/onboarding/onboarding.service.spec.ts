import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { OnboardingService } from './onboarding.service';
import { User, UserRole } from '../users/user.entity';
import { Competitor } from '../competitors/competitor.entity';
import { CharacterVariant } from '../character-variants/character-variant.entity';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let userRepository: Repository<User>;
  let competitorRepository: Repository<Competitor>;
  let characterVariantRepository: Repository<CharacterVariant>;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Competitor),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(CharacterVariant),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    competitorRepository = module.get<Repository<Competitor>>(
      getRepositoryToken(Competitor),
    );
    characterVariantRepository = module.get<Repository<CharacterVariant>>(
      getRepositoryToken(CharacterVariant),
    );
    dataSource = module.get<DataSource>(DataSource);
    queryRunner = mockQueryRunner as unknown as QueryRunner;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchCompetitors', () => {
    it('should search competitors by query', async () => {
      const mockCompetitors = [
        {
          id: '1',
          firstName: 'Mario',
          lastName: 'Bros',
          characterVariant: { id: 'v1', label: 'Standard' },
        },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(mockCompetitors);

      const result = await service.searchCompetitors('Mario');

      expect(competitorRepository.createQueryBuilder).toHaveBeenCalledWith('c');
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockCompetitors);
    });

    it('should return empty array when no competitors found', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.searchCompetitors('NonExistent');

      expect(result).toEqual([]);
    });
  });

  describe('completeOnboarding', () => {
    const userId = 'user-1';
    const competitorId = 'competitor-1';
    const variantId = 'variant-1';

    // Helper functions to create fresh mock objects for each test
    const createMockUser = (overrides?: Partial<User>): Partial<User> => ({
      id: userId,
      hasCompletedOnboarding: false,
      role: UserRole.SPECTATOR,
      ...overrides,
    });

    const createMockCompetitor = (overrides?: Partial<Competitor>): Partial<Competitor> => ({
      id: competitorId,
      firstName: 'Mario',
      lastName: 'Bros',
      ...overrides,
    });

    const createMockVariant = (overrides?: Partial<CharacterVariant>): Partial<CharacterVariant> => ({
      id: variantId,
      label: 'Standard',
      competitor: undefined,
      baseCharacter: { id: 'base-1', name: 'Mario' } as any,
      ...overrides,
    });

    beforeEach(() => {
      mockQueryRunner.connect.mockResolvedValue(undefined);
      mockQueryRunner.startTransaction.mockResolvedValue(undefined);
      mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
      mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
      mockQueryRunner.release.mockResolvedValue(undefined);
    });

    describe('with existing competitor', () => {
      it('should link user to existing competitor successfully', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();
        const mockCompetitor = createMockCompetitor();
        const mockVariant = createMockVariant();

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(mockCompetitor) // Find competitor
          .mockResolvedValueOnce(null) // Check if competitor already linked
          .mockResolvedValueOnce(mockVariant); // Find character variant

        const updatedUser = {
          ...mockUser,
          competitorId,
          role: UserRole.BOTH,
          hasCompletedOnboarding: true,
        };
        mockQueryRunner.manager.save.mockResolvedValue(updatedUser);

        const result = await service.completeOnboarding(userId, dto);

        expect(mockQueryRunner.connect).toHaveBeenCalled();
        expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        expect(result).toEqual(updatedUser);
      });

      it('should throw NotFoundException if competitor not found', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: 'non-existent',
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(null); // Competitor not found

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          NotFoundException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });

      it('should throw ConflictException if competitor already linked to another user', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();
        const mockCompetitor = createMockCompetitor();
        const anotherUser = { id: 'another-user', competitorId };

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(mockCompetitor) // Find competitor
          .mockResolvedValueOnce(anotherUser); // Already linked to another user

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          ConflictException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });
    });

    describe('with new competitor', () => {
      it('should create new competitor successfully', async () => {
        const dto: CompleteOnboardingDto = {
          newCompetitor: {
            firstName: 'Luigi',
            lastName: 'Bros',
            profilePictureUrl: 'https://example.com/luigi.jpg',
          },
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();
        const mockVariant = createMockVariant();
        const newCompetitor = {
          id: 'new-competitor-id',
          ...dto.newCompetitor,
        };

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(mockVariant); // Find character variant

        mockQueryRunner.manager.create.mockReturnValue(newCompetitor);
        mockQueryRunner.manager.save
          .mockResolvedValueOnce(newCompetitor) // Save new competitor
          .mockResolvedValueOnce({
            // Save updated user
            ...mockUser,
            competitorId: newCompetitor.id,
            role: UserRole.BOTH,
            hasCompletedOnboarding: true,
          });

        const result = await service.completeOnboarding(userId, dto);

        expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
          Competitor,
          expect.objectContaining({
            firstName: 'Luigi',
            lastName: 'Bros',
          }),
        );
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        expect(result.hasCompletedOnboarding).toBe(true);
      });

      it('should throw BadRequestException if name is empty', async () => {
        const dto: CompleteOnboardingDto = {
          newCompetitor: {
            firstName: '   ',
            lastName: 'Bros',
            profilePictureUrl: '',
          },
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();

        mockQueryRunner.manager.findOne.mockResolvedValueOnce(mockUser);

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          BadRequestException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });
    });

    describe('validation', () => {
      it('should throw NotFoundException if user not found', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: variantId,
        };

        mockQueryRunner.manager.findOne.mockResolvedValueOnce(null); // User not found

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          NotFoundException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });

      it('should throw BadRequestException if user already completed onboarding', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: variantId,
        };

        const completedUser = createMockUser({ hasCompletedOnboarding: true });

        mockQueryRunner.manager.findOne.mockResolvedValueOnce(completedUser);

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          BadRequestException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });

      it('should throw BadRequestException if neither existingCompetitorId nor newCompetitor provided', async () => {
        const dto: CompleteOnboardingDto = {
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();

        mockQueryRunner.manager.findOne.mockResolvedValueOnce(mockUser);

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          BadRequestException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });

      it('should throw NotFoundException if character variant not found', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: 'non-existent',
        };

        const mockUser = createMockUser();
        const mockCompetitor = createMockCompetitor();

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(mockCompetitor) // Find competitor
          .mockResolvedValueOnce(null) // Check competitor link
          .mockResolvedValueOnce(null); // Character variant not found

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          NotFoundException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });

      it('should throw ConflictException if character variant already linked to another competitor', async () => {
        const dto: CompleteOnboardingDto = {
          existingCompetitorId: competitorId,
          characterVariantId: variantId,
        };

        const mockUser = createMockUser();
        const mockCompetitor = createMockCompetitor();
        const linkedVariant = createMockVariant({
          competitor: { id: 'another-competitor' } as Competitor,
        });

        mockQueryRunner.manager.findOne
          .mockResolvedValueOnce(mockUser) // Find user
          .mockResolvedValueOnce(mockCompetitor) // Find competitor
          .mockResolvedValueOnce(null) // Check competitor link
          .mockResolvedValueOnce(linkedVariant); // Variant already linked

        await expect(service.completeOnboarding(userId, dto)).rejects.toThrow(
          ConflictException,
        );

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      });
    });
  });

  describe('skipOnboarding', () => {
    it('should mark user as completed onboarding', async () => {
      const userId = 'user-1';
      const mockUser: Partial<User> = {
        id: userId,
        hasCompletedOnboarding: false,
      };

      const updatedUser = {
        ...mockUser,
        hasCompletedOnboarding: true,
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepository, 'save').mockResolvedValue(updatedUser as User);

      const result = await service.skipOnboarding(userId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ hasCompletedOnboarding: true }),
      );
      expect(result.hasCompletedOnboarding).toBe(true);
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'non-existent';

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.skipOnboarding(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
