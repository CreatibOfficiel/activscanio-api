import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPreferences1764011759735
  implements MigrationInterface
{
  name = 'AddNotificationPreferences1764011759735';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification_preferences table
    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "enablePush" boolean NOT NULL DEFAULT false,
        "enableInApp" boolean NOT NULL DEFAULT true,
        "categories" jsonb NOT NULL DEFAULT '{"betting": true, "achievements": true, "rankings": true, "races": true, "special": true}'::jsonb,
        "pushSubscription" jsonb NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_preferences_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id")
      )
    `);

    // Create index on userId for faster lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_preferences_userId"
      ON "notification_preferences" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notification_preferences_userId"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "notification_preferences"
    `);
  }
}
