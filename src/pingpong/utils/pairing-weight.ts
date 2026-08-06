/**
 * What a match counts for. Always 1.
 *
 * THERE USED TO BE AN ANTI-FARMING RULE HERE, and someone will eventually ask
 * where it went. It weighted a match by how often that pair had already met
 * inside the ISO week: full weight for the first three, half for the next
 * three, nothing from the seventh. It is gone, for three reasons.
 *
 * 1. There was no exploit to defend against. In Elo and Glicko a pair's repeat
 *    play is self-correcting. As the favourite's rating rises, their expected
 *    score against that same opponent approaches 1, so the gain per win
 *    approaches zero on its own — while an upset loss stays expensive. Farming
 *    one opponent converges to earning nothing, without any rule saying so.
 * 2. It was discarding ordinary play. At roughly four matches a week across
 *    eight people, the same two colleagues playing four times in a week is
 *    normal behaviour, not manipulation — and the fourth match was being
 *    halved, the seventh thrown away entirely.
 * 3. The premise was never checked. No documented case of farming in an office
 *    league was found. The sandbagging literature that does exist is driven by
 *    prize money in rating-bracketed tournaments. Neither exists here.
 *
 * The `appliedWeight`, `pairKey`, `isoYear` and `isoWeek` columns survive on
 * `pingpong_matches`. They record what happened under the old rule, and
 * deleting them would destroy that evidence. New and recomputed rows carry
 * weight 1.
 */
export const MATCH_WEIGHT = 1;

/**
 * Canonical pair identifier, `min(id):max(id)`, so a pair reads the same
 * whichever side each player took.
 *
 * No longer feeds a weight — it now only populates the `pairKey` column, which
 * head-to-head lookups and the historical record still use.
 */
export function buildPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}
