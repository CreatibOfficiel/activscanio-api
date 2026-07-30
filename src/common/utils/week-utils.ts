/**
 * ISO week calculation utilities.
 *
 * ISO weeks start on Monday and week 1 is the week containing January 4th.
 */
export class WeekUtils {
  /**
   * Get ISO week number for a date
   * ISO weeks start on Monday and week 1 contains Jan 4th
   */
  static getISOWeek(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Monday = 0
    target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target.getTime() - firstThursday.getTime();
    return 1 + Math.round(diff / 604800000); // 604800000 = 7 * 24 * 60 * 60 * 1000
  }

  /**
   * Get the Monday of a given week
   */
  static getMondayOfWeek(year: number, week: number): Date {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const firstMonday = new Date(year, 0, 4 - jan4Day);
    const monday = new Date(firstMonday.getTime() + (week - 1) * 604800000);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Get the Sunday of a given week
   */
  static getSundayOfWeek(year: number, week: number): Date {
    const monday = this.getMondayOfWeek(year, week);
    const sunday = new Date(monday.getTime() + 6 * 86400000); // +6 days
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }

  /**
   * Get the month a week belongs to (based on Monday)
   */
  static getWeekMonth(year: number, week: number): number {
    const monday = this.getMondayOfWeek(year, week);
    return monday.getMonth() + 1; // getMonth() returns 0-11
  }
}
