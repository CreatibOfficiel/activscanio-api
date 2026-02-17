import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecalculatePlayStreaks1772400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const competitors: { id: string }[] = await queryRunner.query(
      `SELECT id FROM "competitors"`,
    );

    for (const comp of competitors) {
      const raceDates: { date: string }[] = await queryRunner.query(
        `SELECT DISTINCT r."date"::date as date
         FROM "race_results" rr
         JOIN "races" r ON r."id" = rr."raceId"
         WHERE rr."competitorId" = $1
         ORDER BY date ASC`,
        [comp.id],
      );

      if (raceDates.length === 0) {
        await queryRunner.query(
          `UPDATE "competitors" SET "playStreak" = 0, "bestPlayStreak" = 0 WHERE "id" = $1`,
          [comp.id],
        );
        continue;
      }

      let playStreak = 1;
      let bestPlayStreak = 1;

      for (let i = 1; i < raceDates.length; i++) {
        const prevDate = new Date(raceDates[i - 1].date);
        const currDate = new Date(raceDates[i].date);
        const businessDays = this.businessDaysBetween(prevDate, currDate);

        if (businessDays === 0) {
          continue;
        } else if (businessDays <= 2) {
          playStreak += 1;
        } else {
          playStreak = 1;
        }

        bestPlayStreak = Math.max(bestPlayStreak, playStreak);
      }

      // Check if current streak is still active
      const lastRaceDate = new Date(raceDates[raceDates.length - 1].date);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const businessDaysSinceLast = this.businessDaysBetween(
        lastRaceDate,
        today,
      );

      if (businessDaysSinceLast > 2) {
        playStreak = 0;
      }

      await queryRunner.query(
        `UPDATE "competitors" SET "playStreak" = $1, "bestPlayStreak" = $2 WHERE "id" = $3`,
        [playStreak, bestPlayStreak, comp.id],
      );
    }
  }

  public async down(): Promise<void> {
    // No rollback — values were already stale before this migration
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
