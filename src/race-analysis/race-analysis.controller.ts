import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  ParseArrayPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RaceAnalysisService } from './race-analysis.service';
import { UploadService } from 'src/upload/upload.service';
import * as fs from 'fs';
import { MIN_HUMAN_PLAYERS } from '../config/race-format.config';

@Controller('race-analysis')
export class RaceAnalysisController {
  constructor(
    private readonly raceAnalysisService: RaceAnalysisService,
    private readonly uploadService: UploadService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body(
      'competitorIds',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    competitorIds: string[] = [],
  ) {
    if (!file) {
      throw new BadRequestException('Aucune image reçue');
    }
    if (competitorIds.length < MIN_HUMAN_PLAYERS) {
      throw new BadRequestException(
        `Au moins ${MIN_HUMAN_PLAYERS} ids de joueurs sont requis`,
      );
    }

    const filePath = this.uploadService.getFilePath(file.filename);
    try {
      const base64 = fs.readFileSync(filePath).toString('base64');
      const list = await this.raceAnalysisService.analyzeRaceImage(
        base64,
        competitorIds,
      );
      this.uploadService.removeFile(file.filename);
      return { results: list };
    } catch (err) {
      this.uploadService.removeFile(file.filename);
      throw err;
    }
  }
}
