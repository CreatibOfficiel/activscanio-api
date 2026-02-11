import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStreakWarningTracking1771400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD COLUMN "lastBettingWarningWeek" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" ADD COLUMN "lastBettingWarningYear" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "lastPlayStreakWarningDate" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "lastPlayStreakWarningDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "lastBettingWarningYear"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_streaks" DROP COLUMN "lastBettingWarningWeek"`,
    );
  }
}
