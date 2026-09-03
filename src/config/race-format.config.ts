/**
 * The Mario Kart 8 Deluxe race format, in one place.
 *
 * These numbers were previously repeated as literals across the OpenAI prompt,
 * the analysis service, the seeder and a dozen display strings. They are game
 * rules, not application choices: Nintendo owns them, and they move. The
 * September 2026 Switch 2 update (4.0.0) raised local split-screen from 4 to 8
 * players without touching anything else, which is exactly the kind of change
 * this file exists to absorb.
 *
 * The frontend keeps its own mirror in
 * `mushroom-bet-app/src/app/config/race-format.ts` — the two are not shared at
 * build time and must be edited together.
 */

/** Total finishers on the results screen, humans and CPUs alike. */
export const MAX_RANK = 12;

/** Lowest score a finisher can be credited with on the cup results screen. */
export const MIN_SCORE = 0;

/** Highest reachable cup score: 4 races at 15 points. */
export const MAX_SCORE = 60;

/**
 * A flawless cup — first place in all four races.
 *
 * Tracked as its own constant because it means something (a celebration image,
 * a season highlight), not merely "the top of the range". Should Nintendo
 * change the number of races per cup, this and MAX_SCORE move together but for
 * different reasons.
 */
export const PERFECT_SCORE = 60;

/** A race worth recording needs at least two humans to compare. */
export const MIN_HUMAN_PLAYERS = 2;

/**
 * Humans on a single console.
 *
 * Four until the 4.0.0 update of September 2026, which added 5-8 player
 * split-screen on Switch 2. The image recognition truncates to this number, so
 * setting it too low silently drops real players from a race.
 */
export const MAX_HUMAN_PLAYERS = 8;
