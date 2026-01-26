import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBetStatusColumn1764360000000 implements MigrationInterface {
  name = 'AddBetStatusColumn1764360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the enum type
    await queryRunner.query(`
      CREATE TYPE "bet_status_enum" AS ENUM ('pending', 'won', 'lost', 'cancelled')
    `);

    // Add the status column with default 'pending'
    await queryRunner.query(`
      ALTER TABLE "bets"
      ADD COLUMN "status" "bet_status_enum" NOT NULL DEFAULT 'pending'
    `);

    // Update existing bets based on isFinalized and pointsEarned
    // If finalized and has points > 0 => won
    // If finalized and points = 0 or null => lost
    // If not finalized => pending (already default)
    await queryRunner.query(`
      UPDATE "bets"
      SET "status" = 'won'
      WHERE "isFinalized" = true AND "pointsEarned" > 0
    `);

    await queryRunner.query(`
      UPDATE "bets"
      SET "status" = 'lost'
      WHERE "isFinalized" = true AND ("pointsEarned" = 0 OR "pointsEarned" IS NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the status column
    await queryRunner.query(`
      ALTER TABLE "bets"
      DROP COLUMN "status"
    `);

    // Drop the enum type
    await queryRunner.query(`
      DROP TYPE "bet_status_enum"
    `);
  }
}
