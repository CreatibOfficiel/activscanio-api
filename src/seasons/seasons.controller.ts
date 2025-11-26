import {
  Controller,
  Get,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SeasonsService } from './seasons.service';
import { ClerkGuard } from '../auth/clerk.guard';

@ApiTags('seasons')
@ApiBearerAuth()
@Controller('seasons')
@UseGuards(ClerkGuard)
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  /**
   * GET /seasons
   * Get all seasons
   */
  @Get()
  @ApiOperation({ summary: 'Get all archived seasons' })
  @ApiResponse({ status: 200, description: 'List of all seasons with stats' })
  async getAllSeasons() {
    return await this.seasonsService.getAllSeasons();
  }

  /**
   * GET /seasons/:year/:month
   * Get specific season
   */
  @Get(':year/:month')
  @ApiOperation({ summary: 'Get a specific season by year and month' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({ name: 'month', description: 'Season month (1-12)', example: '1' })
  @ApiResponse({ status: 200, description: 'Season details with stats' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getSeason(@Param('year') year: string, @Param('month') month: string) {
    return await this.seasonsService.getSeason(
      parseInt(month),
      parseInt(year),
    );
  }

  /**
   * GET /seasons/:year/:month/competitors
   * Get competitor rankings for a season
   */
  @Get(':year/:month/competitors')
  @ApiOperation({ summary: 'Get competitor rankings for a specific season' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({ name: 'month', description: 'Season month (1-12)', example: '1' })
  @ApiResponse({ status: 200, description: 'List of competitors with their ELO rankings' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getCompetitorRankings(
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    const season = await this.seasonsService.getSeason(
      parseInt(month),
      parseInt(year),
    );

    if (!season) {
      throw new NotFoundException('Season not found');
    }

    return await this.seasonsService.getCompetitorRankings(season.id);
  }

  /**
   * GET /seasons/:year/:month/bettors
   * Get bettor rankings for a season
   */
  @Get(':year/:month/bettors')
  @ApiOperation({ summary: 'Get bettor rankings for a specific season' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({ name: 'month', description: 'Season month (1-12)', example: '1' })
  @ApiResponse({ status: 200, description: 'List of bettors with their points and rankings' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getBettorRankings(
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return await this.seasonsService.getBettorRankings(
      parseInt(month),
      parseInt(year),
    );
  }

  /**
   * GET /seasons/:year/:month/weeks
   * Get betting weeks for a season
   */
  @Get(':year/:month/weeks')
  @ApiOperation({ summary: 'Get all betting weeks for a specific season' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({ name: 'month', description: 'Season month (1-12)', example: '1' })
  @ApiResponse({ status: 200, description: 'List of betting weeks with their status' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getBettingWeeks(
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return await this.seasonsService.getBettingWeeks(
      parseInt(month),
      parseInt(year),
    );
  }
}
