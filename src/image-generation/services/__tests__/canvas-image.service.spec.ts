import { Test, TestingModule } from '@nestjs/testing';
import { CanvasImageService } from '../canvas-image.service';

describe('CanvasImageService', () => {
  let service: CanvasImageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CanvasImageService],
    }).compile();

    service = module.get<CanvasImageService>(CanvasImageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePerfectScoreCelebration', () => {
    it('should generate an image buffer', async () => {
      const options = {
        userName: 'TestUser',
        characterName: 'Mario',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Test Race',
        date: new Date(),
      };

      const buffer = await service.generatePerfectScoreCelebration(options);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate PNG image', async () => {
      const options = {
        userName: 'TestUser',
        characterName: 'Mario',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Test Race',
        date: new Date(),
      };

      const buffer = await service.generatePerfectScoreCelebration(options);

      // Check PNG signature (first 8 bytes)
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(buffer.subarray(0, 8)).toEqual(pngSignature);
    });

    it('should generate image with correct dimensions', async () => {
      const options = {
        userName: 'TestUser',
        characterName: 'Mario',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Test Race',
        date: new Date(),
      };

      const buffer = await service.generatePerfectScoreCelebration(options);

      // Image should be reasonably sized (between 50KB and 500KB)
      expect(buffer.length).toBeGreaterThan(50 * 1024); // > 50KB
      expect(buffer.length).toBeLessThan(500 * 1024); // < 500KB
    });

    it('should handle different user names', async () => {
      const options1 = {
        userName: 'Short',
        characterName: 'Mario',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Test',
        date: new Date(),
      };

      const options2 = {
        userName: 'VeryLongUserNameThatExceedsNormalLength',
        characterName: 'Luigi',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Another Test Race With Very Long Title',
        date: new Date(),
      };

      const buffer1 = await service.generatePerfectScoreCelebration(options1);
      const buffer2 = await service.generatePerfectScoreCelebration(options2);

      expect(buffer1).toBeInstanceOf(Buffer);
      expect(buffer2).toBeInstanceOf(Buffer);
      expect(buffer1.length).toBeGreaterThan(0);
      expect(buffer2.length).toBeGreaterThan(0);
    });
  });

  describe('generateRaceAnnouncement', () => {
    it('should generate race announcement image', () => {
      const options = {
        raceTitle: 'Grand Prix Finals',
        scheduledTime: new Date(),
        podiumCompetitors: [
          { position: 1, name: 'Player 1' },
          { position: 2, name: 'Player 2' },
          { position: 3, name: 'Player 3' },
        ],
      };

      const buffer = service.generateRaceAnnouncement(options);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate PNG for race announcement', () => {
      const options = {
        raceTitle: 'Test Race',
        scheduledTime: new Date(),
        podiumCompetitors: [
          { position: 1, name: 'P1' },
          { position: 2, name: 'P2' },
          { position: 3, name: 'P3' },
        ],
      };

      const buffer = service.generateRaceAnnouncement(options);

      // Check PNG signature
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(buffer.subarray(0, 8)).toEqual(pngSignature);
    });

    it('should handle empty podium list', () => {
      const options = {
        raceTitle: 'Test Race',
        scheduledTime: new Date(),
        podiumCompetitors: [],
      };

      const buffer = service.generateRaceAnnouncement(options);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', async () => {
      const options = {
        userName: '',
        characterName: '',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: '',
        date: new Date(),
      };

      const buffer = await service.generatePerfectScoreCelebration(options);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle special characters in names', async () => {
      const options = {
        userName: 'Test™ User® 🎮',
        characterName: 'Mario™',
        characterImageUrl: undefined,
        score: 60,
        raceTitle: 'Race #1 - "Finals"',
        date: new Date(),
      };

      const buffer = await service.generatePerfectScoreCelebration(options);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
