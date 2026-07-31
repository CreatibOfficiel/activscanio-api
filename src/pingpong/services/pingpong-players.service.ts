import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PingpongPlayer } from '../entities/pingpong-player.entity';
import { PingpongMatch } from '../entities/pingpong-match.entity';
import { Competitor } from '../../competitors/competitor.entity';
import { PingpongRatingService } from './pingpong-rating.service';
import { classifyPingpongPlayer } from '../utils/pingpong-classification';

export interface RankedPingpongPlayer {
  id: string;
  competitorId: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string;
  rating: number;
  rd: number;
  vol: number;
  conservativeScore: number;
  matchCount: number;
  weightedMatchCount: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  currentStreak: number;
  bestStreak: number;
  lastMatchAt: Date | null;
  previousDayRank: number | null;
  provisional: boolean;
  inactive: boolean;
  archived: boolean;
  isRankingEligible: boolean;
  /** Null when the player is not in the ranked table. */
  rank: number | null;
}

@Injectable()
export class PingpongPlayersService {
  private readonly logger = new Logger(PingpongPlayersService.name);

  constructor(
    @InjectRepository(PingpongPlayer)
    private readonly playerRepository: Repository<PingpongPlayer>,
    @InjectRepository(PingpongMatch)
    private readonly matchRepository: Repository<PingpongMatch>,
    @InjectRepository(Competitor)
    private readonly competitorRepository: Repository<Competitor>,
    private readonly ratingService: PingpongRatingService,
  ) {}

  /** Enrol an existing competitor into ping-pong. */
  async enrol(competitorId: string): Promise<PingpongPlayer> {
    const competitor = await this.competitorRepository.findOne({
      where: { id: competitorId },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    const existing = await this.playerRepository.findOne({
      where: { competitorId },
    });
    if (existing) {
      throw new ConflictException('Competitor already plays ping-pong');
    }

    const defaults = this.ratingService.getDefaultRatings();
    const player = this.playerRepository.create({
      competitorId,
      ...defaults,
    });

    return this.playerRepository.save(player);
  }

  /**
   * The leaderboard.
   *
   * Everyone is returned; only confirmed and eligible players carry a rank.
   * Hiding the others would make a new player invisible to themselves, which
   * is a worse outcome than showing them unranked.
   */
  async getLeaderboard(
    now: Date = new Date(),
  ): Promise<RankedPingpongPlayer[]> {
    const players = await this.playerRepository.find({
      relations: ['competitor'],
    });

    const enriched = players.map((player) => this.toRanked(player, now));

    // Sort on the conservative score, same convention as Mario Kart: a high
    // rating with a wide deviation should not outrank a settled one.
    enriched.sort((a, b) => b.conservativeScore - a.conservativeScore);

    let rank = 0;
    for (const player of enriched) {
      if (player.provisional || player.inactive || player.archived) continue;
      if (!player.isRankingEligible) continue;
      rank += 1;
      player.rank = rank;
    }

    return enriched;
  }

  async getPlayerByCompetitorId(
    competitorId: string,
    now: Date = new Date(),
  ): Promise<RankedPingpongPlayer> {
    const player = await this.playerRepository.findOne({
      where: { competitorId },
      relations: ['competitor'],
    });
    if (!player) {
      throw new NotFoundException('Ping-pong player not found');
    }
    return this.toRanked(player, now);
  }

  /** Head-to-head record between two players. */
  async getHeadToHead(playerAId: string, playerBId: string) {
    const pairKey =
      playerAId < playerBId
        ? `${playerAId}:${playerBId}`
        : `${playerBId}:${playerAId}`;

    const matches = await this.matchRepository.find({
      where: { pairKey },
      order: { playedAt: 'DESC' },
    });

    let winsA = 0;
    let winsB = 0;
    for (const match of matches) {
      if (match.winnerId === playerAId) winsA += 1;
      else if (match.winnerId === playerBId) winsB += 1;
    }

    return { playerAId, playerBId, winsA, winsB, matches };
  }

  private toRanked(player: PingpongPlayer, now: Date): RankedPingpongPlayer {
    const classification = classifyPingpongPlayer(
      player.weightedMatchCount,
      player.rd,
      player.lastMatchAt,
      now,
    );

    return {
      id: player.id,
      competitorId: player.competitorId,
      firstName: player.competitor?.firstName ?? '',
      lastName: player.competitor?.lastName ?? '',
      profilePictureUrl: player.competitor?.profilePictureUrl ?? '',
      rating: player.rating,
      rd: player.rd,
      vol: player.vol,
      conservativeScore: this.ratingService.calculateConservativeScore(
        player.rating,
        player.rd,
      ),
      matchCount: player.matchCount,
      weightedMatchCount: player.weightedMatchCount,
      wins: player.wins,
      losses: player.losses,
      setsWon: player.setsWon,
      setsLost: player.setsLost,
      currentStreak: player.currentStreak,
      bestStreak: player.bestStreak,
      lastMatchAt: player.lastMatchAt,
      previousDayRank: player.previousDayRank,
      provisional: classification.provisional,
      inactive: classification.inactive,
      archived: classification.archived,
      isRankingEligible: player.isRankingEligible,
      rank: null,
    };
  }
}
