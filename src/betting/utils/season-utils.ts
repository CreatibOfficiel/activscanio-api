/**
 * Season utilities for 4-week fixed seasons.
 *
 * Season layout (13 seasons per year, aligned on ISO weeks):
 *   Season 1  = weeks 1–4
 *   Season 2  = weeks 5–8
 *   ...
 *   Season 12 = weeks 45–48
 *   Season 13 = weeks 49–53  (absorbs the occasional week 53)
 */
export class SeasonUtils {
  /** Map an ISO week number (1-53) to a season number (1-13). */
  static getSeasonNumber(weekNumber: number): number {
    return Math.min(Math.ceil(weekNumber / 4), 13);
  }

  /** True when this week is the first of its season (calibration week). */
  static isFirstWeekOfSeason(weekNumber: number): boolean {
    return weekNumber <= 52 && (weekNumber - 1) % 4 === 0;
  }

  /** Return the ISO week range for a given season. */
  static getSeasonWeeks(seasonNumber: number): { start: number; end: number } {
    if (seasonNumber === 13) return { start: 49, end: 53 };
    return { start: (seasonNumber - 1) * 4 + 1, end: seasonNumber * 4 };
  }

  /**
   * Return the previous season number and its year.
   * Handles the wrap-around from season 1 to season 13 of the previous year.
   */
  static getPreviousSeason(
    seasonNumber: number,
    year: number,
  ): { seasonNumber: number; year: number } {
    if (seasonNumber === 1) {
      return { seasonNumber: 13, year: year - 1 };
    }
    return { seasonNumber: seasonNumber - 1, year };
  }
}
