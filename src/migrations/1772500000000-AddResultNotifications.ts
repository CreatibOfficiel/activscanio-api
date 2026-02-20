import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResultNotifications1772500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bet: tracking "vu"
    await queryRunner.query(
      `ALTER TABLE "bets" ADD COLUMN "resultSeenAt" TIMESTAMPTZ NULL`,
    );

    // UserStreak: tracking perte de streak betting
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD COLUMN "bettingStreakLostValue" INT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD COLUMN "bettingStreakLostAt" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD COLUMN "bettingStreakLossSeenAt" TIMESTAMPTZ NULL`,
    );

    // Competitor: tracking perte de play streak
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "playStreakLostValue" INT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "playStreakLostAt" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "playStreakLossSeenAt" TIMESTAMPTZ NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "playStreakLossSeenAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "playStreakLostAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "playStreakLostValue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "bettingStreakLossSeenAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "bettingStreakLostAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "bettingStreakLostValue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bets" DROP COLUMN "resultSeenAt"`,
    );
  }
}
