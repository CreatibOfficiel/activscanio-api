import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix season numbers to use 4-week blocks from app start (week 7)
 * instead of ISO-week-aligned seasons.
 *
 * Before: season 2 = weeks 5-8, season 3 = weeks 9-12
 * After:  season 1 = weeks 7-10 (all current data)
 */
export class FixSeasonNumbersFromAppStart1773000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Betting weeks: remap to season 1 + fix seasonWeekNumber
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 1, "seasonWeekNumber" = 0 WHERE "weekNumber" = 7 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 1, "seasonWeekNumber" = 1 WHERE "weekNumber" = 8 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 1, "seasonWeekNumber" = 2 WHERE "weekNumber" = 9 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 1, "seasonWeekNumber" = 3 WHERE "weekNumber" = 10 AND year = 2026`,
    );

    // 2. Bettor rankings: season 2 → season 1
    await queryRunner.query(
      `UPDATE bettor_rankings SET "seasonNumber" = 1 WHERE "seasonNumber" = 2 AND year = 2026`,
    );

    // 3. Competitor monthly stats: season 2 → season 1
    await queryRunner.query(
      `UPDATE competitor_monthly_stats SET "seasonNumber" = 1 WHERE "seasonNumber" = 2 AND year = 2026`,
    );

    // 4. Delete existing season archive (will be recreated at end of season 1)
    await queryRunner.query(
      `DELETE FROM archived_competitor_rankings WHERE "seasonArchiveId" IN (
        SELECT id FROM season_archives WHERE "seasonNumber" = 2 AND year = 2026
      )`,
    );
    await queryRunner.query(
      `DELETE FROM season_archives WHERE "seasonNumber" = 2 AND year = 2026`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: remap season 1 back to old seasons 2 and 3
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 2, "seasonWeekNumber" = 0 WHERE "weekNumber" = 7 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 2, "seasonWeekNumber" = 1 WHERE "weekNumber" = 8 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 3, "seasonWeekNumber" = 2 WHERE "weekNumber" = 9 AND year = 2026`,
    );
    await queryRunner.query(
      `UPDATE betting_weeks SET "seasonNumber" = 3, "seasonWeekNumber" = 3 WHERE "weekNumber" = 10 AND year = 2026`,
    );

    // Revert bettor rankings
    await queryRunner.query(
      `UPDATE bettor_rankings SET "seasonNumber" = 2 WHERE "seasonNumber" = 1 AND year = 2026`,
    );

    // Revert competitor monthly stats
    await queryRunner.query(
      `UPDATE competitor_monthly_stats SET "seasonNumber" = 2 WHERE "seasonNumber" = 1 AND year = 2026`,
    );
  }
}
