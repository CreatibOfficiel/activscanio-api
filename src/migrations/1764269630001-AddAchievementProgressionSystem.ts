import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAchievementProgressionSystem1764269630001
  implements MigrationInterface
{
  name = 'AddAchievementProgressionSystem1764269630001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ====================
    // 1. ADD NEW COLUMNS TO ACHIEVEMENTS TABLE
    // ====================
    await queryRunner.query(`
            ALTER TABLE "achievements"
            ADD COLUMN "prerequisiteAchievementKey" character varying,
            ADD COLUMN "isTemporary" boolean DEFAULT false,
            ADD COLUMN "canBeLost" boolean DEFAULT false,
            ADD COLUMN "tierLevel" integer DEFAULT 0,
            ADD COLUMN "chainName" character varying
        `);

    // ====================
    // 2. ADD NEW COLUMNS TO USER_ACHIEVEMENTS TABLE
    // ====================
    await queryRunner.query(`
            ALTER TABLE "user_achievements"
            ADD COLUMN "revokedAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "revocationReason" character varying,
            ADD COLUMN "timesEarned" integer DEFAULT 0
        `);

    // ====================
    // 3. CREATE XP_HISTORY TABLE
    // ====================
    await queryRunner.query(`
            CREATE TABLE "xp_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "xpAmount" integer NOT NULL,
                "source" character varying NOT NULL,
                "relatedEntityId" character varying,
                "description" text,
                "earnedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_xp_history" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_xp_history_user" ON "xp_history" ("userId")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_xp_history_earned" ON "xp_history" ("earnedAt")
        `);

    // Add foreign key for xp_history
    await queryRunner.query(`
            ALTER TABLE "xp_history"
            ADD CONSTRAINT "FK_xp_history_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

    // ====================
    // 4. CREATE LEVEL_REWARDS TABLE
    // ====================
    await queryRunner.query(`
            CREATE TABLE "level_rewards" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "level" integer NOT NULL,
                "rewardType" character varying NOT NULL,
                "rewardData" jsonb NOT NULL,
                "description" text NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_level_rewards" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_level_rewards_level" UNIQUE ("level")
            )
        `);

    // ====================
    // 5. CREATE DAILY_USER_STATS TABLE
    // ====================
    await queryRunner.query(`
            CREATE TABLE "daily_user_stats" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "date" date NOT NULL,
                "betsPlaced" integer DEFAULT 0,
                "betsWon" integer DEFAULT 0,
                "pointsEarned" double precision DEFAULT 0,
                "xpEarned" integer DEFAULT 0,
                "achievementsUnlocked" integer DEFAULT 0,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_daily_user_stats" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_daily_user_stats" UNIQUE ("userId", "date")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_daily_user_stats_user" ON "daily_user_stats" ("userId")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_daily_user_stats_date" ON "daily_user_stats" ("date")
        `);

    // Add foreign key for daily_user_stats
    await queryRunner.query(`
            ALTER TABLE "daily_user_stats"
            ADD CONSTRAINT "FK_daily_user_stats_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop daily_user_stats table
    await queryRunner.query(
      `ALTER TABLE "daily_user_stats" DROP CONSTRAINT "FK_daily_user_stats_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_daily_user_stats_date"`);
    await queryRunner.query(`DROP INDEX "IDX_daily_user_stats_user"`);
    await queryRunner.query(`DROP TABLE "daily_user_stats"`);

    // Drop level_rewards table
    await queryRunner.query(`DROP TABLE "level_rewards"`);

    // Drop xp_history table
    await queryRunner.query(
      `ALTER TABLE "xp_history" DROP CONSTRAINT "FK_xp_history_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_xp_history_earned"`);
    await queryRunner.query(`DROP INDEX "IDX_xp_history_user"`);
    await queryRunner.query(`DROP TABLE "xp_history"`);

    // Remove columns from user_achievements
    await queryRunner.query(`
            ALTER TABLE "user_achievements"
            DROP COLUMN "timesEarned",
            DROP COLUMN "revocationReason",
            DROP COLUMN "revokedAt"
        `);

    // Remove columns from achievements
    await queryRunner.query(`
            ALTER TABLE "achievements"
            DROP COLUMN "chainName",
            DROP COLUMN "tierLevel",
            DROP COLUMN "canBeLost",
            DROP COLUMN "isTemporary",
            DROP COLUMN "prerequisiteAchievementKey"
        `);
  }
}
