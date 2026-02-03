import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBogFieldsToBetPicks1770500000000 implements MigrationInterface {
  name = 'AddBogFieldsToBetPicks1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add finalOdd column (the odd at finalization time)
    await queryRunner.query(`
      ALTER TABLE "bet_picks"
      ADD COLUMN "finalOdd" float
    `);

    // Add usedBogOdd column (true if final odd was better)
    await queryRunner.query(`
      ALTER TABLE "bet_picks"
      ADD COLUMN "usedBogOdd" boolean DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bet_picks"
      DROP COLUMN "usedBogOdd"
    `);

    await queryRunner.query(`
      ALTER TABLE "bet_picks"
      DROP COLUMN "finalOdd"
    `);
  }
}
