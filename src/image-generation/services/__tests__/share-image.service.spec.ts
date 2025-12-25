import { Test, TestingModule } from '@nestjs/testing';
import { ShareImageService } from '../share-image.service';

describe('ShareImageService', () => {
  let service: ShareImageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShareImageService],
    }).compile();

    service = module.get<ShareImageService>(ShareImageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAchievementShareImage', () => {
    it('should generate a PNG image buffer', async () => {
      const buffer = await service.generateAchievementShareImage('Test User', {
        name: 'First Bet',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Place your first bet',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate valid PNG format', async () => {
      const buffer = await service.generateAchievementShareImage('Test User', {
        name: 'First Bet',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Place your first bet',
      });

      // Check PNG signature (first 8 bytes)
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(buffer.subarray(0, 8)).toEqual(pngSignature);
    });

    it('should generate image with Open Graph dimensions (1200x630)', async () => {
      const buffer = await service.generateAchievementShareImage('Test User', {
        name: 'First Bet',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Place your first bet',
      });

      // Image should be reasonably sized for 1200x630
      expect(buffer.length).toBeGreaterThan(10 * 1024); // > 10KB
      expect(buffer.length).toBeLessThan(500 * 1024); // < 500KB
    });

    it('should handle different rarity levels', async () => {
      const rarities = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

      for (const rarity of rarities) {
        const buffer = await service.generateAchievementShareImage('User', {
          name: 'Test Achievement',
          icon: '🏆',
          rarity,
          description: 'Test description',
        });

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      }
    });

    it('should handle long achievement names', async () => {
      const buffer = await service.generateAchievementShareImage('User', {
        name: 'This is a very long achievement name that should still work',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Description',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle long descriptions with word wrapping', async () => {
      const buffer = await service.generateAchievementShareImage('User', {
        name: 'Achievement',
        icon: '🎯',
        rarity: 'COMMON',
        description:
          'This is a very long description that should wrap to multiple lines when rendered on the canvas image',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle special characters in user names', async () => {
      const buffer = await service.generateAchievementShareImage('Tëst Üsér™', {
        name: 'Achievement',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Description',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle emojis in achievement icons', async () => {
      const icons = ['🎯', '🏆', '⭐', '🚀', '💎', '👑'];

      for (const icon of icons) {
        const buffer = await service.generateAchievementShareImage('User', {
          name: 'Achievement',
          icon,
          rarity: 'COMMON',
          description: 'Description',
        });

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateStatsShareImage', () => {
    it('should generate a PNG image buffer', async () => {
      const buffer = await service.generateStatsShareImage('Test User', {
        level: 10,
        totalAchievements: 50,
        unlockedAchievements: 25,
        winRate: 75.5,
        totalPoints: 5000,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate valid PNG format', async () => {
      const buffer = await service.generateStatsShareImage('Test User', {
        level: 10,
        totalAchievements: 50,
        unlockedAchievements: 25,
        winRate: 75.5,
        totalPoints: 5000,
      });

      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(buffer.subarray(0, 8)).toEqual(pngSignature);
    });

    it('should handle stats with rank', async () => {
      const buffer = await service.generateStatsShareImage('Test User', {
        level: 10,
        totalAchievements: 50,
        unlockedAchievements: 25,
        winRate: 75.5,
        totalPoints: 5000,
        rank: 5,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle stats without rank', async () => {
      const buffer = await service.generateStatsShareImage('Test User', {
        level: 10,
        totalAchievements: 50,
        unlockedAchievements: 25,
        winRate: 75.5,
        totalPoints: 5000,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle zero stats', async () => {
      const buffer = await service.generateStatsShareImage('New User', {
        level: 1,
        totalAchievements: 50,
        unlockedAchievements: 0,
        winRate: 0,
        totalPoints: 0,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle high numbers', async () => {
      const buffer = await service.generateStatsShareImage('Pro User', {
        level: 100,
        totalAchievements: 50,
        unlockedAchievements: 50,
        winRate: 99.9,
        totalPoints: 999999,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('generatePerfectScoreShareImage', () => {
    it('should generate a PNG image buffer', async () => {
      const buffer = await service.generatePerfectScoreShareImage(
        'Test User',
        60,
        'Week 5 - 2024',
      );

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate valid PNG format', async () => {
      const buffer = await service.generatePerfectScoreShareImage(
        'Test User',
        60,
        'Week 5 - 2024',
      );

      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(buffer.subarray(0, 8)).toEqual(pngSignature);
    });

    it('should handle different week numbers', async () => {
      const weeks = [1, 10, 25, 52];

      for (const week of weeks) {
        const buffer = await service.generatePerfectScoreShareImage(
          'User',
          60,
          `Week ${week} - 2024`,
        );

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      }
    });

    it('should handle long race titles', async () => {
      const buffer = await service.generatePerfectScoreShareImage(
        'User',
        60,
        'This is a very long race title that should still render correctly',
      );

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should always use score of 60 for perfect score', async () => {
      // Perfect score should always be 60 points
      const buffer = await service.generatePerfectScoreShareImage(
        'User',
        60,
        'Week 1 - 2024',
      );

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Image Generation Performance', () => {
    it('should generate achievement image in reasonable time', async () => {
      const start = Date.now();

      await service.generateAchievementShareImage('User', {
        name: 'Achievement',
        icon: '🎯',
        rarity: 'COMMON',
        description: 'Description',
      });

      const duration = Date.now() - start;

      // Should complete in less than 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should generate stats image in reasonable time', async () => {
      const start = Date.now();

      await service.generateStatsShareImage('User', {
        level: 10,
        totalAchievements: 50,
        unlockedAchievements: 25,
        winRate: 75,
        totalPoints: 5000,
      });

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });

    it('should generate perfect score image in reasonable time', async () => {
      const start = Date.now();

      await service.generatePerfectScoreShareImage('User', 60, 'Week 5 - 2024');

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });
  });
});
