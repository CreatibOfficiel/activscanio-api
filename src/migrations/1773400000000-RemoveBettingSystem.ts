import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove the betting system: bets, odds, betting weeks, bettor rankings,
 * duels and live bets.
 *
 * DESTRUCTIVE AND IRREVERSIBLE. Eight tables are dropped, every BETTING
 * achievement is purged, and user_streaks is truncated. Take a full dump
 * before running this.
 *
 * Deliberately preserved:
 * - users.xp, users.level and xp_history, including rows sourced from betting.
 *   XP is a progression currency, not a bet record; clawing it back would cost
 *   users levels and titles they already earned.
 * - competitor_monthly_stats, season_archives and archived_competitor_rankings,
 *   which carry Mario Kart history.
 *
 * user_streaks survives, emptied and renamed: the weekly participation streak
 * it tracks is not a betting concept, and the ping-pong module reuses it.
 */
export class RemoveBettingSystem1773400000000 implements MigrationInterface {
  name = 'RemoveBettingSystem1773400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Purge BETTING achievements while the rows are still reachable, then
    //    recompute achievementCount from scratch rather than decrementing.
    await queryRunner.query(`
      DELETE FROM "user_achievements" ua
      USING "achievements" a
      WHERE ua."achievementId" = a.id AND a.domain = 'BETTING'
    `);

    await queryRunner.query(`
      DELETE FROM "achievements" WHERE domain = 'BETTING'
    `);

    await queryRunner.query(`
      UPDATE "users" u
      SET "achievementCount" = COALESCE(sub.cnt, 0)
      FROM (
        SELECT "userId", COUNT(*)::int AS cnt
        FROM "user_achievements"
        GROUP BY "userId"
      ) sub
      WHERE u.id = sub."userId"
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "achievementCount" = 0
      WHERE id NOT IN (SELECT DISTINCT "userId" FROM "user_achievements")
    `);

    // 2. Drop foreign keys and columns on tables that survive, before their
    //    targets disappear.
    await queryRunner.query(
      `ALTER TABLE "races" DROP CONSTRAINT IF EXISTS "FK_f93b8a35afbdb9a970d3beb321d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "races" DROP COLUMN IF EXISTS "bettingWeekId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "season_archives" DROP COLUMN IF EXISTS "totalBets"`,
    );
    await queryRunner.query(
      `ALTER TABLE "season_archives" DROP COLUMN IF EXISTS "totalBettors"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastBoostUsedMonth"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastBoostUsedYear"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastBoostUsedSeason"`,
    );

    // 3. Drop the betting tables, children before parents.
    await queryRunner.query(`DROP TABLE IF EXISTS "bet_picks" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "competitor_odds" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bettor_rankings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_user_stats" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "live_bets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "duels" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "betting_weeks" CASCADE`);

    // 4. Drop the enum types those tables owned.
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."duel_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."duel_status_enum_v2"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."duel_stake_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."duel_condition_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."betting_weeks_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bets_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bet_picks_position_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."live_bets_status_enum"`,
    );

    // 5. Empty and rename user_streaks. The counters restart from zero for the
    //    new era; the column names lose their betting vocabulary.
    await queryRunner.query(`TRUNCATE TABLE "user_streaks"`);

    const streakRenames: [string, string][] = [
      ['lastBetWeekNumber', 'lastParticipationWeekNumber'],
      ['lastBetYear', 'lastParticipationYear'],
      ['lastBettingWarningWeek', 'lastParticipationWarningWeek'],
      ['lastBettingWarningYear', 'lastParticipationWarningYear'],
      ['bettingStreakLostValue', 'participationStreakLostValue'],
      ['bettingStreakLostAt', 'participationStreakLostAt'],
      ['bettingStreakLossSeenAt', 'participationStreakLossSeenAt'],
    ];

    for (const [from, to] of streakRenames) {
      await queryRunner.query(
        `ALTER TABLE "user_streaks" RENAME COLUMN "${from}" TO "${to}"`,
      );
    }

    // 6. Drop the betting category from notification preferences. The key is
    //    reused by the participation-streak warnings, so it stays — only the
    //    label changed, on the front end.
  }

  // `async` is required by MigrationInterface even though this only throws.
  // eslint-disable-next-line @typescript-eslint/require-await
  public async down(): Promise<void> {
    throw new Error(
      'RemoveBettingSystem is irreversible: eight tables were dropped and the ' +
        'BETTING achievements purged. Restore from the pre-migration dump.',
    );
  }
}
