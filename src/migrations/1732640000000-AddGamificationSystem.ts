import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamificationSystem1732640000000 implements MigrationInterface {
    name = 'AddGamificationSystem1732640000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ====================
        // 1. CREATE ACHIEVEMENTS TABLE
        // ====================
        await queryRunner.query(`
            CREATE TABLE "achievements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "key" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text NOT NULL,
                "category" character varying NOT NULL,
                "rarity" character varying NOT NULL,
                "icon" character varying NOT NULL,
                "xpReward" integer NOT NULL DEFAULT 0,
                "unlocksTitle" character varying,
                "condition" jsonb NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_achievements" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_achievements_key" UNIQUE ("key")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_achievements_category" ON "achievements" ("category")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_achievements_rarity" ON "achievements" ("rarity")
        `);

        // ====================
        // 2. CREATE USER_ACHIEVEMENTS TABLE
        // ====================
        await queryRunner.query(`
            CREATE TABLE "user_achievements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "achievementId" uuid NOT NULL,
                "unlockedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "progress" jsonb,
                "notificationSent" boolean DEFAULT false,
                CONSTRAINT "PK_user_achievements" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_user_achievement" UNIQUE ("userId", "achievementId")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_user_achievements_user" ON "user_achievements" ("userId")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_user_achievements_unlocked" ON "user_achievements" ("unlockedAt")
        `);

        // Add foreign keys for user_achievements
        await queryRunner.query(`
            ALTER TABLE "user_achievements"
            ADD CONSTRAINT "FK_user_achievements_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "user_achievements"
            ADD CONSTRAINT "FK_user_achievements_achievement"
            FOREIGN KEY ("achievementId") REFERENCES "achievements"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // ====================
        // 3. CREATE USER_STREAKS TABLE
        // ====================
        await queryRunner.query(`
            CREATE TABLE "user_streaks" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "currentMonthlyStreak" integer NOT NULL DEFAULT 0,
                "lastBetWeekNumber" integer,
                "lastBetYear" integer,
                "monthlyStreakStartedAt" TIMESTAMP WITH TIME ZONE,
                "longestLifetimeStreak" integer NOT NULL DEFAULT 0,
                "currentLifetimeStreak" integer NOT NULL DEFAULT 0,
                "lifetimeStreakStartedAt" TIMESTAMP WITH TIME ZONE,
                "totalWeeksParticipated" integer NOT NULL DEFAULT 0,
                "lastUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_streaks" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_user_streaks_user" UNIQUE ("userId")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_user_streaks_monthly" ON "user_streaks" ("currentMonthlyStreak")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_user_streaks_lifetime" ON "user_streaks" ("longestLifetimeStreak")
        `);

        // Add foreign key for user_streaks
        await queryRunner.query(`
            ALTER TABLE "user_streaks"
            ADD CONSTRAINT "FK_user_streaks_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // ====================
        // 4. ADD COLUMNS TO USERS TABLE
        // ====================
        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "xp" integer NOT NULL DEFAULT 0
        `);

        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "level" integer NOT NULL DEFAULT 1
        `);

        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "currentTitle" character varying
        `);

        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "achievementCount" integer NOT NULL DEFAULT 0
        `);

        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN "lastAchievementUnlockedAt" TIMESTAMP WITH TIME ZONE
        `);

        // Indexes for users gamification columns
        await queryRunner.query(`
            CREATE INDEX "IDX_users_level" ON "users" ("level")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_users_xp" ON "users" ("xp")
        `);

        // ====================
        // 5. ADD COLUMNS TO BETTOR_RANKINGS TABLE
        // ====================
        await queryRunner.query(`
            ALTER TABLE "bettor_rankings" ADD COLUMN "weeklyParticipationStreak" integer NOT NULL DEFAULT 0
        `);

        await queryRunner.query(`
            ALTER TABLE "bettor_rankings" ADD COLUMN "perfectBetStreak" integer NOT NULL DEFAULT 0
        `);

        await queryRunner.query(`
            ALTER TABLE "bettor_rankings" ADD COLUMN "consecutivePerfectBets" integer NOT NULL DEFAULT 0
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_bettor_rankings_streaks" ON "bettor_rankings" ("weeklyParticipationStreak")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ====================
        // REVERSE ORDER: Remove indexes and foreign keys first
        // ====================

        // Remove columns and index from bettor_rankings
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_bettor_rankings_streaks"`);
        await queryRunner.query(`ALTER TABLE "bettor_rankings" DROP COLUMN "consecutivePerfectBets"`);
        await queryRunner.query(`ALTER TABLE "bettor_rankings" DROP COLUMN "perfectBetStreak"`);
        await queryRunner.query(`ALTER TABLE "bettor_rankings" DROP COLUMN "weeklyParticipationStreak"`);

        // Remove indexes and columns from users
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_xp"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_level"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastAchievementUnlockedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "achievementCount"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "currentTitle"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "level"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "xp"`);

        // Drop user_streaks table (with foreign key)
        await queryRunner.query(`ALTER TABLE "user_streaks" DROP CONSTRAINT IF EXISTS "FK_user_streaks_user"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_user_streaks_lifetime"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_user_streaks_monthly"`);
        await queryRunner.query(`DROP TABLE "user_streaks"`);

        // Drop user_achievements table (with foreign keys)
        await queryRunner.query(`ALTER TABLE "user_achievements" DROP CONSTRAINT IF EXISTS "FK_user_achievements_achievement"`);
        await queryRunner.query(`ALTER TABLE "user_achievements" DROP CONSTRAINT IF EXISTS "FK_user_achievements_user"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_user_achievements_unlocked"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_user_achievements_user"`);
        await queryRunner.query(`DROP TABLE "user_achievements"`);

        // Drop achievements table
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_achievements_rarity"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_achievements_category"`);
        await queryRunner.query(`DROP TABLE "achievements"`);
    }
}
