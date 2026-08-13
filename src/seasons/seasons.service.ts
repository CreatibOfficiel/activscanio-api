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

/**
 * One archived standing, joined to its season and carrying the ELO change
 * against that same competitor's previous archived season.
 *
 * Numerics arrive as strings through the driver (see `RawNamedCount`), and
 * `eloDelta` is additionally null on a competitor's first archived season,
 * where `LAG` has nothing to look back at.
 */
interface RawSeasonStanding {
  seasonId: string;
  seasonNumber: string | number;
  competitorName: string;
  rank: string | number | null;
  finalRating: string | number;
  finalRd: string | number;
  totalRaces: string | number;
  eloDelta: string | number | null;
}

/**
 * The score the boards actually rank and display: rating − 2×RD.
 *
 * The raw rating is not what anyone sees anywhere else in the app — the
 * leaderboard, the TV boards and the ping-pong podium all show this. A
 * season card showing the raw figure reports a number for its winner that
 * differs from the one that same player carried on the board all season.
 */
function conservativeScore(rating: number, rd: number): number {
  return rating - 2 * rd;
}

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
    { competitorName: string; maxScore: number; perfectCount: number }[] | null;
}

/**
 * One superlative on a season card.
 *
 * `names` is a LIST because ties are real in this data — season 2 has Don
 * Joran and Léo Mibord both on 34 races, and picking one of them by sort
 * order would invent a winner the season did not have.
 */
export interface SeasonSuperlative {
  names: string[];
  value: number;
}

/**
 * A season plus the four figures the archive screen puts on its card.
 *
 * Every one is derived at read time from `archived_competitor_rankings`
 * rather than stored, so the six seasons already in production get them
 * without a backfill.
 */
/**
 * One sport's four figures for a season.
 *
 * The same shape for Mario Kart and ping-pong so the card can render them as
 * two columns of one table rather than two bespoke blocks.
 */
export interface SportHighlights {
  /** Rank 1 that season. Null if nobody was confirmed enough to hold it. */
  winner: { name: string; rating: number } | null;
  mostActive: SeasonSuperlative | null;
  /**
   * Rating gained/lost against the SAME player's previous archived season.
   *
   * Null for the first archived season of all — there is no earlier row to
   * subtract, and a "+0" there would read as a player who went nowhere
   * rather than one we cannot measure.
   */
  biggestClimb: SeasonSuperlative | null;
  biggestDrop: SeasonSuperlative | null;
}

export interface SeasonWithHighlights {
  season: SeasonArchive;
  /**
   * The season is still being played, so every figure is provisional.
   *
   * Absent on archived seasons. The board reads it to badge the card and to
   * stop presenting a leader as a winner — nobody has won a season that has
   * not finished.
   */
  inProgress?: boolean;
  /** Mario Kart. Kept at the top level as well — see the fields below. */
  winner: { name: string; rating: number } | null;
  mostActive: SeasonSuperlative | null;
  biggestClimb: SeasonSuperlative | null;
  biggestDrop: SeasonSuperlative | null;
  /**
   * The same four figures, per sport, for the card's two-column table.
   *
   * `pingpong` is NULL when the season archived no ping-pong standing at
   * all — which is every closed season today, the sport having started in
   * season 7. The card drops the column rather than printing four dashes
   * for a sport that did not exist yet.
   *
   * The Mario Kart figures are duplicated at the top level rather than
   * moved, so nothing reading the older shape breaks.
   */
  sports: {
    mariokart: SportHighlights;
    pingpong: SportHighlights | null;
  };
}

/** Headline figures across every archived season. */
export interface SeasonsOverview {
  seasonCount: number;
  totalRaces: number;
  avgRacesPerSeason: number;
  totalPingpongMatches: number;
  avgPingpongMatchesPerSeason: number;
  /**
   * Seasons that actually had ping-pong. The sport arrived mid-life, so
   * averaging its matches over ALL seasons would divide by a run of seasons
   * where it did not exist and understate it.
   */
  pingpongSeasonCount: number;
  mostTitles: SeasonSuperlative | null;
  busiestSeason: { seasonName: string; totalRaces: number } | null;
  /**
   * The season with the most ping-pong matches.
   *
   * Null while no ARCHIVED season has any — the sport started in season 7,
   * which is still being played, so every closed season sits at 0. A "most
   * intense" of zero is not a fact worth a tile; the board omits it until
   * there is one, rather than showing a permanent dash.
   */
  busiestPingpongSeason: { seasonName: string; totalMatches: number } | null;
  mostRacesInOneSeason: SeasonSuperlative | null;
  bestClimbEver: (SeasonSuperlative & { seasonName: string }) | null;
}

/**
 * The extreme of `value` over `items`, with EVERY name that reaches it.
 *
 * Ties are collected rather than broken. Season 2 ends with Don Joran and
 * Léo Mibord on 34 races each; showing one of them because they sorted first
 * would state a fact the season does not contain.
 *
 * `floor` drops results that fail to beat a threshold — used for the ELO
 * superlatives, where a "biggest climb" of -12 is not a climb and a card
 * saying so is worse than a card saying nothing.
 */
function topBy<T extends { competitorName: string }>(
  items: T[],
  value: (item: T) => number,
  direction: 'max' | 'min',
  floor?: number,
): SeasonSuperlative | null {
  if (items.length === 0) return null;

  const best = items.reduce((acc, item) => {
    const v = value(item);
    return direction === 'max' ? Math.max(acc, v) : Math.min(acc, v);
  }, value(items[0]));

  if (floor !== undefined) {
    if (direction === 'max' && best <= floor) return null;
    if (direction === 'min' && best >= floor) return null;
  }

  return {
    names: items
      .filter((item) => value(item) === best)
      .map((i) => i.competitorName),
    value: Math.round(best),
  };
}

/**
 * One sport's figures for one season, from its archived standings.
 *
 * Shared by both sports so they cannot drift apart. Ties keep every name —
 * `topBy` collects them — which is the behaviour season 2 needs on the Mario
 * Kart side and ping-pong will need the moment two players finish level.
 *
 * `totalRaces > 0` filters the ELO candidates: someone archived without
 * playing carries an unchanged rating and lands on a delta of exactly 0,
 * which means "did not play", not "held steady".
 */
function highlightsFor(seasonRows: RawSeasonStanding[]): SportHighlights {
  const champion = seasonRows.find((r) => Number(r.rank) === 1);
  const played = seasonRows.filter((r) => Number(r.totalRaces) > 0);
  const measurable = played.filter((r) => r.eloDelta !== null);

  return {
    winner: champion
      ? {
          name: champion.competitorName,
          rating: Math.round(
            conservativeScore(
              Number(champion.finalRating),
              Number(champion.finalRd),
            ),
          ),
        }
      : null,
    mostActive: topBy(played, (r) => Number(r.totalRaces), 'max'),
    biggestClimb: topBy(measurable, (r) => Number(r.eloDelta), 'max', 0),
    biggestDrop: topBy(measurable, (r) => Number(r.eloDelta), 'min', 0),
  };
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
   * Every archived season with its card figures, plus the overall totals.
   *
   * ONE query for the per-competitor rows, not one per season. The archive
   * screen is a TV view that rotates on a timer and will hold ~40 seasons; a
   * request per card would be 40 round trips on every rotation.
   *
   * The ELO delta is a window function over each competitor's own archived
   * history (`LAG` partitioned by competitor, ordered by season). That is
   * what makes the figure available for seasons archived long before this
   * feature existed: nothing new is stored, it is subtracted at read time.
   *
   * `totalRaces > 0` filters the delta candidates. Competitors who sat a
   * season out are archived anyway, carrying an unchanged rating, so they
   * land on a delta of exactly 0 and would otherwise crowd the middle of the
   * ranking with people who never played.
   */
  async getSeasonsOverview(): Promise<{
    seasons: SeasonWithHighlights[];
    overview: SeasonsOverview;
  }> {
    const seasons = await this.getAllSeasons();
    // The season being played is shown too — it is why "where is July?" gets
    // asked of a board that is in fact complete. Fetched even with no
    // archives at all, so the very first season is visible while it runs.
    const current = await this.getCurrentSeason();

    if (seasons.length === 0) {
      return {
        seasons: current ? [current] : [],
        overview: {
          seasonCount: 0,
          totalRaces: 0,
          avgRacesPerSeason: 0,
          totalPingpongMatches: 0,
          avgPingpongMatchesPerSeason: 0,
          pingpongSeasonCount: 0,
          mostTitles: null,
          busiestSeason: null,
          busiestPingpongSeason: null,
          mostRacesInOneSeason: null,
          bestClimbEver: null,
        },
      };
    }

    const rows: RawSeasonStanding[] = await this
      .archivedCompetitorRankingRepository.query(`
      SELECT
        a.id                AS "seasonId",
        a."seasonNumber"    AS "seasonNumber",
        r."competitorName"  AS "competitorName",
        r.rank              AS "rank",
        r."finalRating"     AS "finalRating",
        r."finalRd"         AS "finalRd",
        r."totalRaces"      AS "totalRaces",
        r."finalRating" - LAG(r."finalRating") OVER (
          PARTITION BY r."competitorId"
          ORDER BY a.year, a."seasonNumber"
        ) AS "eloDelta"
      FROM archived_competitor_rankings r
      JOIN season_archives a ON a.id = r."seasonArchiveId"
      ORDER BY a.year, a."seasonNumber"
    `);

    // The same shape for ping-pong. Columns are named to match so one
    // helper can build a `SportHighlights` from either sport's rows.
    const pingpongRows: RawSeasonStanding[] = await this
      .archivedPingpongRankingRepository.query(`
      SELECT
        a.id              AS "seasonId",
        a."seasonNumber"  AS "seasonNumber",
        p."playerName"    AS "competitorName",
        p.rank            AS "rank",
        p."finalRating"   AS "finalRating",
        p."finalRd"       AS "finalRd",
        p."totalMatches"  AS "totalRaces",
        p."finalRating" - LAG(p."finalRating") OVER (
          PARTITION BY p."playerId"
          ORDER BY a.year, a."seasonNumber"
        ) AS "eloDelta"
      FROM archived_pingpong_rankings p
      JOIN season_archives a ON a.id = p."seasonArchiveId"
      ORDER BY a.year, a."seasonNumber"
    `);

    const pingpongBySeason = new Map<string, RawSeasonStanding[]>();
    for (const row of pingpongRows) {
      const list = pingpongBySeason.get(row.seasonId);
      if (list) list.push(row);
      else pingpongBySeason.set(row.seasonId, [row]);
    }

    const bySeason = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = bySeason.get(row.seasonId);
      if (list) list.push(row);
      else bySeason.set(row.seasonId, [row]);
    }

    const withHighlights: SeasonWithHighlights[] = seasons.map((season) => {
      const mariokart = highlightsFor(bySeason.get(season.id) ?? []);
      // Null, not an empty block: a season that archived no ping-pong
      // standing at all predates the sport, and the card drops the column
      // rather than showing four dashes for something that did not exist.
      const pingpongSeasonRows = pingpongBySeason.get(season.id) ?? [];
      const pingpong = pingpongSeasonRows.length
        ? highlightsFor(pingpongSeasonRows)
        : null;

      return {
        season,
        // Mario Kart stays at the top level too, so anything reading the
        // older shape keeps working.
        ...mariokart,
        sports: { mariokart, pingpong },
      };
    });

    const totalRaces = seasons.reduce((sum, s) => sum + (s.totalRaces ?? 0), 0);
    // Seasons predating ping-pong carry no column at all, which is not a
    // zero — see the entity. Only the ones that have it are averaged.
    const pingpongSeasons = seasons.filter(
      (s) =>
        s.totalPingpongMatches !== null && s.totalPingpongMatches !== undefined,
    );
    const totalPingpongMatches = pingpongSeasons.reduce(
      (sum, s) => sum + (s.totalPingpongMatches ?? 0),
      0,
    );

    const titleCounts = new Map<string, number>();
    for (const { winner } of withHighlights) {
      if (!winner) continue;
      titleCounts.set(winner.name, (titleCounts.get(winner.name) ?? 0) + 1);
    }

    const busiest = seasons.reduce((best, s) =>
      (s.totalRaces ?? 0) > (best.totalRaces ?? 0) ? s : best,
    );

    // Only meaningful once a closed season actually recorded matches. Every
    // archived season sits at 0 today — ping-pong started in season 7, which
    // is still running — and "most intense: 0 matches" is not a fact.
    const busiestPingpong = pingpongSeasons.reduce(
      (best, s) =>
        best === null ||
        (s.totalPingpongMatches ?? 0) > (best.totalPingpongMatches ?? 0)
          ? s
          : best,
      null as SeasonArchive | null,
    );

    const allPlayed = rows.filter((r) => Number(r.totalRaces) > 0);
    const climbRows = allPlayed.filter((r) => r.eloDelta !== null);
    const bestClimbRow = climbRows.reduce(
      (best, r) =>
        best === null || Number(r.eloDelta) > Number(best.eloDelta) ? r : best,
      null as RawSeasonStanding | null,
    );
    const bestClimbSeason = bestClimbRow
      ? seasons.find((s) => s.id === bestClimbRow.seasonId)
      : undefined;

    return {
      // The live season leads: newest first, and it is the newest there is.
      //
      // It is prepended HERE rather than folded into `withHighlights`,
      // because every figure below is deliberately archive-only. A season in
      // flight has no champion, so counting its leader as a title would hand
      // someone a trophy for a race still being run, and averaging its
      // part-played race count would drag "courses / saison" down all month.
      seasons: current ? [current, ...withHighlights] : withHighlights,
      overview: {
        seasonCount: seasons.length,
        totalRaces,
        avgRacesPerSeason: Math.round(totalRaces / seasons.length),
        totalPingpongMatches,
        avgPingpongMatchesPerSeason: pingpongSeasons.length
          ? Math.round(totalPingpongMatches / pingpongSeasons.length)
          : 0,
        pingpongSeasonCount: pingpongSeasons.length,
        mostTitles: topBy(
          [...titleCounts].map(([competitorName, count]) => ({
            competitorName,
            count,
          })),
          (r) => r.count,
          'max',
        ),
        busiestSeason: {
          seasonName: busiest.seasonName ?? `Saison ${busiest.seasonNumber}`,
          totalRaces: busiest.totalRaces ?? 0,
        },
        // Null while every archived season sits at 0 — see the interface.
        busiestPingpongSeason:
          busiestPingpong && (busiestPingpong.totalPingpongMatches ?? 0) > 0
            ? {
                seasonName:
                  busiestPingpong.seasonName ??
                  `Saison ${busiestPingpong.seasonNumber}`,
                totalMatches: busiestPingpong.totalPingpongMatches ?? 0,
              }
            : null,
        mostRacesInOneSeason: topBy(
          allPlayed,
          (r) => Number(r.totalRaces),
          'max',
        ),
        bestClimbEver:
          bestClimbRow && Number(bestClimbRow.eloDelta) > 0
            ? {
                names: climbRows
                  .filter(
                    (r) => Number(r.eloDelta) === Number(bestClimbRow.eloDelta),
                  )
                  .map((r) => r.competitorName),
                value: Math.round(Number(bestClimbRow.eloDelta)),
                seasonName:
                  bestClimbSeason?.seasonName ??
                  `Saison ${bestClimbSeason?.seasonNumber ?? '?'}`,
              }
            : null,
      },
    };
  }

  /**
   * The season being played right now, in the shape the archive cards use.
   *
   * NOT AN ARCHIVE. It is assembled from the live `competitors` table, which
   * is exactly what `archiveSeason` will snapshot when the season closes, so
   * the card shows the same figures it will keep afterwards.
   *
   * The season's own race and ping-pong counts are counted over its date
   * range rather than read from a column, because no row exists for it yet.
   *
   * `currentMonthRaceCount` is the per-season counter — it is reset at every
   * transition — so it is the right field for "most active THIS season".
   * `raceCount` is the lifetime total and would rank the veterans.
   *
   * There is no ELO movement here. The comparison the archived cards make is
   * against the competitor's previous ARCHIVED rating, and the live rating is
   * mid-flight: it has already absorbed the soft reset applied at the start
   * of the season, so subtracting last season's final would report the reset
   * as if it were the player's own doing.
   */
  private async getCurrentSeason(): Promise<SeasonWithHighlights | null> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const weekNumber = WeekUtils.getISOWeek(now);
    const seasonNumber = SeasonUtils.getSeasonNumber(weekNumber, year);
    const weeks = SeasonUtils.getSeasonWeeks(seasonNumber);
    const startDate = WeekUtils.getMondayOfWeek(year, weeks.start);
    const endDate = WeekUtils.getSundayOfWeek(year, weeks.end);

    // Already archived — the season closed and the cron has run. Nothing to
    // add, and adding it would duplicate the card.
    const existing = await this.seasonArchiveRepository.findOne({
      where: { seasonNumber, year },
    });
    if (existing) return null;

    const competitors = await this.competitorRepository.find();
    const played = competitors.filter((c) => c.currentMonthRaceCount > 0);

    const [totalRaces, totalPingpongMatches] = await Promise.all([
      this.seasonArchiveRepository.manager.count(RaceEvent, {
        where: { date: Between(startDate, endDate) },
      }),
      this.seasonArchiveRepository.manager.count(PingpongMatch, {
        where: { playedAt: Between(startDate, endDate) },
      }),
    ]);

    // The live leader, by the same conservative score the boards rank on.
    // Provisional players are excluded for the same reason they carry no
    // rank in an archive: a rating with a wide RD is not a standing.
    const ranked = played
      .filter((c) => c.raceCount >= 5 && c.rd <= 150)
      .sort(
        (a, b) =>
          conservativeScore(b.rating, b.rd) - conservativeScore(a.rating, a.rd),
      );
    const leader = ranked[0];

    const namedCounts = played.map((c) => ({
      competitorName: `${c.firstName} ${c.lastName}`,
      count: c.currentMonthRaceCount,
    }));

    // Ping-pong's live standing, by the same rules. `matchCount` is a
    // LIFETIME counter — the sport has never been through a season
    // transition, so there is no per-season equivalent to reset — which is
    // why the column only appears once matches exist at all.
    const pingpongPlayers = await this.seasonArchiveRepository.manager.find(
      PingpongPlayer,
      { relations: ['competitor'] },
    );
    const pingpongPlayed = pingpongPlayers.filter((p) => p.matchCount > 0);
    const pingpongName = (p: PingpongPlayer) =>
      p.competitor
        ? `${p.competitor.firstName} ${p.competitor.lastName}`
        : 'Joueur inconnu';

    const pingpongRanked = pingpongPlayed
      .filter((p) => p.matchCount >= 5 && p.rd <= 150)
      .sort(
        (a, b) =>
          conservativeScore(b.rating, b.rd) - conservativeScore(a.rating, a.rd),
      );
    const pingpongLeader = pingpongRanked[0];

    const liveMariokart: SportHighlights = {
      // Sorted on the conservative score, so displayed on it too — showing
      // the raw rating here would rank by one number and print another.
      winner: leader
        ? {
            name: `${leader.firstName} ${leader.lastName}`,
            rating: Math.round(conservativeScore(leader.rating, leader.rd)),
          }
        : null,
      mostActive: topBy(namedCounts, (r) => r.count, 'max'),
      // The live rating already carries this season's soft reset, so a delta
      // against last season's final would report the reset as the player's
      // own doing.
      biggestClimb: null,
      biggestDrop: null,
    };

    const livePingpong: SportHighlights | null = pingpongPlayed.length
      ? {
          winner: pingpongLeader
            ? {
                name: pingpongName(pingpongLeader),
                rating: Math.round(
                  conservativeScore(pingpongLeader.rating, pingpongLeader.rd),
                ),
              }
            : null,
          mostActive: topBy(
            pingpongPlayed.map((p) => ({
              competitorName: pingpongName(p),
              count: p.matchCount,
            })),
            (r) => r.count,
            'max',
          ),
          // Same reason as Mario Kart below: mid-season ratings have no
          // archived baseline to measure against.
          biggestClimb: null,
          biggestDrop: null,
        }
      : null;

    return {
      season: {
        id: `current-${year}-${seasonNumber}`,
        month: seasonNumber,
        seasonNumber,
        year,
        seasonName: this.getSeasonName(seasonNumber, year),
        startDate,
        endDate,
        totalCompetitors: played.length,
        totalRaces,
        totalPingpongMatches,
      } as SeasonArchive,
      inProgress: true,
      ...liveMariokart,
      sports: { mariokart: liveMariokart, pingpong: livePingpong },
    };
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
