import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingDeltaToRaceResults1772000000000
  implements MigrationInterface
{
  name = 'AddRatingDeltaToRaceResults1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "race_results" ADD "ratingDelta" float`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "race_results" DROP COLUMN "ratingDelta"`,
    );
  }
}
