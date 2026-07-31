import { ACHIEVEMENT_DEFINITIONS } from '../achievement-definitions';
import { AchievementDomain } from '../../entities/achievement.entity';

/**
 * Integrity of the achievement catalogue.
 *
 * This file is long and edited by hand, so the failure modes are clerical: a
 * duplicated key silently shadows an achievement, a prerequisite pointing at
 * nothing makes a chain unreachable, a metric typo makes a condition never
 * fire. None of those raise anything at runtime — they just quietly never
 * unlock.
 */
describe('ACHIEVEMENT_DEFINITIONS', () => {
  const pingpong = ACHIEVEMENT_DEFINITIONS.filter(
    (d) => d.domain === AchievementDomain.PINGPONG,
  );
  const racing = ACHIEVEMENT_DEFINITIONS.filter(
    (d) => d.domain === AchievementDomain.RACING,
  );

  it('has no duplicate keys', () => {
    const keys = ACHIEVEMENT_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every prerequisite at an achievement that exists', () => {
    const keys = new Set(ACHIEVEMENT_DEFINITIONS.map((d) => d.key));
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      if (definition.prerequisiteAchievementKey) {
        expect(keys).toContain(definition.prerequisiteAchievementKey);
      }
    }
  });

  it('keeps every prerequisite inside its own chain', () => {
    const byKey = new Map(ACHIEVEMENT_DEFINITIONS.map((d) => [d.key, d]));
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
      const prerequisiteKey = definition.prerequisiteAchievementKey;
      if (!prerequisiteKey) continue;
      const prerequisite = byKey.get(prerequisiteKey)!;
      expect(prerequisite.chainName).toBe(definition.chainName);
      expect(prerequisite.tierLevel).toBeLessThan(definition.tierLevel);
    }
  });

  it('leaves no BETTING achievement behind', () => {
    const domains = new Set(ACHIEVEMENT_DEFINITIONS.map((d) => d.domain));
    expect([...domains].sort()).toEqual(['PINGPONG', 'RACING']);
  });

  describe('ping-pong catalogue', () => {
    it('defines a meaningful number of achievements', () => {
      expect(pingpong.length).toBeGreaterThanOrEqual(8);
    });

    it('prefixes every key with pp_', () => {
      for (const definition of pingpong) {
        expect(definition.key).toMatch(/^pp_/);
      }
    });

    it('prefixes every metric with pingpong', () => {
      // The metric namespace is flat and global: an unprefixed metric would
      // answer for Mario Kart achievements too.
      for (const definition of pingpong) {
        expect(definition.condition.metric).toMatch(/^pingpong/);
      }
    });

    it('never reads a Mario Kart metric', () => {
      for (const definition of pingpong) {
        expect(definition.condition.metric).not.toMatch(/^competitor/);
      }
    });

    it('gates the calibration achievement on the weighted count', () => {
      // Reading the raw count would let a player farm one opponent to leave
      // calibration, which is exactly what the weighting exists to prevent.
      const calibrated = pingpong.find((d) => d.key === 'pp_calibre');
      expect(calibrated).toBeDefined();
      expect(calibrated!.condition.metric).toBe('pingpongWeightedMatchCount');
    });

    it('guards the rating milestone with a minimum match count', () => {
      // Without it, a newcomer on a lucky run could clear the bar before their
      // rating means anything.
      const rating = pingpong.find((d) => d.key === 'pp_maitre_du_tapis');
      expect(rating).toBeDefined();
      expect(rating!.condition.minCount).toBeDefined();
    });

    it('keeps rarity falling away, with at most two legendaries', () => {
      // With 25 players, "legendary" means roughly one person. Two is the
      // ceiling before the trophy case reads as empty to everyone else.
      const count = (rarity: string) =>
        pingpong.filter((d) => d.rarity === rarity).length;

      expect(count('LEGENDARY')).toBeLessThanOrEqual(2);
      expect(count('COMMON')).toBeGreaterThanOrEqual(count('LEGENDARY'));
    });

    it('awards more XP the rarer the achievement', () => {
      const order = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
      const maxXpByRarity = new Map<string, number>();
      for (const definition of pingpong) {
        maxXpByRarity.set(
          definition.rarity,
          Math.max(maxXpByRarity.get(definition.rarity) ?? 0, definition.xpReward),
        );
      }
      const present = order.filter((r) => maxXpByRarity.has(r));
      const values = present.map((r) => maxXpByRarity.get(r)!);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    });
  });

  describe('Mario Kart catalogue', () => {
    it('still holds its achievements', () => {
      expect(racing.length).toBeGreaterThan(0);
    });

    it('never reads a ping-pong metric', () => {
      for (const definition of racing) {
        expect(definition.condition.metric).not.toMatch(/^pingpong/);
      }
    });
  });
});
