import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retire `pingpong_players.previousWeekRank`.
 *
 * The column was written by a weekly cron and read by nobody: the
 * leaderboard row has always read `previousDayRank`, the same name the
 * Mario Kart side uses. So the movement arrow could never appear — the
 * column being filled was not the column being read, and the column being
 * read was filled by nothing at all.
 *
 * Resolved towards `previousDayRank`, and the snapshot moved to a daily
 * cron. The movement rule it feeds only shows an arrow to a player active
 * within two days, which requires a comparison rank captured at the start
 * of the day; a weekly capture would compare a Sunday match against a rank
 * frozen the previous Monday.
 *
 * `previousDayRank` already exists on this table — it was created by
 * CreatePingpong and never populated — so there is nothing to add here.
 */
export class DropPingpongWeeklyRank1773900000000 implements MigrationInterface {
  name = 'DropPingpongWeeklyRank1773900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" DROP COLUMN IF EXISTS "previousWeekRank"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restored empty. The values it held were a weekly cadence that no
    // longer matches the movement rule, so back-filling them would be
    // restoring numbers the leaderboard would read wrong.
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" ADD COLUMN IF NOT EXISTS "previousWeekRank" integer`,
    );
  }
}
