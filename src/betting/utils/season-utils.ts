/**
 * Season utilities for 4-week fixed seasons.
 *
 * Seasons are 4-week blocks starting from the app launch week (ISO week 7, 2026).
 *   Season 1 = weeks 7–10
 *   Season 2 = weeks 11–14
 *   ...
 */

const APP_START_WEEK = 7; // ISO week when the app launched (2026)
const APP_START_YEAR = 2026;
const WEEKS_PER_SEASON = 4;

export class SeasonUtils {
  /** Map an ISO week number to a season number (1-based, from app start). */
  static getSeasonNumber(weekNumber: number, year: number = APP_START_YEAR): number {
    const yearOffset = (year - APP_START_YEAR) * 52;
    const absoluteWeek = yearOffset + weekNumber - APP_START_WEEK;
    return Math.floor(absoluteWeek / WEEKS_PER_SEASON) + 1;
  }

  /** True when this week is the first of its season (calibration week). */
  static isFirstWeekOfSeason(weekNumber: number, year: number = APP_START_YEAR): boolean {
    const yearOffset = (year - APP_START_YEAR) * 52;
    const absoluteWeek = yearOffset + weekNumber - APP_START_WEEK;
    return absoluteWeek % WEEKS_PER_SEASON === 0;
  }

  /** Return the ISO week range for a given season. */
  static getSeasonWeeks(seasonNumber: number): { start: number; end: number } {
    const firstAbsoluteWeek = (seasonNumber - 1) * WEEKS_PER_SEASON;
    const start = APP_START_WEEK + firstAbsoluteWeek;
    const end = start + WEEKS_PER_SEASON - 1;
    return { start, end };
  }

  /**
   * Return the previous season number and its year.
   */
  static getPreviousSeason(
    seasonNumber: number,
    year: number,
  ): { seasonNumber: number; year: number } {
    if (seasonNumber <= 1) {
      // Wrap-around: compute how many seasons fit in a year
      const seasonsPerYear = Math.ceil(52 / WEEKS_PER_SEASON);
      return { seasonNumber: seasonsPerYear, year: year - 1 };
    }
    return { seasonNumber: seasonNumber - 1, year };
  }
}
