import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index préventif sur les colonnes de lecture des courses.
 *
 * Rien à gagner aujourd'hui : au volume actuel (486 courses, 1818
 * race_results, 35 compétiteurs) Postgres fait un seq scan en moins d'une
 * milliseconde et continuera de le préférer. Ces index servent quand la
 * table aura grossi.
 *
 * Trois manques réels :
 * - `race_results."raceId"` n'a aucun index alors qu'une FK ON DELETE
 *   CASCADE pointe dessus. Chaque suppression de course scanne la table.
 * - `races."date"` est la colonne de tri de tous les listings.
 * - `("competitorId", "raceId")` couvre les jointures par compétiteur.
 *
 * Pas de CONCURRENTLY : `migration:run` tourne ici en mode transaction
 * "all" (aucun `migrationsTransactionMode` n'est défini dans data-source.ts
 * ni data-source.prod.js), et TypeORM refuse toute migration qui surcharge
 * `transaction` dans ce mode (ForbiddenTransactionModeOverrideError). À
 * cette taille de table un CREATE INDEX classique prend quelques
 * millisecondes, donc le verrou est sans effet pratique.
 *
 * Note : IDX_race_results_competitor_race rend IDX_race_results_competitorId
 * (créé par 1770600000000-AddMissingIndexes) redondant, son préfixe étant
 * identique. L'ancien index est laissé en place, sa suppression est une
 * décision séparée.
 */
export class AddRaceQueryIndexes1774000000000 implements MigrationInterface {
  name = 'AddRaceQueryIndexes1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_race_results_raceId"
      ON "race_results" ("raceId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_races_date_id_desc"
      ON "races" ("date" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_race_results_competitor_race"
      ON "race_results" ("competitorId", "raceId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_race_results_competitor_race"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_races_date_id_desc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_race_results_raceId"`);
  }
}
