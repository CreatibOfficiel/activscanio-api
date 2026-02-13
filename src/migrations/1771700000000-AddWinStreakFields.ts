import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWinStreakFields1771700000000 implements MigrationInterface {
  name = 'AddWinStreakFields1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A1: Add win streak columns to user_streaks
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD "currentWinStreak" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD "bestWinStreak" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD "lastWinWeekNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD "lastWinYear" integer`,
    );

    // Index on bestWinStreak DESC for leaderboard queries
    await queryRunner.query(
      `CREATE INDEX "IDX_user_streaks_bestWinStreak" ON "user_streaks" ("bestWinStreak" DESC)`,
    );

    // B1: Add bestWinStreak to competitors
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD "bestWinStreak" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // B1: Remove bestWinStreak from competitors
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "bestWinStreak"`,
    );

    // A1: Remove win streak columns from user_streaks
    await queryRunner.query(
      `DROP INDEX "IDX_user_streaks_bestWinStreak"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "lastWinYear"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "lastWinWeekNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "bestWinStreak"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "currentWinStreak"`,
    );
  }
}
