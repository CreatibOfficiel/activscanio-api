import { SeasonUtils } from './season-utils';
import { WeekUtils } from './week-utils';

/**
 * The period vocabulary the history screens filter by.
 *
 * 'all' and anything unrecognised mean no date filter at all.
 */
export type HistoryPeriod = 'all' | 'today' | 'week' | 'season';

export interface PeriodRange {
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Resolve a period name into a date range.
 *
 * Extracted from the races service so the ping-pong match history can filter
 * by the same words and get the same answer. "Cette semaine" has to mean one
 * Monday across the app: two copies of this switch would be one deploy away
 * from disagreeing, and a reader comparing the two histories would have no
 * way to tell which was right.
 *
 * @param period - The requested period; unrecognised values filter nothing
 */
export function resolvePeriodRange(period?: string): PeriodRange {
  const now = new Date();

  switch (period) {
    case 'today':
      return {
        dateFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      };

    case 'week':
      // Current calendar week (Monday 00:00 -> now), matching the weekly
      // Monday->Sunday cycle used everywhere else in the app.
      return { dateFrom: WeekUtils.getMondayOfDate(now) };

    case 'season': {
      const weekNumber = WeekUtils.getISOWeek(now);
      const year = now.getFullYear();
      const seasonNumber = SeasonUtils.getSeasonNumber(weekNumber, year);
      const seasonWeeks = SeasonUtils.getSeasonWeeks(seasonNumber);
      const endMonday = WeekUtils.getMondayOfWeek(year, seasonWeeks.end);
      return {
        dateFrom: WeekUtils.getMondayOfWeek(year, seasonWeeks.start),
        // Sunday 23:59:59.999 of the season's last week.
        dateTo: new Date(endMonday.getTime() + 6 * 86400000 + 86399999),
      };
    }

    // 'all', undefined, or anything unrecognised: no date filter.
    default:
      return {};
  }
}
