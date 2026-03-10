/**
 * Count the number of business days (Mon-Fri) between two dates (date-only, ignoring time).
 * Returns 0 if both dates fall on the same business day.
 */
export function businessDaysBetween(d1: Date, d2: Date): number {
  const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

  if (start >= end) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1); // start from the day after d1

  while (cursor <= end) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

/**
 * List the missed business days (Mon-Fri) between two dates, excluding d1 and d2 themselves.
 * Returns ISO date strings (YYYY-MM-DD).
 */
export function missedBusinessDays(d1: Date, d2: Date): string[] {
  const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

  if (start >= end) return [];

  const missed: string[] = [];
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1); // start from the day after d1

  while (cursor < end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      missed.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return missed;
}
