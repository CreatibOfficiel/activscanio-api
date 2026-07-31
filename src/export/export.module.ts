import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { ShareController } from './share.controller';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { User } from '../users/user.entity';
import { ShareImageService } from '../image-generation/services/share-image.service';
import { ImageStorageService } from '../image-generation/services/image-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserAchievement, User])],
  controllers: [ExportController, ShareController],
  providers: [ExportService, ShareImageService, ImageStorageService],
  exports: [ExportService],
})
export class ExportModule {}
