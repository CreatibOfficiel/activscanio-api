import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerLifecycle1787500000000 implements MigrationInterface {
  name = 'AddPlayerLifecycle1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "isAdmin" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "notification_preferences" ADD "showAlumniReminders" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "competitors" ADD "leftAt" date`);
    await queryRunner.query(`ALTER TABLE "competitors" ADD "keepAnniversaryReminder" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "competitors" ADD "contactUrl" character varying(2048)`);
    await queryRunner.query(`CREATE INDEX "IDX_competitors_leftAt" ON "competitors" ("leftAt")`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "competitorFirstName" character varying`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "competitorLastName" character varying`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "characterVariantIdAtRace" uuid`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "characterNameAtRace" character varying`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "characterVariantLabelAtRace" character varying`);
    await queryRunner.query(`ALTER TABLE "race_results" ADD "characterImageUrlAtRace" character varying`);
    await queryRunner.query(`
      UPDATE "race_results" rr SET
        "competitorFirstName" = c."firstName",
        "competitorLastName" = c."lastName",
        "characterVariantIdAtRace" = cv.id,
        "characterNameAtRace" = bc.name,
        "characterVariantLabelAtRace" = cv.label,
        "characterImageUrlAtRace" = cv."imageUrl"
      FROM "competitors" c
      LEFT JOIN "character_variants" cv ON cv."competitorId" = c.id
      LEFT JOIN "base_characters" bc ON bc.id = cv."baseCharacterId"
      WHERE rr."competitorId" = c.id
    `);
    await queryRunner.query(`
      CREATE TABLE "alumni_reminder_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "alumniId" uuid NOT NULL,
        "anniversaryYear" integer NOT NULL,
        "deliveredOn" date NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alumni_reminder_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_alumni_reminder_user_alumni_year" UNIQUE ("userId", "alumniId", "anniversaryYear"),
        CONSTRAINT "FK_alumni_reminder_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_alumni_reminder_alumni" FOREIGN KEY ("alumniId") REFERENCES "competitors"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_alumni_reminder_user_day" ON "alumni_reminder_deliveries" ("userId", "deliveredOn")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_alumni_reminder_user_day"`);
    await queryRunner.query(`DROP TABLE "alumni_reminder_deliveries"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "characterImageUrlAtRace"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "characterVariantLabelAtRace"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "characterNameAtRace"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "characterVariantIdAtRace"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "competitorLastName"`);
    await queryRunner.query(`ALTER TABLE "race_results" DROP COLUMN "competitorFirstName"`);
    await queryRunner.query(`DROP INDEX "IDX_competitors_leftAt"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "contactUrl"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "keepAnniversaryReminder"`);
    await queryRunner.query(`ALTER TABLE "competitors" DROP COLUMN "leftAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isAdmin"`);
    await queryRunner.query(`ALTER TABLE "notification_preferences" DROP COLUMN "showAlumniReminders"`);
  }
}
