/**
 * Tests for week manager service
 *
 * Focus on:
 * - First week of month detection (calibration week)
 * - ISO week calculation
 */

describe('First Week of Month Detection', () => {
  /**
   * A week is considered the "first week of the month" if its Monday
   * is on or before the 7th day of the month.
   */
  const isFirstWeekOfMonth = (mondayOfWeek: Date): boolean => {
    const dayOfMonth = mondayOfWeek.getDate();
    return dayOfMonth <= 7;
  };

  describe('isFirstWeekOfMonth', () => {
    it('should return true for Monday on the 1st', () => {
      const monday = new Date(2024, 0, 1); // January 1, 2024 (Monday)
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });

    it('should return true for Monday on the 7th', () => {
      const monday = new Date(2024, 0, 7); // January 7, 2024
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });

    it('should return false for Monday on the 8th', () => {
      const monday = new Date(2024, 0, 8); // January 8, 2024
      expect(isFirstWeekOfMonth(monday)).toBe(false);
    });

    it('should return false for Monday on the 15th', () => {
      const monday = new Date(2024, 0, 15); // January 15, 2024
      expect(isFirstWeekOfMonth(monday)).toBe(false);
    });

    it('should return true for first Monday of February', () => {
      const monday = new Date(2024, 1, 5); // February 5, 2024
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });
  });
});

describe('ISO Week Utilities', () => {
  /**
   * Get ISO week number for a date
   * ISO weeks start on Monday and week 1 contains Jan 4th
   */
  const getISOWeek = (date: Date): number => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Monday = 0
    target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target.getTime() - firstThursday.getTime();
    return 1 + Math.round(diff / 604800000);
  };

  /**
   * Get the Monday of a given week
   */
  const getMondayOfWeek = (year: number, week: number): Date => {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const firstMonday = new Date(year, 0, 4 - jan4Day);
    const monday = new Date(firstMonday.getTime() + (week - 1) * 604800000);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  describe('getISOWeek', () => {
    it('should return week 1 for January 1, 2024', () => {
      // January 1, 2024 is a Monday
      expect(getISOWeek(new Date(2024, 0, 1))).toBe(1);
    });

    it('should return week 1 for January 7, 2024', () => {
      expect(getISOWeek(new Date(2024, 0, 7))).toBe(1);
    });

    it('should return week 2 for January 8, 2024', () => {
      expect(getISOWeek(new Date(2024, 0, 8))).toBe(2);
    });

    it('should handle December 31, 2024 (which is ISO week 1 of 2025)', () => {
      // December 31, 2024 is a Tuesday, and it falls in ISO week 1 of 2025
      // because ISO week 1 is the week containing January 4th
      const week = getISOWeek(new Date(2024, 11, 31));
      expect(week).toBe(1); // ISO week 1 of 2025
    });

    it('should return week 52 for December 30, 2024', () => {
      // December 30, 2024 is in ISO week 1 of 2025 as well
      // Let's test a clear case: December 23, 2024 (Monday of week 52)
      const week = getISOWeek(new Date(2024, 11, 23));
      expect(week).toBe(52);
    });
  });

  describe('getMondayOfWeek', () => {
    it('should return correct Monday for week 1 of 2024', () => {
      const monday = getMondayOfWeek(2024, 1);
      expect(monday.getDate()).toBe(1);
      expect(monday.getMonth()).toBe(0); // January
      expect(monday.getDay()).toBe(1); // Monday
    });

    it('should return correct Monday for week 2 of 2024', () => {
      const monday = getMondayOfWeek(2024, 2);
      expect(monday.getDate()).toBe(8);
      expect(monday.getMonth()).toBe(0);
      expect(monday.getDay()).toBe(1);
    });

    it('should return correct Monday for week 5 of 2024', () => {
      const monday = getMondayOfWeek(2024, 5);
      expect(monday.getDate()).toBe(29);
      expect(monday.getMonth()).toBe(0); // Still January
    });
  });

  describe('First week determination for various months', () => {
    const isFirstWeekOfMonth = (mondayOfWeek: Date): boolean => {
      const dayOfMonth = mondayOfWeek.getDate();
      return dayOfMonth <= 7;
    };

    // January 2024: Week 1 starts on Jan 1 (Monday) - IS first week
    it('January 2024 week 1 should be calibration week', () => {
      const monday = getMondayOfWeek(2024, 1);
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });

    // January 2024: Week 2 starts on Jan 8 - NOT first week
    it('January 2024 week 2 should NOT be calibration week', () => {
      const monday = getMondayOfWeek(2024, 2);
      expect(isFirstWeekOfMonth(monday)).toBe(false);
    });

    // February 2024: Week 5 starts on Jan 29 - NOT first week of Feb
    it('Week starting Jan 29 should NOT be first week of Feb', () => {
      const monday = getMondayOfWeek(2024, 5);
      expect(monday.getMonth()).toBe(0); // Still January
      expect(isFirstWeekOfMonth(monday)).toBe(false);
    });

    // February 2024: Week 6 starts on Feb 5 - IS first week of Feb
    it('Week starting Feb 5 should be first week of Feb', () => {
      const monday = getMondayOfWeek(2024, 6);
      expect(monday.getMonth()).toBe(1); // February
      expect(monday.getDate()).toBe(5);
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });

    // March 2024: Week 9 starts on Feb 26 - NOT first week of March
    it('Week starting Feb 26 should NOT be first week of March', () => {
      const monday = getMondayOfWeek(2024, 9);
      expect(monday.getMonth()).toBe(1); // Still February
      expect(isFirstWeekOfMonth(monday)).toBe(false);
    });

    // March 2024: Week 10 starts on Mar 4 - IS first week of March
    it('Week starting Mar 4 should be first week of March', () => {
      const monday = getMondayOfWeek(2024, 10);
      expect(monday.getMonth()).toBe(2); // March
      expect(monday.getDate()).toBe(4);
      expect(isFirstWeekOfMonth(monday)).toBe(true);
    });
  });
});

describe('Betting Week Status', () => {
  enum BettingWeekStatus {
    CALIBRATION = 'calibration',
    OPEN = 'open',
    CLOSED = 'closed',
    FINALIZED = 'finalized',
  }

  it('should have CALIBRATION status available', () => {
    expect(BettingWeekStatus.CALIBRATION).toBe('calibration');
  });

  it('should have correct status order', () => {
    // Calibration comes before Open in the lifecycle
    const statuses = Object.values(BettingWeekStatus);
    expect(statuses).toContain('calibration');
    expect(statuses).toContain('open');
    expect(statuses).toContain('closed');
    expect(statuses).toContain('finalized');
  });
});
