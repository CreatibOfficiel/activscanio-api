import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Where each ping-pong player stood at the start of the week.
 *
 * Feeds the leaderboard's movement indicator. Weekly rather than daily
 * because in a ~25-player pool a daily delta is mostly sampling noise, and
 * rendering it as an up/down arrow presents that noise as signal.
 *
 * Nullable with no default: null means "held no rank when the week opened",
 * which is different from "was last". Defaulting to 0 would make a player's
 * first ranked week read as a leap from the bottom of the table.
 */
export class AddPingpongWeeklyRank1773800000000 implements MigrationInterface {
  name = 'AddPingpongWeeklyRank1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pingpong_players"
        ADD COLUMN IF NOT EXISTS "previousWeekRank" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pingpong_players"
        DROP COLUMN IF EXISTS "previousWeekRank"
    `);
  }
}
