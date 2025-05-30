import { Injectable, BadRequestException } from '@nestjs/common';
import { Competitor } from './competitor.entity';
import { Glicko2, Player } from 'glicko2';

@Injectable()
export class Glicko2Service {
  private readonly glicko2: Glicko2;

  constructor() {
    this.glicko2 = new Glicko2({
      tau: 0.5,
      rating: 1500,
      rd: 350,
      vol: 0.06
    });
  }

  calculateNewRating(
    competitor: Competitor,
    opponents: { rating: number; rd: number }[],
    scores: number[], // 1 for win, 0 for loss, 0.5 for draw
  ): { rating: number; rd: number; vol: number } {
    try {
      // Validate inputs
      if (!competitor || !opponents || !scores) {
        throw new BadRequestException('Missing required parameters');
      }

      if (opponents.length !== scores.length) {
        throw new BadRequestException('Number of opponents must match number of scores');
      }

      if (!this.isValidNumber(competitor.rating) || !this.isValidNumber(competitor.rd) || !this.isValidNumber(competitor.vol)) {
        throw new BadRequestException('Invalid competitor rating parameters');
      }

      for (const opponent of opponents) {
        if (!this.isValidNumber(opponent.rating) || !this.isValidNumber(opponent.rd)) {
          throw new BadRequestException('Invalid opponent rating parameters');
        }
      }

      for (const score of scores) {
        if (!this.isValidScore(score)) {
          throw new BadRequestException('Invalid score value');
        }
      }

      const player = this.glicko2.makePlayer(competitor.rating, competitor.rd, competitor.vol);
      const matches: [Player, Player, number][] = opponents.map((opponent, index) => {
        const opponentPlayer = this.glicko2.makePlayer(opponent.rating, opponent.rd);
        return [player, opponentPlayer, scores[index]];
      });

      this.glicko2.updateRatings(matches);

      return {
        rating: player.getRating(),
        rd: player.getRd(),
        vol: player.getVol()
      };
    } catch (error) {
      console.error('Error in calculateNewRating:', error);
      throw error;
    }
  }

  private isValidNumber(value: number): boolean {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  private isValidScore(score: number): boolean {
    return this.isValidNumber(score) && (score === 0 || score === 0.5 || score === 1);
  }
} 