import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, QueryRunner, Between } from 'typeorm';
import { SeasonArchive } from './entities/season-archive.entity';
import { ArchivedCompetitorRanking } from './entities/archived-competitor-ranking.entity';
import { ArchivedPingpongRanking } from './entities/archived-pingpong-ranking.entity';
import { Competitor } from '../competitors/competitor.entity';
import { PingpongPlayer } from '../pingpong/entities/pingpong-player.entity';
import { PingpongMatch } from '../pingpong/entities/pingpong-match.entity';
import { RaceEvent } from '../races/race-event.entity';
import { SeasonUtils } from '../common/utils/season-utils';
import { WeekUtils } from '../common/utils/week-utils';

/**
 * A raw row holding a name and one numeric column.
 *
 * Postgres returns aggregates and bigints as STRINGS through the driver, so
 * the numeric field is typed as `string | number` and every read goes through
 * `Number()`. Comparing the raw value would work by coercion today and break
 * silently the day a column changes type.
 */
type RawNamedCount<K extends string> = {
  competitorName: string;
} & Record<K, string | number>;

/** One row of the perfect-race aggregate. */
interface RawBestScorer {
  competitorName: string;
  maxScore: string | number;
  perfectCount: string | number;
}

export interface SeasonHighlights {
  longestWinStreak: { competitorName: string; streak: number } | null;
  mostRaces: { competitorName: string; count: number } | null;
  bestRaceScorers:
    | { competitorName: string; maxScore: number; perfectCount: number }[]
    | null;
}

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(SeasonArchive)
    private readonly seasonArchiveRepository: Repository<SeasonArchive>,
    @InjectRepository(ArchivedCompetitorRanking)
    private readonly archivedCompetitorRankingRepository: Repository<ArchivedCompetitorRanking>,
    @InjectRepository(ArchivedPingpongRanking)
    private readonly archivedPingpongRankingRepository: Repository<ArchivedPingpongRanking>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
  ) {}

  /**
   * Archive the current season
   * Called during season transition (first week of new season)
   */
  async archiveSeason(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonArchive> {
    this.logger.log(`Archiving season ${seasonNumber}/${year}...`);

    // Use transaction for atomicity
    const queryRunner =
      this.seasonArchiveRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate date range from the season's weeks
      const seasonWeeks = SeasonUtils.getSeasonWeeks(seasonNumber);
      const startDate = WeekUtils.getMondayOfWeek(year, seasonWeeks.start);
      const endDate = WeekUtils.getSundayOfWeek(year, seasonWeeks.end);

      // Gather statistics
      const competitors = await queryRunner.manager.find(Competitor);

      // Only count competitors who actually raced this season
      const activeCompetitors = competitors.filter(
        (c) => c.currentMonthRaceCount > 0,
      );

      // Count races within the season date range
      const totalRaces = await queryRunner.manager.count(RaceEvent, {
        where: { date: Between(startDate, endDate) },
      });

      // Ping-pong runs its own season on the same calendar, with its own
      // rating scale. Gathered inside the same transaction so a season is
      // never archived for one sport and not the other.
      const pingpongPlayers = await queryRunner.manager.find(PingpongPlayer, {
        // The archive stores a denormalised name, so the competitor has to be
        // loaded here — it will not be reachable once the account is gone.
        relations: ['competitor'],
      });
      const totalPingpongMatches = await queryRunner.manager.count(
        PingpongMatch,
        { where: { playedAt: Between(startDate, endDate) } },
      );

      // Create season archive
      const archive = queryRunner.manager.create(SeasonArchive, {
        month: seasonNumber, // backward compat
        seasonNumber,
        year,
        seasonName: this.getSeasonName(seasonNumber, year),
        startDate,
        endDate,
        totalCompetitors: activeCompetitors.length,
        totalRaces,
        totalPingpongPlayers: pingpongPlayers.length,
        totalPingpongMatches,
      });

      await queryRunner.manager.save(archive);

      // Archive competitor rankings
      await this.archiveCompetitorRankingsInTransaction(
        queryRunner,
        archive,
        competitors,
      );

      await this.archivePingpongRankingsInTransaction(
        queryRunner,
        archive,
        pingpongPlayers,
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Season ${seasonNumber}/${year} archived successfully (ID: ${archive.id})`,
      );

      return archive;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to archive season ${seasonNumber}/${year}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Archive ping-pong standings for the season (within transaction).
   *
   * Mirrors the competitor archive: everyone is written down, but only
   * players eligible for the ranking carry a rank. Dropping the others would
   * make the archive misreport who was around that season, so they are stored
   * with `rank: null` and `provisional: true` — the same convention already
   * used for calibrating racers.
   */
  private async archivePingpongRankingsInTransaction(
    queryRunner: QueryRunner,
    archive: SeasonArchive,
    players: PingpongPlayer[],
  ): Promise<void> {
    const withScore = players.map((player) => ({
      player,
      // Conservative score, as everywhere else: a high rating with a wide
      // deviation should not outrank a proven one.
      score: player.rating - 2 * player.rd,
    }));

    const ranked = withScore
      .filter((p) => p.player.isRankingEligible)
      .sort((a, b) => b.score - a.score);
    const unranked = withScore
      .filter((p) => !p.player.isRankingEligible)
      .sort((a, b) => b.score - a.score);

    // Ties share a rank, and the next rank skips accordingly (1, 1, 3).
    const ranks: number[] = [];
    let currentRank = 1;
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].score < ranked[i - 1].score) {
        currentRank = i + 1;
      }
      ranks.push(currentRank);
    }

    const toRow = (
      player: PingpongPlayer,
      rank: number | null,
    ): ArchivedPingpongRanking =>
      queryRunner.manager.create(ArchivedPingpongRanking, {
        seasonArchiveId: archive.id,
        playerId: player.id,
        playerName: this.getPingpongPlayerName(player),
        rank,
        provisional: rank === null,
        finalRating: player.rating,
        finalRd: player.rd,
        finalVol: player.vol,
        totalMatches: player.matchCount,
        wins: player.wins,
        losses: player.losses,
        setsWon: player.setsWon,
        setsLost: player.setsLost,
        bestStreak: player.bestStreak,
      });

    const BATCH_SIZE = 100;

    for (let i = 0; i < ranked.length; i += BATCH_SIZE) {
      const rows = ranked
        .slice(i, i + BATCH_SIZE)
        .map((item, batchIndex) => toRow(item.player, ranks[i + batchIndex]));
      await queryRunner.manager.save(rows);
    }

    for (let i = 0; i < unranked.length; i += BATCH_SIZE) {
      const rows = unranked
        .slice(i, i + BATCH_SIZE)
        .map((item) => toRow(item.player, null));
      await queryRunner.manager.save(rows);
    }

    this.logger.log(
      `Archived ${ranked.length} ranked + ${unranked.length} unranked ping-pong players for season ${archive.seasonNumber}/${archive.year}`,
    );
  }

  /**
   * Denormalised display name for the archive.
   *
   * The player row carries only a competitorId, and the relation may not be
   * loaded — so fall back to the id rather than writing "undefined undefined"
   * into a record meant to outlive the account.
   */
  private getPingpongPlayerName(player: PingpongPlayer): string {
    const competitor = player.competitor;
    if (competitor?.firstName || competitor?.lastName) {
      return `${competitor.firstName ?? ''} ${competitor.lastName ?? ''}`.trim();
    }
    return player.competitorId;
  }

  /**
   * Archive competitor rankings for the season (within transaction)
   */
  private async archiveCompetitorRankingsInTransaction(
    queryRunner: QueryRunner,
    archive: SeasonArchive,
    competitors: Competitor[],
  ): Promise<void> {
    // Determine status for each competitor (same logic as competitor-classification.ts)
    const INACTIVE_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000; // 8 days
    const seasonEndTime = archive.endDate.getTime();

    const withStatus = competitors.map((c) => {
      const provisional = c.raceCount < 5 || c.rd > 150;
      const inactive =
        !provisional &&
        (!c.lastRaceDate ||
          seasonEndTime - new Date(c.lastRaceDate).getTime() >
            INACTIVE_THRESHOLD_MS);

      return {
        competitor: c,
        score: c.rating - 2 * c.rd,
        provisional,
        inactive,
      };
    });

    // Separate into confirmed (ranked), inactive, and calibrating (provisional)
    const confirmed = withStatus
      .filter((c) => !c.provisional && !c.inactive)
      .sort((a, b) => b.score - a.score);
    const calibrating = withStatus
      .filter((c) => c.provisional || c.inactive)
      .sort((a, b) => b.score - a.score);

    // Pre-calculate ranks with ties on the full confirmed list
    const confirmedRanks: number[] = [];
    let currentRank = 1;
    for (let i = 0; i < confirmed.length; i++) {
      if (i > 0 && confirmed[i].score < confirmed[i - 1].score) {
        currentRank = i + 1;
      }
      confirmedRanks.push(currentRank);
    }

    // Archive confirmed competitors with official ranks
    const BATCH_SIZE = 100;
    for (let i = 0; i < confirmed.length; i += BATCH_SIZE) {
      const batch = confirmed.slice(i, i + BATCH_SIZE);

      const rankings = batch.map((item, batchIndex) => {
        const { competitor } = item;
        const rank = confirmedRanks[i + batchIndex];

        return queryRunner.manager.create(ArchivedCompetitorRanking, {
          seasonArchiveId: archive.id,
          competitorId: competitor.id,
          competitorName: `${competitor.firstName} ${competitor.lastName}`,
          rank,
          provisional: false,
          finalRating: competitor.rating,
          finalRd: competitor.rd,
          finalVol: competitor.vol,
          totalRaces: competitor.currentMonthRaceCount,
          winStreak: competitor.winStreak,
          avgRank12: competitor.avgRank12,
        });
      });

      await queryRunner.manager.save(rankings);

      this.logger.log(
        `Archived batch ${Math.floor(i / BATCH_SIZE) + 1}: ${rankings.length} confirmed competitors`,
      );
    }

    // Archive calibrating competitors with provisional = true and rank = null
    for (let i = 0; i < calibrating.length; i += BATCH_SIZE) {
      const batch = calibrating.slice(i, i + BATCH_SIZE);

      const rankings = batch.map((item) => {
        const { competitor } = item;

        return queryRunner.manager.create(ArchivedCompetitorRanking, {
          seasonArchiveId: archive.id,
          competitorId: competitor.id,
          competitorName: `${competitor.firstName} ${competitor.lastName}`,
          rank: null,
          provisional: true,
          finalRating: competitor.rating,
          finalRd: competitor.rd,
          finalVol: competitor.vol,
          totalRaces: competitor.currentMonthRaceCount,
          winStreak: competitor.winStreak,
          avgRank12: competitor.avgRank12,
        });
      });

      await queryRunner.manager.save(rankings);

      this.logger.log(
        `Archived batch: ${rankings.length} provisional competitors`,
      );
    }

    this.logger.log(
      `Archived ${confirmed.length} confirmed + ${calibrating.length} provisional competitor rankings for season ${archive.month}/${archive.year}`,
    );
  }

  /**
   * Get all seasons (for browsing history)
   */
  async getAllSeasons(): Promise<SeasonArchive[]> {
    return await this.seasonArchiveRepository.find({
      order: { year: 'DESC', seasonNumber: 'DESC' },
    });
  }

  /**
   * Get a specific season by seasonNumber (or legacy month)
   */
  async getSeason(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonArchive | null> {
    return await this.seasonArchiveRepository.findOne({
      where: { seasonNumber, year },
      relations: ['competitorRankings'],
    });
  }

  /**
   * Get competitor rankings for a season, enriched with profile pictures
   * and character images from the live competitor data
   */
  /**
   * Ping-pong standings for an archived season.
   *
   * Ranked players first, then the unranked ones by rating — Postgres sorts
   * NULLs last on ASC by default, which is the order we want anyway.
   */
  async getPingpongRankings(seasonId: string) {
    return this.archivedPingpongRankingRepository.find({
      where: { seasonArchiveId: seasonId },
      order: { rank: 'ASC', finalRating: 'DESC' },
    });
  }

  async getCompetitorRankings(seasonId: string) {
    const rankings = await this.archivedCompetitorRankingRepository.find({
      where: { seasonArchiveId: seasonId },
      order: { rank: 'ASC' },
    });

    // Fetch live competitor data for profile pics and character images
    const competitorIds = rankings.map((r) => r.competitorId);
    const competitors = await this.competitorRepository.find({
      where: { id: In(competitorIds) },
      relations: ['characterVariant'],
    });
    const competitorMap = new Map(competitors.map((c) => [c.id, c]));

    return rankings.map((r) => {
      const competitor = competitorMap.get(r.competitorId);
      return {
        ...r,
        profilePictureUrl: competitor?.profilePictureUrl ?? null,
        characterImageUrl: competitor?.characterVariant?.imageUrl ?? null,
      };
    });
  }

  /**
   * Get season highlights for the "Wrapped" recap
   */
  async getSeasonHighlights(
    seasonNumber: number,
    year: number,
  ): Promise<SeasonHighlights> {
    // Longest win streak (from archived competitor rankings)
    const season = await this.getSeason(seasonNumber, year);
    let longestWinStreak: SeasonHighlights['longestWinStreak'] = null;
    let mostRaces: SeasonHighlights['mostRaces'] = null;

    if (season) {
      const longestWinStreakRaw = await this.archivedCompetitorRankingRepository
        .createQueryBuilder('acr')
        .select([
          'acr.competitorName AS "competitorName"',
          'acr.winStreak AS streak',
        ])
        .where('acr.seasonArchiveId = :seasonId', { seasonId: season.id })
        .orderBy('acr.winStreak', 'DESC')
        .limit(1)
        .getRawOne<RawNamedCount<'streak'>>();

      if (longestWinStreakRaw && Number(longestWinStreakRaw.streak) > 0) {
        longestWinStreak = {
          competitorName: longestWinStreakRaw.competitorName,
          streak: Number(longestWinStreakRaw.streak),
        };
      }

      // Most races
      const mostRacesRaw = await this.archivedCompetitorRankingRepository
        .createQueryBuilder('acr')
        .select([
          'acr.competitorName AS "competitorName"',
          'acr.totalRaces AS count',
        ])
        .where('acr.seasonArchiveId = :seasonId', { seasonId: season.id })
        .orderBy('acr.totalRaces', 'DESC')
        .limit(1)
        .getRawOne<RawNamedCount<'count'>>();

      if (mostRacesRaw && Number(mostRacesRaw.count) > 0) {
        mostRaces = {
          competitorName: mostRacesRaw.competitorName,
          count: Number(mostRacesRaw.count),
        };
      }
    }

    // Best race scorers (perfect 60-point races)
    let bestRaceScorers: SeasonHighlights['bestRaceScorers'] = null;

    if (season) {
      const bestRaceScorersRaw = await this.seasonArchiveRepository.manager
        .createQueryBuilder()
        .select([
          'CONCAT(c."firstName", \' \', c."lastName") AS "competitorName"',
          'MAX(rr.score) AS "maxScore"',
          'SUM(CASE WHEN rr.score = 60 THEN 1 ELSE 0 END) AS "perfectCount"',
        ])
        .from('race_results', 'rr')
        .innerJoin('races', 'r', 'r.id = rr."raceId"')
        .innerJoin('competitors', 'c', 'c.id = rr."competitorId"')
        .where('r.date BETWEEN :startDate AND :endDate', {
          startDate: season.startDate,
          endDate: season.endDate,
        })
        .groupBy('c.id, c."firstName", c."lastName"')
        .having('MAX(rr.score) = 60')
        .orderBy('"perfectCount"', 'DESC')
        .getRawMany<RawBestScorer>();

      if (bestRaceScorersRaw.length > 0) {
        bestRaceScorers = bestRaceScorersRaw.map((r) => ({
          competitorName: r.competitorName,
          maxScore: Number(r.maxScore),
          perfectCount: Number(r.perfectCount),
        }));
      }
    }

    return {
      longestWinStreak,
      mostRaces,
      bestRaceScorers,
    };
  }

  /**
   * Generate season name
   */
  private getSeasonName(seasonNumber: number, year: number): string {
    return `Saison ${seasonNumber} - ${year}`;
  }
}
