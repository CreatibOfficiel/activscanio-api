import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiImageService } from './services/gemini-image.service';
import { CanvasImageService } from './services/canvas-image.service';
import { ImageStorageService } from './services/image-storage.service';
import { TvDisplayService } from './services/tv-display.service';
import { ImageGenerationController } from './image-generation.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ImageGenerationController],
  providers: [
    GeminiImageService,
    CanvasImageService,
    ImageStorageService,
    TvDisplayService,
  ],
  exports: [
    GeminiImageService,
    CanvasImageService,
    ImageStorageService,
    TvDisplayService,
  ],
})
export class ImageGenerationModule {}
