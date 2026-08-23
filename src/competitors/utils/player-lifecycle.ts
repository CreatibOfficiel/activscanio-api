const PARIS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function parisDate(date = new Date()): string {
  return PARIS_DATE_FORMATTER.format(date);
}

export function isAlumni(leftAt: string | null, today = parisDate()): boolean {
  return leftAt !== null && leftAt <= today;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function anniversaryTrigger(leftAt: string, year: number): string {
  const [, monthText, dayText] = leftAt.split('-');
  let month = Number(monthText);
  let day = Number(dayText);
  if (month === 2 && day === 29) {
    const leap = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29;
    if (!leap) day = 28;
  }
  const trigger = utcDate(year, month, day);
  const weekday = trigger.getUTCDay();
  if (weekday === 6) trigger.setUTCDate(trigger.getUTCDate() + 2);
  if (weekday === 0) trigger.setUTCDate(trigger.getUTCDate() + 1);
  return trigger.toISOString().slice(0, 10);
}

export function anniversaryYears(leftAt: string, year: number): number {
  return year - Number(leftAt.slice(0, 4));
}
