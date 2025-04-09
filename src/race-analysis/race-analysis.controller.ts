import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RaceAnalysisService } from './race-analysis.service';
import { UploadService } from '../upload/upload.service';

interface AnalysisRequest {
  competitorId: string;
}

@Controller('race-analysis')
export class RaceAnalysisController {
  constructor(
    private raceAnalysisService: RaceAnalysisService,
    private uploadService: UploadService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: AnalysisRequest,
  ) {
    const filePath = this.uploadService.getFilePath(file.filename);
    try {
      const analysis = await this.raceAnalysisService.analyzeRaceImage(
        filePath,
        body.competitorId,
      );
      return analysis;
    } catch (error) {
      // Supprimer le fichier en cas d'erreur
      this.uploadService.removeFile(file.filename);
      throw error;
    }
  }
}
