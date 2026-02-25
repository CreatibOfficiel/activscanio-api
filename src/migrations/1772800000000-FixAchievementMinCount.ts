import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAchievementMinCount1772800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // Part 1: Update achievement conditions in DB with minCount
    // ============================================================

    // sharpshooter & expert_bettor: require 20+ bets
    await queryRunner.query(`
      UPDATE achievements
      SET condition = condition || '{"minCount": {"metric": "betsPlaced", "value": 20}}'::jsonb
      WHERE key IN ('sharpshooter', 'expert_bettor')
    `);

    // podium_avg: require 12+ races
    await queryRunner.query(`
      UPDATE achievements
      SET condition = condition || '{"minCount": {"metric": "competitorRaceCount", "value": 12}}'::jsonb
      WHERE key = 'podium_avg'
    `);

    // top_ten, podium_finish, monthly_champion: require 3+ bets
    await queryRunner.query(`
      UPDATE achievements
      SET condition = condition || '{"minCount": {"metric": "betsPlaced", "value": 3}}'::jsonb
      WHERE key IN ('top_ten', 'podium_finish', 'monthly_champion')
    `);

    // ============================================================
    // Part 2: Delete undeserved user_achievements + clean up XP
    // ============================================================

    // Step 1: Capture user_achievements to delete (for XP rollback)
    // We store them in a temp table so we can find matching xp_history entries
    await queryRunner.query(`
      CREATE TEMP TABLE revoked_achievements AS
      SELECT ua.id AS user_achievement_id,
             ua."userId",
             ua."unlockedAt",
             a.key AS achievement_key,
             a.rarity
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua."achievementId"
      WHERE FALSE
    `);

    // sharpshooter/expert_bettor: users with < 20 finalized bets
    await queryRunner.query(`
      INSERT INTO revoked_achievements
      SELECT ua.id, ua."userId", ua."unlockedAt", a.key, a.rarity
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua."achievementId"
      WHERE a.key IN ('sharpshooter', 'expert_bettor')
        AND (SELECT COUNT(*) FROM bets b WHERE b."userId" = ua."userId" AND b."isFinalized" = true) < 20
    `);

    // podium_avg: competitors with < 12 races OR avgRank12 > 3 OR avgRank12 = 0
    await queryRunner.query(`
      INSERT INTO revoked_achievements
      SELECT ua.id, ua."userId", ua."unlockedAt", a.key, a.rarity
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua."achievementId"
      JOIN users u ON u.id = ua."userId"
      LEFT JOIN competitors c ON c.id = u."competitorId"
      WHERE a.key = 'podium_avg'
        AND (c.id IS NULL OR c."raceCount" < 12 OR c."avgRank12" > 3 OR c."avgRank12" = 0)
    `);

    // top_ten/podium_finish/monthly_champion: users with < 3 finalized bets
    await queryRunner.query(`
      INSERT INTO revoked_achievements
      SELECT ua.id, ua."userId", ua."unlockedAt", a.key, a.rarity
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua."achievementId"
      WHERE a.key IN ('top_ten', 'podium_finish', 'monthly_champion')
        AND (SELECT COUNT(*) FROM bets b WHERE b."userId" = ua."userId" AND b."isFinalized" = true) < 3
    `);

    // Step 2: Delete matching xp_history entries
    // Match by userId + ACHIEVEMENT source matching rarity + earnedAt within 2 seconds of unlockedAt
    await queryRunner.query(`
      DELETE FROM xp_history xh
      USING revoked_achievements ra
      WHERE xh."userId" = ra."userId"
        AND xh.source = 'ACHIEVEMENT_' || ra.rarity
        AND ABS(EXTRACT(EPOCH FROM (xh."earnedAt" - ra."unlockedAt"))) < 2
    `);

    // Also delete any LEVEL_UP_BONUS that might have been triggered by achievement XP
    // (We'll just recalculate levels from remaining XP, so this is handled below)

    // Step 3: Delete the user_achievements
    await queryRunner.query(`
      DELETE FROM user_achievements
      WHERE id IN (SELECT user_achievement_id FROM revoked_achievements)
    `);

    // Step 4: Decrement achievementCount for affected users
    await queryRunner.query(`
      UPDATE users u
      SET "achievementCount" = GREATEST(0, u."achievementCount" - sub.revoked_count)
      FROM (
        SELECT "userId", COUNT(*) AS revoked_count
        FROM revoked_achievements
        GROUP BY "userId"
      ) sub
      WHERE u.id = sub."userId"
    `);

    // Step 5: Recalculate XP from remaining xp_history for affected users
    await queryRunner.query(`
      UPDATE users u
      SET xp = COALESCE(sub.total_xp, 0)
      FROM (
        SELECT xh."userId", SUM(xh."xpAmount") AS total_xp
        FROM xp_history xh
        WHERE xh."userId" IN (SELECT DISTINCT "userId" FROM revoked_achievements)
        GROUP BY xh."userId"
      ) sub
      WHERE u.id = sub."userId"
    `);

    // Handle users with zero remaining xp_history
    await queryRunner.query(`
      UPDATE users
      SET xp = 0
      WHERE id IN (SELECT DISTINCT "userId" FROM revoked_achievements)
        AND id NOT IN (SELECT DISTINCT "userId" FROM xp_history)
    `);

    // Step 6: Recalculate levels from XP for affected users
    // Formula: level N requires 100 * N * (N+1) / 2 total XP
    // Find highest N where 100 * N * (N+1) / 2 <= xp
    await queryRunner.query(`
      UPDATE users
      SET level = GREATEST(1, (
        SELECT COALESCE(
          (SELECT MAX(n) FROM generate_series(1, 100) n
           WHERE 100 * n * (n + 1) / 2 <= users.xp),
          1
        )
      ))
      WHERE id IN (SELECT DISTINCT "userId" FROM revoked_achievements)
    `);

    // Clean up temp table
    await queryRunner.query(`DROP TABLE IF EXISTS revoked_achievements`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove minCount from achievement conditions
    await queryRunner.query(`
      UPDATE achievements
      SET condition = condition - 'minCount'
      WHERE key IN ('sharpshooter', 'expert_bettor', 'podium_avg', 'top_ten', 'podium_finish', 'monthly_champion')
    `);

    // Note: Deleted user_achievements and XP history cannot be restored automatically.
    // A manual restore from backup would be needed if rollback is required.
  }
}
