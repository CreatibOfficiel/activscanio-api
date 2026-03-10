import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayStreakMissedDays1773200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" ADD COLUMN "playStreakMissedDays" TEXT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "competitors" DROP COLUMN "playStreakMissedDays"`,
    );
  }
}
