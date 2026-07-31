import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SeasonsService } from './seasons.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  /**
   * GET /seasons
   * Get all seasons
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all archived seasons' })
  @ApiResponse({ status: 200, description: 'List of all seasons with stats' })
  async getAllSeasons() {
    return await this.seasonsService.getAllSeasons();
  }

  /**
   * GET /seasons/:year/:season
   * Get specific season (route param is called "month" for backward compat but accepts seasonNumber 1-13)
   */
  @Public()
  @Get(':year/:month')
  @ApiOperation({ summary: 'Get a specific season by year and season number' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({
    name: 'month',
    description: 'Season number (1-13)',
    example: '1',
  })
  @ApiResponse({ status: 200, description: 'Season details with stats' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getSeason(@Param('year') year: string, @Param('month') month: string) {
    return await this.seasonsService.getSeason(parseInt(month), parseInt(year));
  }

  /**
   * GET /seasons/:year/:season/highlights
   * Get season highlights for the recap modal
   */
  @Public()
  @Get(':year/:month/highlights')
  @ApiOperation({ summary: 'Get season highlights for the wrapped recap' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2026' })
  @ApiParam({
    name: 'month',
    description: 'Season number (1-13)',
    example: '2',
  })
  @ApiResponse({
    status: 200,
    description: 'Season highlights (perfect scores, upsets, streaks, etc.)',
  })
  async getSeasonHighlights(
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return await this.seasonsService.getSeasonHighlights(
      parseInt(month),
      parseInt(year),
    );
  }

  /**
   * GET /seasons/:year/:season/competitors
   * Get competitor rankings for a season
   */
  @Public()
  @Get(':year/:month/competitors')
  @ApiOperation({ summary: 'Get competitor rankings for a specific season' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({
    name: 'month',
    description: 'Season number (1-13)',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'List of competitors with their ELO rankings',
  })
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

  @Public()
  @Get(':year/:month/pingpong')
  @ApiOperation({ summary: 'Get ping-pong rankings for a specific season' })
  @ApiParam({ name: 'year', description: 'Season year', example: '2024' })
  @ApiParam({
    name: 'month',
    description: 'Season number (1-13)',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'List of ping-pong players with their final standings',
  })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async getPingpongRankings(
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

    return await this.seasonsService.getPingpongRankings(season.id);
  }
}
