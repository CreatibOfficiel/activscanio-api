import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give ping-pong the season reset Mario Kart already had.
 *
 * Until now the season transition archived ping-pong and then left every
 * rating, deviation and counter untouched, so each new season resumed exactly
 * where the last one ended. The archive rows still called that a season.
 *
 * `currentSeasonMatchCount` backfills to zero, which reads as "absent" for
 * everyone. That is the safe direction: the first reset after this migration
 * gives every existing player the deviation bump only, and nobody has their
 * rating squished on the strength of matches this column never saw.
 */
export class AddPingpongSeasonReset1787600000000 implements MigrationInterface {
  name = 'AddPingpongSeasonReset1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" ADD "currentSeasonMatchCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" ADD "lastSeasonResetAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" DROP COLUMN "lastSeasonResetAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pingpong_players" DROP COLUMN "currentSeasonMatchCount"`,
    );
  }
}
