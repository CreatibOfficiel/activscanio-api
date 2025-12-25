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
   * Export user's betting history to CSV
   * GET /api/export/bets/csv
   */
  @Get('bets/csv')
  async exportBettingHistoryCSV(
    @CurrentUser('userId') userId: string,
    @Res() res: Response,
  ) {
    try {
      const csv = await this.exportService.exportBettingHistoryToCSV(userId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="betting-history-${userId}-${Date.now()}.csv"`,
      );
      return res.send(csv);
    } catch (error) {
      throw new HttpException(
        'Failed to export betting history',
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
      return await this.exportService.exportStatsToJSON(userId);
    } catch (error) {
      throw new HttpException(
        'Failed to export stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Export leaderboard for a specific month/year to CSV
   * GET /api/export/leaderboard/csv?month=12&year=2025&limit=100
   */
  @Get('leaderboard/csv')
  async exportLeaderboardCSV(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('limit') limit: string,
    @Res() res: Response,
  ) {
    try {
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      const limitNum = limit ? parseInt(limit, 10) : 100;

      if (isNaN(monthNum) || isNaN(yearNum)) {
        throw new HttpException(
          'Invalid month or year parameter',
          HttpStatus.BAD_REQUEST,
        );
      }

      const csv = await this.exportService.exportLeaderboardToCSV(
        monthNum,
        yearNum,
        limitNum,
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="leaderboard-${yearNum}-${monthNum}.csv"`,
      );
      return res.send(csv);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to export leaderboard',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
