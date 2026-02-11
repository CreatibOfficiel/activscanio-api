import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayStreakFields1771200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "playStreak" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "bestPlayStreak" int NOT NULL DEFAULT 0`,
    );

    // Backfill: recalculate streaks from race history
    await this.backfillStreaks(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "bestPlayStreak"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "playStreak"`,
    );
  }

  /**
   * Backfill play streaks by replaying race history for each competitor.
   *
   * For each competitor:
   * 1. Get all distinct race dates (from race_results JOIN races), sorted ASC
   * 2. Walk through dates applying the streak logic:
   *    - 0 business days between = same day, skip
   *    - 1-2 business days = streak continues
   *    - 3+ business days = streak resets to 1
   * 3. Track bestPlayStreak as the max streak seen
   * 4. After walking all dates, check if current streak is still valid
   *    (i.e. last race date is within 2 business days of today)
   */
  private async backfillStreaks(queryRunner: QueryRunner): Promise<void> {
    // Get all competitors
    const competitors: { id: string }[] = await queryRunner.query(
      `SELECT id FROM "competitors"`,
    );

    for (const comp of competitors) {
      // Get distinct race dates for this competitor, ordered ASC
      const raceDates: { date: string }[] = await queryRunner.query(
        `SELECT DISTINCT r."date"::date as date
         FROM "race_results" rr
         JOIN "races" r ON r."id" = rr."raceId"
         WHERE rr."competitorId" = $1
         ORDER BY date ASC`,
        [comp.id],
      );

      if (raceDates.length === 0) continue;

      let playStreak = 1;
      let bestPlayStreak = 1;

      for (let i = 1; i < raceDates.length; i++) {
        const prevDate = new Date(raceDates[i - 1].date);
        const currDate = new Date(raceDates[i].date);
        const businessDays = this.businessDaysBetween(prevDate, currDate);

        if (businessDays === 0) {
          // Same business day — no change
          continue;
        } else if (businessDays <= 2) {
          playStreak += 1;
        } else {
          playStreak = 1;
        }

        bestPlayStreak = Math.max(bestPlayStreak, playStreak);
      }

      // Check if the current streak is still active (last race within 2 business days of now)
      const lastRaceDate = new Date(raceDates[raceDates.length - 1].date);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const businessDaysSinceLast = this.businessDaysBetween(
        lastRaceDate,
        today,
      );

      if (businessDaysSinceLast > 2) {
        // Streak is broken — reset current streak but keep best
        playStreak = 0;
      }

      await queryRunner.query(
        `UPDATE "competitors" SET "playStreak" = $1, "bestPlayStreak" = $2 WHERE "id" = $3`,
        [playStreak, bestPlayStreak, comp.id],
      );
    }
  }

  private businessDaysBetween(d1: Date, d2: Date): number {
    const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

    if (start >= end) return 0;

    let count = 0;
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);

    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return count;
  }
}
