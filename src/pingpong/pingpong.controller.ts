import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PingpongPlayersService } from './services/pingpong-players.service';
import { PingpongMatchService } from './services/pingpong-match.service';
import { PingpongBestWinService } from './services/pingpong-best-win.service';
import { PingpongMatch } from './entities/pingpong-match.entity';
import { PingpongEloSnapshot } from './entities/pingpong-elo-snapshot.entity';
import { EnrolPlayerDto, RecordMatchDto } from './dtos/record-match.dto';
import { MATCH_PLAYER_RELATIONS, sanitizeMatch } from './utils/sanitize-match';

@ApiTags('pingpong')
@Controller('pingpong')
export class PingpongController {
  constructor(
    private readonly playersService: PingpongPlayersService,
    private readonly matchService: PingpongMatchService,
    private readonly bestWinService: PingpongBestWinService,
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

  /**
   * Everyone who could play, enrolled or not.
   *
   * Feeds the match entry form. The leaderboard is the wrong source there:
   * it is empty until someone plays, which leaves a first-time user with an
   * empty picker and no way to start.
   */
  @Public()
  @Get('selectable')
  @ApiOperation({ summary: 'All competitors, with their enrolment status' })
  async getSelectable() {
    return this.playersService.getSelectableOpponents();
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
      // `since` was computed and then dropped: the query filtered on the
      // player alone, so every request returned the full history however
      // narrow a window the caller asked for.
      // The column is a DATE, held as a string. Compare on the same shape
      // rather than a Date, which TypeORM would not accept here.
      where: {
        playerId: player.id,
        date: MoreThanOrEqual(since.toISOString().slice(0, 10)),
      },
      order: { date: 'ASC' },
    });
  }

  /**
   * A player's matches, most recent first.
   *
   * Both players are embedded, same as `GET /pingpong/matches` — a caller
   * building a rivalry list needs the other side named, and asking it to
   * fetch the leaderboard for that is a second request to hide a missing
   * join.
   */
  @Public()
  @Get('players/:competitorId/matches')
  @ApiOperation({ summary: 'A player’s matches, most recent first' })
  async getPlayerMatches(@Param('competitorId') competitorId: string) {
    const player =
      await this.playersService.getPlayerByCompetitorId(competitorId);

    const matches = await this.matchRepository.find({
      where: [{ playerAId: player.id }, { playerBId: player.id }],
      relations: [...MATCH_PLAYER_RELATIONS],
      order: { playedAt: 'DESC' },
      take: 50,
    });

    return matches.map(sanitizeMatch);
  }

  /**
   * The highest-rated opponent this player has ever beaten.
   *
   * A monotone record: it only ever goes up, and nobody else's play can
   * lower it. That is the point — the leaderboard is zero-sum, so most of
   * the office is permanently in its bottom half, and a peak rating would
   * be a number the decay cron has already pushed out of reach.
   *
   * The opponent is named here rather than returned as a bare id, the same
   * choice `GET /pingpong/matches` makes: leaving the join to the caller
   * costs a second request for one line of text.
   *
   * `null` for a player who has never won — never a zero, which would read
   * as having beaten someone rated nothing.
   */
  @Public()
  @Get('players/:competitorId/best-win')
  @ApiOperation({ summary: 'Highest-rated opponent this player has beaten' })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getBestWin(@Param('competitorId') competitorId: string) {
    const player =
      await this.playersService.getPlayerByCompetitorId(competitorId);

    const best = await this.bestWinService.computeFor(player.id);
    if (!best) return null;

    const opponent = await this.playersService.findById(best.opponentId);

    return {
      ...best,
      opponent: opponent
        ? {
            id: opponent.id,
            competitorId: opponent.competitorId,
            firstName: opponent.competitor?.firstName ?? '',
            lastName: opponent.competitor?.lastName ?? '',
            profilePictureUrl: opponent.competitor?.profilePictureUrl ?? '',
          }
        : null,
    };
  }

  @Post('players')
  @ApiOperation({ summary: 'Enrol a competitor into ping-pong' })
  @ApiResponse({ status: 409, description: 'Already enrolled' })
  async enrolPlayer(@Body() dto: EnrolPlayerDto) {
    return this.playersService.enrol(dto.competitorId);
  }

  /**
   * Recent matches, with both players named.
   *
   * The relations are loaded here rather than left to the caller. Returning
   * bare `playerAId` / `playerBId` forced every consumer to fetch the whole
   * leaderboard as well and join on the id itself — two requests for one
   * screen, and the same join written again in each new consumer.
   *
   * One `find` with relations, not a lookup per row: fifty matches would be
   * a hundred extra queries.
   */
  @Public()
  @Get('matches')
  @ApiOperation({ summary: 'Recent matches' })
  async getMatches(@Query('limit') limit = '50') {
    const matches = await this.matchRepository.find({
      relations: [...MATCH_PLAYER_RELATIONS],
      order: { playedAt: 'DESC' },
      take: Math.min(parseInt(limit, 10) || 50, 200),
    });

    return matches.map(sanitizeMatch);
  }

  @Post('matches')
  @ApiOperation({ summary: 'Record a match' })
  @ApiResponse({ status: 400, description: 'Impossible score' })
  async recordMatch(@Body() dto: RecordMatchDto) {
    // The ids arriving here are COMPETITOR ids: the entry form lists the
    // whole office, most of whom have never played. Enrol both sides first,
    // idempotently, so a first match needs no separate "join" step — one
    // nobody would find, on a leaderboard that starts empty.
    const [playerA, playerB] = await Promise.all([
      this.playersService.ensureEnrolled(dto.playerAId),
      this.playersService.ensureEnrolled(dto.playerBId),
    ]);

    return this.matchService.recordMatch({
      playerAId: playerA.id,
      playerBId: playerB.id,
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
