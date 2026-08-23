import { anniversaryTrigger, anniversaryYears, isAlumni } from '../player-lifecycle';

describe('player lifecycle', () => {
  it('switches from active to alumni exactly on the departure date', () => {
    expect(isAlumni('2026-08-24', '2026-08-23')).toBe(false);
    expect(isAlumni('2026-08-24', '2026-08-24')).toBe(true);
  });

  it('moves a Saturday anniversary to Monday', () => {
    expect(anniversaryTrigger('2023-08-29', 2026)).toBe('2026-08-31');
  });

  it('moves a Sunday anniversary to Monday', () => {
    expect(anniversaryTrigger('2024-08-30', 2026)).toBe('2026-08-31');
  });

  it('uses February 28 for leap-day departures in non-leap years', () => {
    expect(anniversaryTrigger('2024-02-29', 2025)).toBe('2025-02-28');
    expect(anniversaryYears('2024-02-29', 2025)).toBe(1);
  });
});
