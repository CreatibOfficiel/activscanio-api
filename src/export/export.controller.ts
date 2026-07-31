/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * Export user's achievements to CSV
   * GET /api/export/achievements/csv
   */
  @Get('achievements/csv')
  async exportAchievementsCSV(
    @CurrentUser('userId') userId: string,
    @Res() res: Response,
  ) {
    try {
      const csv = await this.exportService.exportAchievementsToCSV(userId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="achievements-${userId}-${Date.now()}.csv"`,
      );
      return res.send(csv);
    } catch (error) {
      throw new HttpException(
        'Failed to export achievements',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Export user's comprehensive stats to JSON
   * GET /api/export/stats/json
   */
  @Get('stats/json')
  async exportStatsJSON(@CurrentUser('userId') userId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.exportService.exportStatsToJSON(userId);
    } catch (error) {
      throw new HttpException(
        'Failed to export stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
