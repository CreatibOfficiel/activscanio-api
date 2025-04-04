import { Injectable } from '@nestjs/common';
import { rate, Rating } from 'ts-trueskill';

@Injectable()
export class RatingService {
  /**
   * Updates TrueSkill ratings for a set of players grouped by rank.
   * @param results An array of objects containing:
   *   - id: string (competitor ID)
   *   - rating: Rating (the current TrueSkill rating with { mu, sigma })
   *   - rank: number (1 = best, 2 = second, etc.)
   *
   * @returns An array of updated results containing old and new rating values.
   */
  updateRatings(
    results: { id: string; rating: Rating; rank: number }[],
  ): { id: string; oldRating: Rating; newRating: Rating }[] {
    // Step 1: Sort players by rank
    const sorted = [...results].sort((a, b) => a.rank - b.rank);

    // Step 2: Group players by rank
    //   Example: if you have one competitor at rank 1, two competitors at rank 2,
    //   they should be grouped in arrays for the TrueSkill 'rate' function.
    const groups: Rating[][] = [];
    let currentRank = sorted[0].rank;
    let currentGroup: Rating[] = [];

    for (const res of sorted) {
      if (res.rank !== currentRank) {
        groups.push(currentGroup);
        currentGroup = [];
        currentRank = res.rank;
      }
      currentGroup.push(res.rating);
    }
    groups.push(currentGroup);

    // Step 3: Call the 'rate' function from ts-trueskill
    const newRatingsGrouped = rate(groups);

    // Number of human players
    const numPlayers = sorted.length;
    const dynamicWeight = Math.min(1, 0.85 + 0.15 * (numPlayers - 3));

    // Step 4: Build a final array of updated results
    const updatedResults: {
      id: string;
      oldRating: Rating;
      newRating: Rating;
    }[] = [];
    let indexGlobal = 0;

    for (
      let groupIndex = 0;
      groupIndex < newRatingsGrouped.length;
      groupIndex++
    ) {
      const groupBefore = groups[groupIndex]; // old group
      const groupAfter = newRatingsGrouped[groupIndex]; // new group
      for (let i = 0; i < groupBefore.length; i++) {
        const oldRating = groupBefore[i];
        let newRating = groupAfter[i];

        // Apply the dynamic weight to the new rating
        newRating = {
          mu: oldRating.mu + dynamicWeight * (newRating.mu - oldRating.mu),
          sigma:
            oldRating.sigma +
            dynamicWeight * (newRating.sigma - oldRating.sigma),
            pi: oldRating.pi,
            tau: oldRating.tau,
            mul: oldRating.mul,
            div: oldRating.div
        };

        const playerId = sorted[indexGlobal].id;
        updatedResults.push({ id: playerId, oldRating, newRating });
        indexGlobal++;
      }
    }

    return updatedResults;
  }
}
