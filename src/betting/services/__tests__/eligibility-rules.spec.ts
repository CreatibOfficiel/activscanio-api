/**
 * Tests for competitor eligibility rules
 *
 * Rules tested:
 * 1. Calibration: MIN_LIFETIME_RACES (5) total races required
 * 2. Recent activity: MIN_RECENT_RACES (2) in last RECENT_WINDOW_DAYS (14) days
 * 3. Weekly activity: MIN_RACES_THIS_WEEK (1) in current betting week
 */

import { ELIGIBILITY_RULES } from '../../config/odds-calculator.config';

describe('Eligibility Rules Configuration', () => {
  it('should have correct calibration threshold', () => {
    expect(ELIGIBILITY_RULES.MIN_LIFETIME_RACES).toBe(5);
  });

  it('should have correct recent activity threshold', () => {
    expect(ELIGIBILITY_RULES.MIN_RECENT_RACES).toBe(2);
  });

  it('should have correct rolling window period', () => {
    expect(ELIGIBILITY_RULES.RECENT_WINDOW_DAYS).toBe(14);
  });

  it('should have correct weekly activity threshold', () => {
    expect(ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK).toBe(1);
  });
});

describe('Eligibility Logic', () => {
  // Helper to create mock competitor
  const createMockCompetitor = (
    overrides: Partial<{
      totalLifetimeRaces: number;
      rating: number;
      rd: number;
    }> = {},
  ) => ({
    id: 'test-id',
    firstName: 'Test',
    lastName: 'Competitor',
    rating: 1500,
    rd: 350,
    vol: 0.06,
    totalLifetimeRaces: 0,
    ...overrides,
  });

  // Helper to create mock recent race
  const createMockRace = (daysAgo: number) => ({
    rank12: 5,
    date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    raceId: `race-${daysAgo}`,
  });

  /**
   * Inline eligibility check function (mirrors the service implementation)
   */
  const checkEligibility = (
    competitor: { totalLifetimeRaces: number },
    recentRaces: Array<{ date: Date }>,
    racesThisWeekCount: number,
  ): {
    isEligible: boolean;
    reason: 'calibrating' | 'inactive' | 'no_races_this_week' | null;
  } => {
    // Rule 1: Calibration check
    if (competitor.totalLifetimeRaces < ELIGIBILITY_RULES.MIN_LIFETIME_RACES) {
      return { isEligible: false, reason: 'calibrating' };
    }

    // Rule 2: Recent activity check
    const windowStart = new Date();
    windowStart.setDate(
      windowStart.getDate() - ELIGIBILITY_RULES.RECENT_WINDOW_DAYS,
    );

    const recentRacesIn14Days = recentRaces.filter(
      (r) => new Date(r.date) >= windowStart,
    ).length;

    if (recentRacesIn14Days < ELIGIBILITY_RULES.MIN_RECENT_RACES) {
      return { isEligible: false, reason: 'inactive' };
    }

    // Rule 3: Weekly activity check
    if (racesThisWeekCount < ELIGIBILITY_RULES.MIN_RACES_THIS_WEEK) {
      return { isEligible: false, reason: 'no_races_this_week' };
    }

    return { isEligible: true, reason: null };
  };

  describe('Calibration Rule (totalLifetimeRaces)', () => {
    it('should mark competitor with 4 races as not eligible (calibrating)', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 4 });
      const recentRaces = [createMockRace(1), createMockRace(2)];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('calibrating');
    });

    it('should mark competitor with 0 races as not eligible (calibrating)', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 0 });

      const result = checkEligibility(competitor, [], 0);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('calibrating');
    });

    it('should pass calibration check with exactly 5 races', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 5 });
      const recentRaces = [createMockRace(1), createMockRace(2)];

      const result = checkEligibility(competitor, recentRaces, 1);

      // Should pass calibration, might fail other checks
      expect(result.reason).not.toBe('calibrating');
    });

    it('should pass calibration check with more than 5 races', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 100 });
      const recentRaces = [createMockRace(1), createMockRace(2)];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.reason).not.toBe('calibrating');
    });
  });

  describe('Recent Activity Rule (14-day rolling window)', () => {
    it('should mark competitor with only 1 recent race as inactive', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(5)]; // Only 1 race in last 14 days

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('inactive');
    });

    it('should mark competitor with no recent races as inactive', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(20), createMockRace(25)]; // All races older than 14 days

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('inactive');
    });

    it('should pass activity check with exactly 2 races in 14 days', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(5), createMockRace(10)];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.reason).not.toBe('inactive');
    });

    it('should pass activity check with races at boundary (14 days ago)', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [
        createMockRace(1),
        createMockRace(14), // Exactly at boundary
      ];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.reason).not.toBe('inactive');
    });

    it('should fail activity check with race just outside boundary (15 days)', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [
        createMockRace(1),
        createMockRace(15), // Just outside boundary
      ];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('inactive');
    });
  });

  describe('Weekly Activity Rule', () => {
    it('should mark competitor with no races this week as ineligible', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(1), createMockRace(5)];

      const result = checkEligibility(competitor, recentRaces, 0);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('no_races_this_week');
    });

    it('should pass with exactly 1 race this week', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(1), createMockRace(5)];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('Full Eligibility (all rules combined)', () => {
    it('should be eligible with 5+ lifetime races, 2+ recent races, and 1+ this week', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 5 });
      const recentRaces = [createMockRace(1), createMockRace(7)];

      const result = checkEligibility(competitor, recentRaces, 1);

      expect(result.isEligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should check rules in correct order (calibration first)', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 3 });
      // Would fail all rules, but calibration should be checked first
      const result = checkEligibility(competitor, [], 0);

      expect(result.reason).toBe('calibrating');
    });

    it('should check activity after calibration passes', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(20)]; // Only old races

      const result = checkEligibility(competitor, recentRaces, 0);

      // Should fail on inactive, not calibrating
      expect(result.reason).toBe('inactive');
    });

    it('should check weekly activity last', () => {
      const competitor = createMockCompetitor({ totalLifetimeRaces: 10 });
      const recentRaces = [createMockRace(1), createMockRace(5)];

      const result = checkEligibility(competitor, recentRaces, 0);

      // Should fail on weekly, not others
      expect(result.reason).toBe('no_races_this_week');
    });
  });
});

describe('Soft Reset Formula (75/25)', () => {
  /**
   * Soft reset formula:
   * newRating = 0.75 * oldRating + 0.25 * 1500
   */
  const calculateSoftReset = (oldRating: number): number => {
    return 0.75 * oldRating + 0.25 * 1500;
  };

  const calculateRdReset = (oldRd: number): number => {
    return Math.min(oldRd + 50, 350);
  };

  it('should soft reset rating from 1800 to 1725', () => {
    const result = calculateSoftReset(1800);
    expect(result).toBe(1725);
  });

  it('should soft reset rating from 1200 to 1275', () => {
    const result = calculateSoftReset(1200);
    expect(result).toBe(1275);
  });

  it('should soft reset rating from 1500 to 1500 (no change)', () => {
    const result = calculateSoftReset(1500);
    expect(result).toBe(1500);
  });

  it('should narrow the gap between players (600 -> 450)', () => {
    const highRating = 1800;
    const lowRating = 1200;

    const originalGap = highRating - lowRating;
    const newGap =
      calculateSoftReset(highRating) - calculateSoftReset(lowRating);

    expect(originalGap).toBe(600);
    expect(newGap).toBe(450);
    expect(newGap).toBeLessThan(originalGap);
  });

  it('should preserve relative ranking order', () => {
    const ratings = [1800, 1650, 1500, 1350, 1200];
    const resetRatings = ratings.map(calculateSoftReset);

    // Check descending order is preserved
    for (let i = 0; i < resetRatings.length - 1; i++) {
      expect(resetRatings[i]).toBeGreaterThan(resetRatings[i + 1]);
    }
  });

  describe('RD Reset', () => {
    it('should increase RD by 50 when below 300', () => {
      expect(calculateRdReset(50)).toBe(100);
      expect(calculateRdReset(200)).toBe(250);
      expect(calculateRdReset(299)).toBe(349);
    });

    it('should cap RD at 350', () => {
      expect(calculateRdReset(300)).toBe(350);
      expect(calculateRdReset(320)).toBe(350);
      expect(calculateRdReset(350)).toBe(350);
    });
  });
});
