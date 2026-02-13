import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillWinStreaks1771700000001 implements MigrationInterface {
  name = 'BackfillWinStreaks1771700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // A7: Backfill bettor win streaks
    // ==========================================
    // For each user with finalized bets, iterate weeks chronologically.
    // A "win" is any week where pointsEarned > 0.
    // We track consecutive wins and compute currentWinStreak + bestWinStreak.

    const bettorRows: Array<{
      userId: string;
      weekNumber: number;
      year: number;
      pointsEarned: number;
    }> = await queryRunner.query(`
      SELECT b."userId", bw."weekNumber", bw."year", b."pointsEarned"
      FROM bets b
      INNER JOIN betting_weeks bw ON bw.id = b."bettingWeekId"
      WHERE b."isFinalized" = true
      ORDER BY b."userId", bw."year" ASC, bw."weekNumber" ASC
    `);

    // Group by user
    const userBets = new Map<
      string,
      Array<{ weekNumber: number; year: number; pointsEarned: number }>
    >();
    for (const row of bettorRows) {
      if (!userBets.has(row.userId)) {
        userBets.set(row.userId, []);
      }
      userBets.get(row.userId)!.push({
        weekNumber: row.weekNumber,
        year: row.year,
        pointsEarned: Number(row.pointsEarned) || 0,
      });
    }

    for (const [userId, bets] of userBets.entries()) {
      let currentWinStreak = 0;
      let bestWinStreak = 0;
      let lastWinWeekNumber: number | null = null;
      let lastWinYear: number | null = null;

      for (const bet of bets) {
        const isWin = bet.pointsEarned > 0;

        if (isWin) {
          const isConsecutive = this.isConsecutiveWeek(
            lastWinWeekNumber,
            lastWinYear,
            bet.weekNumber,
            bet.year,
          );

          if (isConsecutive) {
            currentWinStreak += 1;
          } else {
            currentWinStreak = 1;
          }

          lastWinWeekNumber = bet.weekNumber;
          lastWinYear = bet.year;
          bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
        } else {
          currentWinStreak = 0;
        }
      }

      // Update user_streaks (only if row exists)
      await queryRunner.query(
        `UPDATE "user_streaks"
         SET "currentWinStreak" = $1,
             "bestWinStreak" = $2,
             "lastWinWeekNumber" = $3,
             "lastWinYear" = $4
         WHERE "userId" = $5`,
        [currentWinStreak, bestWinStreak, lastWinWeekNumber, lastWinYear, userId],
      );
    }

    // ==========================================
    // B5: Backfill competitor win streaks
    // ==========================================
    // For each competitor, iterate races chronologically.
    // Track consecutive 1st place finishes.

    const competitorRows: Array<{
      competitorId: string;
      rank12: number;
      raceDate: Date;
    }> = await queryRunner.query(`
      SELECT rr."competitorId", rr."rank12", r."date" as "raceDate"
      FROM race_results rr
      INNER JOIN races r ON r.id = rr."raceId"
      ORDER BY rr."competitorId", r."date" ASC
    `);

    // Group by competitor
    const competitorRaces = new Map<
      string,
      Array<{ rank12: number }>
    >();
    for (const row of competitorRows) {
      if (!competitorRaces.has(row.competitorId)) {
        competitorRaces.set(row.competitorId, []);
      }
      competitorRaces.get(row.competitorId)!.push({
        rank12: row.rank12,
      });
    }

    for (const [competitorId, races] of competitorRaces.entries()) {
      let winStreak = 0;
      let bestWinStreak = 0;

      for (const race of races) {
        if (race.rank12 === 1) {
          winStreak += 1;
          bestWinStreak = Math.max(bestWinStreak, winStreak);
        } else {
          winStreak = 0;
        }
      }

      await queryRunner.query(
        `UPDATE "competitors"
         SET "winStreak" = $1,
             "bestWinStreak" = $2
         WHERE "id" = $3`,
        [winStreak, bestWinStreak, competitorId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reset all win streak data
    await queryRunner.query(
      `UPDATE "user_streaks"
       SET "currentWinStreak" = 0,
           "bestWinStreak" = 0,
           "lastWinWeekNumber" = NULL,
           "lastWinYear" = NULL`,
    );

    await queryRunner.query(
      `UPDATE "competitors"
       SET "bestWinStreak" = 0`,
    );
  }

  private isConsecutiveWeek(
    lastWeek: number | null,
    lastYear: number | null,
    currentWeek: number,
    currentYear: number,
  ): boolean {
    if (lastWeek === null || lastYear === null) return false;

    // Same year, next week
    if (lastYear === currentYear && currentWeek === lastWeek + 1) return true;

    // Year transition
    if (
      lastYear === currentYear - 1 &&
      lastWeek >= 52 &&
      currentWeek === 1
    ) {
      return true;
    }

    return false;
  }
}
