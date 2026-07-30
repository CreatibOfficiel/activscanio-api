/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ShareController } from '../share.controller';
import { ShareImageService } from '../../image-generation/services/share-image.service';
import { ImageStorageService } from '../../image-generation/services/image-storage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAchievement } from '../../achievements/entities/user-achievement.entity';
import { User } from '../../users/user.entity';
import { HttpException, HttpStatus, StreamableFile } from '@nestjs/common';

// Mock uuid to avoid ESM issues
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

describe('ShareController', () => {
  let controller: ShareController;
  let shareImageService: ShareImageService;
  let userAchievementRepository: Repository<UserAchievement>;
  let userRepository: Repository<User>;

  const mockUser = {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    level: 10,
    xp: 5000,
  };

  const mockAchievement = {
    id: 'achievement-123',
    key: 'perfect_podium',
    name: 'Perfect Podium',
    description: 'Get a perfect score',
    category: 'PRECISION',
    rarity: 'RARE',
    xpReward: 100,
    icon: '🏆',
  };

  const mockUserAchievement = {
    id: 'ua-123',
    userId: 'user-123',
    achievementId: 'achievement-123',
    unlockedAt: new Date(),
    achievement: mockAchievement,
  };

  const mockBet = {
    id: 'bet-123',
    userId: 'user-123',
    pointsEarned: 60,
    isFinalized: true,
    createdAt: new Date(),
    bettingWeek: {
      weekNumber: 5,
      year: 2024,
    },
  };

  const mockImageBuffer = Buffer.from('fake-image-data');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShareController],
      providers: [
        {
          provide: ShareImageService,
          useValue: {
            generateAchievementShareImage: jest.fn(),
            generateStatsShareImage: jest.fn(),
            generatePerfectScoreShareImage: jest.fn(),
          },
        },
        {
          provide: ImageStorageService,
          useValue: {
            uploadImage: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserAchievement),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
            manager: {
              getRepository: jest.fn(),
            },
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            manager: {
              findOne: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<ShareController>(ShareController);
    shareImageService = module.get<ShareImageService>(ShareImageService);
    userAchievementRepository = module.get<Repository<UserAchievement>>(
      getRepositoryToken(UserAchievement),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('shareAchievement', () => {
    it('should generate and return achievement share image', async () => {
      jest
        .spyOn(userAchievementRepository, 'findOne')
        .mockResolvedValue(mockUserAchievement as any);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(shareImageService, 'generateAchievementShareImage')
        .mockResolvedValue(mockImageBuffer);

      const result = await controller.shareAchievement('ua-123', 'user-123');

      expect(result).toBeInstanceOf(StreamableFile);
      expect(
        shareImageService.generateAchievementShareImage,
      ).toHaveBeenCalledWith('John Doe', {
        name: 'Perfect Podium',
        icon: '🏆',
        rarity: 'RARE',
        description: 'Get a perfect score',
      });
    });

    it('should throw 404 if achievement not found', async () => {
      jest.spyOn(userAchievementRepository, 'findOne').mockResolvedValue(null);

      await expect(
        controller.shareAchievement('ua-999', 'user-123'),
      ).rejects.toThrow(
        new HttpException('Achievement not found', HttpStatus.NOT_FOUND),
      );
    });

    it('should throw 404 if user not found', async () => {
      jest
        .spyOn(userAchievementRepository, 'findOne')
        .mockResolvedValue(mockUserAchievement as any);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        controller.shareAchievement('ua-123', 'user-123'),
      ).rejects.toThrow(
        new HttpException('User not found', HttpStatus.NOT_FOUND),
      );
    });

    it('should only return achievements belonging to the user', async () => {
      jest
        .spyOn(userAchievementRepository, 'findOne')
        .mockResolvedValue(mockUserAchievement as any);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as any);
      jest
        .spyOn(shareImageService, 'generateAchievementShareImage')
        .mockResolvedValue(mockImageBuffer);

      await controller.shareAchievement('ua-123', 'user-123');

      expect(userAchievementRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'ua-123', userId: 'user-123' },
        relations: ['achievement'],
      });
    });
  });


});
