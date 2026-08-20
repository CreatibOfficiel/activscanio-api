import { WeekUtils } from '../week-utils';

/**
 * Backing test for the `period=week` race filter.
 *
 * That filter used to subtract 7 days from today, which is a rolling window,
 * not the Monday->Sunday week the rest of the app runs on (betting weeks,
 * seasons). The list it returned therefore disagreed with the "Cette semaine"
 * group headers rendered over it.
 *
 * `getMondayOfDate` computes the Monday directly from the date rather than
 * going through getISOWeek + getMondayOfWeek(year, week). That indirection is
 * a trap around new year: a 31 December date can sit in ISO week 1, while
 * getFullYear() still reports the old year — pairing the two yields the Monday
 * of the wrong week, roughly a year off.
 */
describe('WeekUtils.getMondayOfDate', () => {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('returns the same Monday for every day of one week', () => {
    // Mon 17 Aug 2026 -> Sun 23 Aug 2026
    for (let day = 17; day <= 23; day++) {
      const monday = WeekUtils.getMondayOfDate(new Date(2026, 7, day, 15, 30));
      expect(ymd(monday)).toBe('2026-08-17');
    }
  });

  it('starts the week on Monday, not Sunday', () => {
    // The Sunday before belongs to the previous week.
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2026, 7, 16)))).toBe(
      '2026-08-10',
    );
  });

  it('is idempotent on a Monday', () => {
    const monday = WeekUtils.getMondayOfDate(new Date(2026, 7, 17, 9));
    expect(ymd(WeekUtils.getMondayOfDate(monday))).toBe('2026-08-17');
  });

  it('normalizes to midnight', () => {
    const monday = WeekUtils.getMondayOfDate(new Date(2026, 7, 20, 23, 59, 59));
    expect([
      monday.getHours(),
      monday.getMinutes(),
      monday.getSeconds(),
      monday.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it('holds across a new-year boundary', () => {
    // Mon 28 Dec 2026 -> Sun 3 Jan 2027 is one week spanning two years.
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2026, 11, 31)))).toBe(
      '2026-12-28',
    );
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2027, 0, 1)))).toBe(
      '2026-12-28',
    );
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2027, 0, 3)))).toBe(
      '2026-12-28',
    );
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2027, 0, 4)))).toBe(
      '2027-01-04',
    );
  });

  it('holds across a month boundary', () => {
    // Mon 31 Aug 2026 -> Sun 6 Sep 2026
    expect(ymd(WeekUtils.getMondayOfDate(new Date(2026, 8, 2)))).toBe(
      '2026-08-31',
    );
  });
});
