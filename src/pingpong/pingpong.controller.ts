import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PingpongPlayersService } from './services/pingpong-players.service';
import { PingpongMatchService } from './services/pingpong-match.service';
import { PingpongMatch } from './entities/pingpong-match.entity';
import { PingpongEloSnapshot } from './entities/pingpong-elo-snapshot.entity';
import { EnrolPlayerDto, RecordMatchDto } from './dtos/record-match.dto';

@ApiTags('pingpong')
@Controller('pingpong')
export class PingpongController {
  constructor(
    private readonly playersService: PingpongPlayersService,
    private readonly matchService: PingpongMatchService,
    @InjectRepository(PingpongMatch)
    private readonly matchRepository: Repository<PingpongMatch>,
    @InjectRepository(PingpongEloSnapshot)
    private readonly snapshotRepository: Repository<PingpongEloSnapshot>,
  ) {}

  @Public()
  @Get('leaderboard')
  @ApiOperation({ summary: 'Ping-pong leaderboard' })
  @ApiResponse({ status: 200, description: 'Players, ranked where eligible' })
  async getLeaderboard() {
    return this.playersService.getLeaderboard();
  }

  @Public()
  @Get('players')
  @ApiOperation({ summary: 'All ping-pong players' })
  async getPlayers() {
    return this.playersService.getLeaderboard();
  }

  @Public()
  @Get('players/:competitorId')
  @ApiOperation({ summary: 'One player, by competitor id' })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getPlayer(@Param('competitorId') competitorId: string) {
    return this.playersService.getPlayerByCompetitorId(competitorId);
  }

  @Public()
  @Get('players/:competitorId/history')
  @ApiOperation({ summary: 'Rating history for the chart' })
  async getPlayerHistory(
    @Param('competitorId') competitorId: string,
    @Query('days') days = '90',
  ) {
    const player =
      await this.playersService.getPlayerByCompetitorId(competitorId);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days, 10));

    return this.snapshotRepository.find({
      where: { playerId: player.id },
      order: { date: 'ASC' },
    });
  }

  @Public()
  @Get('players/:competitorId/matches')
  @ApiOperation({ summary: 'A player’s matches, most recent first' })
  async getPlayerMatches(@Param('competitorId') competitorId: string) {
    const player =
      await this.playersService.getPlayerByCompetitorId(competitorId);

    return this.matchRepository.find({
      where: [{ playerAId: player.id }, { playerBId: player.id }],
      order: { playedAt: 'DESC' },
      take: 50,
    });
  }

  @Post('players')
  @ApiOperation({ summary: 'Enrol a competitor into ping-pong' })
  @ApiResponse({ status: 409, description: 'Already enrolled' })
  async enrolPlayer(@Body() dto: EnrolPlayerDto) {
    return this.playersService.enrol(dto.competitorId);
  }

  @Public()
  @Get('matches')
  @ApiOperation({ summary: 'Recent matches' })
  async getMatches(@Query('limit') limit = '50') {
    return this.matchRepository.find({
      order: { playedAt: 'DESC' },
      take: Math.min(parseInt(limit, 10) || 50, 200),
    });
  }

  @Post('matches')
  @ApiOperation({ summary: 'Record a match' })
  @ApiResponse({ status: 400, description: 'Impossible score' })
  async recordMatch(@Body() dto: RecordMatchDto) {
    return this.matchService.recordMatch({
      playerAId: dto.playerAId,
      playerBId: dto.playerBId,
      sets: dto.sets,
      playedAt: dto.playedAt,
    });
  }

  @Public()
  @Get('head-to-head/:idA/:idB')
  @ApiOperation({ summary: 'Head-to-head record between two players' })
  async getHeadToHead(@Param('idA') idA: string, @Param('idB') idB: string) {
    return this.playersService.getHeadToHead(idA, idB);
  }
}
