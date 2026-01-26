import {
  Controller,
  Post,
  Get,
  Body,
  HttpStatus,
  HttpException,
  UseGuards,
  StreamableFile,
  Header,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CanvasImageService } from './services/canvas-image.service';
import { ImageStorageService } from './services/image-storage.service';
import { TvDisplayService } from './services/tv-display.service';
import { GeminiImageService } from './services/gemini-image.service';
import { ClerkGuard } from '../auth/clerk.guard';

// Public decorator to bypass auth
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

class GenerateCelebrationDto {
  userName: string;
  characterName?: string;
  characterImageUrl?: string;
  score: number;
  raceTitle: string;
}

class GenerateRaceAnnouncementDto {
  raceTitle: string;
  scheduledTime: string;
  podiumCompetitors: Array<{
    position: number;
    name: string;
    imageUrl?: string;
  }>;
}

class SendToTvDto {
  imageUrl: string;
  type: 'celebration' | 'race_announcement' | 'notification';
  duration?: number;
  priority?: number;
  title?: string;
  subtitle?: string;
}

@ApiTags('image-generation')
@ApiBearerAuth()
@Controller('image-generation')
@UseGuards(ClerkGuard)
export class ImageGenerationController {
  constructor(
    private readonly canvasImageService: CanvasImageService,
    private readonly imageStorageService: ImageStorageService,
    private readonly tvDisplayService: TvDisplayService,
    private readonly geminiImageService: GeminiImageService,
  ) {}

  /**
   * Generate a perfect score celebration image
   */
  @Post('celebration')
  @ApiOperation({ summary: 'Generate a perfect score celebration image' })
  @ApiResponse({
    status: 201,
    description: 'Image generated and stored successfully',
  })
  async generateCelebration(
    @Body() dto: GenerateCelebrationDto,
  ): Promise<{ imageUrl: string; sentToTv: boolean }> {
    try {
      // Generate image using canvas
      const imageBuffer =
        await this.canvasImageService.generatePerfectScoreCelebration({
          userName: dto.userName,
          characterName: dto.characterName,
          characterImageUrl: dto.characterImageUrl,
          score: dto.score,
          raceTitle: dto.raceTitle,
          date: new Date(),
        });

      // Upload to storage
      const imageUrl = await this.imageStorageService.uploadImage(
        imageBuffer,
        'celebration',
      );

      // Send to TV display
      const sentToTv = await this.tvDisplayService.sendImageToTv(imageUrl, {
        type: 'celebration',
        duration: 15,
        priority: 10,
        title: `Perfect Score - ${dto.userName}`,
        subtitle: dto.raceTitle,
      });

      return {
        imageUrl,
        sentToTv,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to generate celebration image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generate a race announcement image
   */
  @Post('race-announcement')
  @ApiOperation({ summary: 'Generate a race announcement image with podium' })
  @ApiResponse({ status: 201, description: 'Image generated successfully' })
  async generateRaceAnnouncement(
    @Body() dto: GenerateRaceAnnouncementDto,
  ): Promise<{ imageUrl: string; sentToTv: boolean }> {
    try {
      const imageBuffer =
        await this.canvasImageService.generateRaceAnnouncement({
          raceTitle: dto.raceTitle,
          scheduledTime: new Date(dto.scheduledTime),
          podiumCompetitors: dto.podiumCompetitors,
        });

      const imageUrl = await this.imageStorageService.uploadImage(
        imageBuffer,
        'race_announcement',
      );

      const sentToTv = await this.tvDisplayService.sendImageToTv(imageUrl, {
        type: 'race_announcement',
        duration: 20,
        priority: 8,
        title: 'Prochaine Course',
        subtitle: dto.raceTitle,
      });

      return {
        imageUrl,
        sentToTv,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to generate race announcement',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Send an existing image URL to TV display
   */
  @Post('send-to-tv')
  @ApiOperation({ summary: 'Send an image URL to TV display' })
  @ApiResponse({ status: 200, description: 'Image sent to TV successfully' })
  async sendToTv(@Body() dto: SendToTvDto): Promise<{ success: boolean }> {
    const success = await this.tvDisplayService.sendImageToTv(dto.imageUrl, {
      type: dto.type,
      duration: dto.duration,
      priority: dto.priority,
      title: dto.title,
      subtitle: dto.subtitle,
    });

    return { success };
  }

  /**
   * Health check for TV display
   */
  @Get('tv-health')
  @ApiOperation({ summary: 'Check TV display connectivity' })
  @ApiResponse({ status: 200, description: 'TV display status' })
  async tvHealthCheck(): Promise<{
    enabled: boolean;
    url: string | null;
    healthy: boolean;
  }> {
    const enabled = this.tvDisplayService.isEnabled();
    const url = this.tvDisplayService.getUrl();
    const healthy = enabled ? await this.tvDisplayService.healthCheck() : false;

    return {
      enabled,
      url,
      healthy,
    };
  }

  /**
   * Send test image to TV
   */
  @Post('tv-test')
  @ApiOperation({ summary: 'Send a test image to TV display' })
  @ApiResponse({ status: 200, description: 'Test image sent' })
  async sendTestToTv(): Promise<{ success: boolean }> {
    const success = await this.tvDisplayService.sendTestImage();
    return { success };
  }

  /**
   * Get storage statistics
   */
  @Get('storage-stats')
  @ApiOperation({ summary: 'Get image storage statistics' })
  @ApiResponse({ status: 200, description: 'Storage stats' })
  async getStorageStats(): Promise<{
    type: string;
    totalImages: number;
    totalSize: number;
  }> {
    return await this.imageStorageService.getStats();
  }

  /**
   * List all images
   */
  @Get('images')
  @ApiOperation({ summary: 'List all stored images' })
  @ApiResponse({ status: 200, description: 'List of image URLs' })
  async listImages(): Promise<{ images: string[] }> {
    const images = await this.imageStorageService.listImages();
    return { images };
  }

  /**
   * Test Gemini AI health
   */
  @Get('gemini-health')
  @ApiOperation({ summary: 'Check Gemini AI API connectivity' })
  @ApiResponse({ status: 200, description: 'Gemini AI status' })
  async geminiHealthCheck(): Promise<{ healthy: boolean }> {
    const healthy = await this.geminiImageService.healthCheck();
    return { healthy };
  }

  /**
   * PUBLIC TEST ENDPOINT - Generate a test celebration image (no auth required)
   */
  @Public()
  @Get('test-celebration')
  @ApiOperation({
    summary: 'Generate a test celebration image (public endpoint for testing)',
  })
  @ApiResponse({
    status: 200,
    description: 'Test image generated successfully',
  })
  async testCelebration(): Promise<{
    imageUrl: string;
    sentToTv: boolean;
    message: string;
  }> {
    try {
      // Generate test image
      const imageBuffer =
        await this.canvasImageService.generatePerfectScoreCelebration({
          userName: 'TestUser',
          characterName: 'Mario',
          characterImageUrl: undefined,
          score: 60,
          raceTitle: 'Test Race - Week 1',
          date: new Date(),
        });

      // Upload to storage
      const imageUrl = await this.imageStorageService.uploadImage(
        imageBuffer,
        'celebration',
      );

      // Try to send to TV display (won't fail if TV is not configured)
      const sentToTv = await this.tvDisplayService.sendImageToTv(imageUrl, {
        type: 'celebration',
        duration: 15,
        priority: 10,
        title: 'Test Perfect Score',
        subtitle: 'Test Race - Week 1',
      });

      return {
        imageUrl,
        sentToTv,
        message:
          'Test celebration image generated successfully! Visit the imageUrl to view it.',
      };
    } catch (error) {
      throw new HttpException(
        `Failed to generate test celebration: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
