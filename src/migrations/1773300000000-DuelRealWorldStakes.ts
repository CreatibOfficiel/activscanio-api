import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transform duels from points-based instant bets into real-world-stake
 * challenges with optional win conditions and photo-proof settlement.
 *
 * Additive migration: legacy `stake` (points) column is kept but made
 * nullable. The status enum is swapped (new type, ALTER COLUMN USING) to add
 * AWAITING_SETTLEMENT and SETTLED — Postgres forbids using a value added via
 * `ALTER TYPE ... ADD VALUE` within the same transaction, so we recreate the
 * type instead.
 */
export class DuelRealWorldStakes1773300000000 implements MigrationInterface {
  name = 'DuelRealWorldStakes1773300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Swap status enum to add awaiting_settlement + settled
    await queryRunner.query(
      `CREATE TYPE "public"."duel_status_enum_v2" AS ENUM('pending', 'accepted', 'resolved', 'awaiting_settlement', 'settled', 'cancelled', 'declined')`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" TYPE "public"."duel_status_enum_v2" USING "status"::text::"public"."duel_status_enum_v2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."duel_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."duel_status_enum_v2" RENAME TO "duel_status_enum"`,
    );

    // 2. New enum types for stake + condition
    await queryRunner.query(
      `CREATE TYPE "public"."duel_stake_type_enum" AS ENUM('beer', 'pint', 'mars', 'meal', 'custom')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."duel_condition_type_enum" AS ENUM('rank_wins', 'margin_greater', 'exact_tie', 'margin_between')`,
    );

    // 3. Legacy points stake becomes nullable
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "stake" DROP NOT NULL`,
    );

    // 4. Add new columns
    await queryRunner.query(`
      ALTER TABLE "duels"
        ADD COLUMN "stakeType" "public"."duel_stake_type_enum" NOT NULL DEFAULT 'beer',
        ADD COLUMN "stakeLabel" character varying,
        ADD COLUMN "stakeEmoji" character varying,
        ADD COLUMN "conditionType" "public"."duel_condition_type_enum",
        ADD COLUMN "conditionValue" integer,
        ADD COLUMN "targetBettingWeekId" uuid,
        ADD COLUMN "proofPhotoUrl" character varying,
        ADD COLUMN "proofUploadedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "settledAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "resolveDeadline" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "duels"
        DROP COLUMN "stakeType",
        DROP COLUMN "stakeLabel",
        DROP COLUMN "stakeEmoji",
        DROP COLUMN "conditionType",
        DROP COLUMN "conditionValue",
        DROP COLUMN "targetBettingWeekId",
        DROP COLUMN "proofPhotoUrl",
        DROP COLUMN "proofUploadedAt",
        DROP COLUMN "settledAt",
        DROP COLUMN "resolveDeadline"
    `);
    await queryRunner.query(`DROP TYPE "public"."duel_condition_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."duel_stake_type_enum"`);

    // Revert status enum (drops the two new values; rows using them must be cleared first)
    await queryRunner.query(
      `CREATE TYPE "public"."duel_status_enum_old" AS ENUM('pending', 'accepted', 'resolved', 'cancelled', 'declined')`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" TYPE "public"."duel_status_enum_old" USING "status"::text::"public"."duel_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."duel_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."duel_status_enum_old" RENAME TO "duel_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "duels" ALTER COLUMN "stake" SET NOT NULL`,
    );
  }
}
