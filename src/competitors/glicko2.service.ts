import { Injectable } from '@nestjs/common';
import { Competitor } from './competitor.entity';

@Injectable()
export class Glicko2Service {
  // Glicko-2 constants
  private readonly TAU = 0.5; // Volatility constant
  private readonly EPSILON = 0.000001; // Precision for iterative calculations

  // Calculate the new rating of a player after a series of matches
  calculateNewRating(
    competitor: Competitor,
    opponents: { rating: number; rd: number }[],
    scores: number[], // 1 for win, 0 for loss, 0.5 for draw
  ): { rating: number; rd: number; vol: number } {
    const { rating, rd, vol } = competitor;
    const n = opponents.length;

    if (n === 0) {
      return { rating, rd, vol };
    }

    // Calculate the variance and the delta
    let variance = 0;
    let delta = 0;

    for (let i = 0; i < n; i++) {
      const opponent = opponents[i];
      const g = this.g(opponent.rd);
      const E = this.E(rating, opponent.rating, opponent.rd);
      variance += g * g * E * (1 - E);
      delta += g * (scores[i] - E);
    }

    variance = 1 / variance;
    delta = delta * variance;

    // Calculate the new volatility
    const newVol = this.calculateNewVolatility(vol, delta, variance, n);

    // Calculate the new RD
    const newRd = Math.sqrt(1 / (1 / (rd * rd) + 1 / variance));

    // Calculate the new rating
    const newRating = rating + newRd * newRd * delta;

    return {
      rating: newRating,
      rd: newRd,
      vol: newVol,
    };
  }

  // Calculate the rankings of the players based on their rating
  calculateRankings(competitors: Competitor[]): Array<Competitor & { rank: number }> {
    return competitors
      .map(competitor => ({
        ...competitor,
        rank: 0, // Will be updated in the sort
      }))
      .sort((a, b) => b.rating - a.rating)
      .map((competitor, index) => ({
        ...competitor,
        rank: index + 1,
      }));
  }

  private g(rd: number): number {
    return 1 / Math.sqrt(1 + (3 * rd * rd) / (Math.PI * Math.PI));
  }

  private E(rating: number, opponentRating: number, opponentRd: number): number {
    return 1 / (1 + Math.exp(-this.g(opponentRd) * (rating - opponentRating)));
  }

  private calculateNewVolatility(
    vol: number,
    delta: number,
    variance: number,
    n: number,
  ): number {
    const a = Math.log(vol * vol);
    const f = (x: number) => {
      const ex = Math.exp(x);
      const a2 = a - x;
      const num = ex * (delta * delta - vol * vol - variance - ex);
      const den = 2 * (vol * vol + variance + ex) * (vol * vol + variance + ex);
      return (num / den) - (a2 / (this.TAU * this.TAU));
    };

    let A = a;
    let B = Math.log(delta * delta - vol * vol - variance);
    if (delta * delta > vol * vol + variance) {
      B = Math.log(delta * delta - vol * vol - variance);
    } else {
      let k = 1;
      while (f(a - k * this.TAU) < 0) {
        k++;
      }
      B = a - k * this.TAU;
    }

    let fA = f(A);
    let fB = f(B);

    while (Math.abs(B - A) > this.EPSILON) {
      const C = A + (A - B) * fA / (fB - fA);
      const fC = f(C);

      if (fC * fB < 0) {
        A = B;
        fA = fB;
      } else {
        fA = fA / 2;
      }

      B = C;
      fB = fC;
    }

    return Math.exp(A / 2);
  }
} 