import { Injectable, Logger } from '@nestjs/common';
import { Glicko2, Player } from 'glicko2';
import { RaceResult } from '../races/race-result.entity';
import { Competitor } from '../competitors/competitor.entity';

/**
 * Service responsible for calculating Glicko-2 ratings
 * Extracted from CompetitorsService for better separation of concerns
 */
@Injectable()
export class RatingCalculationService {
  private readonly logger = new Logger(RatingCalculationService.name);

  // Glicko-2 system parameters
  private readonly TAU = 0.5; // System volatility constraint
  private readonly DEFAULT_RATING = 1500;
  private readonly DEFAULT_RD = 350;
  private readonly DEFAULT_VOL = 0.06;

  /**
   * Calculate updated ratings for all competitors in a race
   * Uses Glicko-2 algorithm to update ratings based on race results
   *
   * @param competitors - Competitors who participated in the race
   * @param raceResults - Results of the race with rankings
   * @returns Map of competitor IDs to updated rating values
   */
  calculateRatingsForRace(
    competitors: Competitor[],
    raceResults: RaceResult[],
  ): Map<string, { rating: number; rd: number; vol: number }> {
    this.logger.log(
      `Calculating ratings for ${competitors.length} competitors`,
    );

    // Initialize Glicko-2 system
    const glicko2 = new Glicko2({
      tau: this.TAU,
      rating: this.DEFAULT_RATING,
      rd: this.DEFAULT_RD,
      vol: this.DEFAULT_VOL,
    });

    // Create Glicko-2 player objects for each competitor
    const players = new Map<string, Player>();
    competitors.forEach((competitor) => {
      const player = glicko2.makePlayer(
        competitor.rating,
        competitor.rd,
        competitor.vol,
      );
      players.set(competitor.id, player);
    });

    // Rank race results by position
    const rankedResults = raceResults
      .map((result) => ({
        ...result,
        player: players.get(result.competitorId)!,
      }))
      .sort((a, b) => a.rank12 - b.rank12);

    // Generate all pairwise matches
    // Each pair represents a head-to-head comparison between two competitors
    const matches: [Player, Player, number][] = [];
    for (let i = 0; i < rankedResults.length; i++) {
      for (let j = i + 1; j < rankedResults.length; j++) {
        const iResult = rankedResults[i];
        const jResult = rankedResults[j];

        // Score: 1 if i beat j, 0.5 if tied, 0 if j beat i
        const score = iResult.rank12 === jResult.rank12 ? 0.5 : 1;
        matches.push([iResult.player, jResult.player, score]);
      }
    }

    this.logger.log(`Generated ${matches.length} pairwise matches`);

    // Update all ratings using Glicko-2 algorithm
    glicko2.updateRatings(matches);

    // Extract updated ratings
    const updatedRatings = new Map<
      string,
      { rating: number; rd: number; vol: number }
    >();

    competitors.forEach((competitor) => {
      const player = players.get(competitor.id)!;
      updatedRatings.set(competitor.id, {
        rating: player.getRating(),
        rd: player.getRd(),
        vol: player.getVol(),
      });
    });

    this.logger.log('Rating calculation completed successfully');

    return updatedRatings;
  }

  /**
   * Calculate conservative score for a competitor
   * Conservative score = rating - 2 * RD
   * This provides a more reliable estimate of skill by accounting for uncertainty
   *
   * @param rating - Glicko-2 rating
   * @param rd - Rating deviation
   */
  calculateConservativeScore(rating: number, rd: number): number {
    return rating - 2 * rd;
  }

  /**
   * Get default rating values for a new competitor
   */
  getDefaultRatings(): { rating: number; rd: number; vol: number } {
    return {
      rating: this.DEFAULT_RATING,
      rd: this.DEFAULT_RD,
      vol: this.DEFAULT_VOL,
    };
  }
}
