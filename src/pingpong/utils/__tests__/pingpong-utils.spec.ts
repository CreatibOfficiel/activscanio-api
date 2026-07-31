import { computePairWeight } from '../pairing-weight';
import { shannonDiversity } from '../diversity';
import {
  classifyPingpongPlayer,
  isValidSetScore,
  validateMatchSets,
} from '../pingpong-classification';

describe('computePairWeight', () => {
  it('gives full weight to the first three matches of a pair in a week', () => {
    expect(computePairWeight(0)).toBe(1);
    expect(computePairWeight(1)).toBe(1);
    expect(computePairWeight(2)).toBe(1);
  });

  it('halves the weight for the next three', () => {
    expect(computePairWeight(3)).toBe(0.5);
    expect(computePairWeight(4)).toBe(0.5);
    expect(computePairWeight(5)).toBe(0.5);
  });

  it('drops to zero from the seventh match onwards', () => {
    expect(computePairWeight(6)).toBe(0);
    expect(computePairWeight(20)).toBe(0);
  });
});

describe('shannonDiversity', () => {
  it('scores a single opponent at zero', () => {
    expect(shannonDiversity([10])).toBe(0);
  });

  it('scores evenly spread opponents at one', () => {
    expect(shannonDiversity([5, 5, 5, 5])).toBeCloseTo(1, 5);
  });

  it('scores a lopsided spread below the eligibility threshold', () => {
    // 90% of matches against one opponent, the rest scattered.
    expect(shannonDiversity([90, 4, 3, 3])).toBeLessThan(0.5);
  });

  it('scores a balanced pair above the threshold', () => {
    expect(shannonDiversity([5, 5])).toBeCloseTo(1, 5);
  });

  it('returns zero for an empty history', () => {
    expect(shannonDiversity([])).toBe(0);
  });

  it('ignores opponents with no matches', () => {
    expect(shannonDiversity([5, 5, 0, 0])).toBeCloseTo(1, 5);
  });
});

describe('isValidSetScore', () => {
  it('accepts a clean win at eleven', () => {
    expect(isValidSetScore(11, 0)).toBe(true);
    expect(isValidSetScore(11, 9)).toBe(true);
    expect(isValidSetScore(7, 11)).toBe(true);
  });

  it('rejects eleven to ten, which cannot end a set', () => {
    // At 10-10 the set continues until someone leads by two.
    expect(isValidSetScore(11, 10)).toBe(false);
  });

  it('accepts a deuce won by exactly two', () => {
    expect(isValidSetScore(12, 10)).toBe(true);
    expect(isValidSetScore(13, 11)).toBe(true);
    expect(isValidSetScore(20, 18)).toBe(true);
  });

  it('rejects a lead of three or more past eleven', () => {
    // Impossible: the set would have ended at two points of lead.
    expect(isValidSetScore(12, 9)).toBe(false);
    expect(isValidSetScore(15, 10)).toBe(false);
  });

  it('rejects a set nobody won', () => {
    expect(isValidSetScore(10, 8)).toBe(false);
    expect(isValidSetScore(0, 0)).toBe(false);
  });

  it('rejects a tie', () => {
    expect(isValidSetScore(11, 11)).toBe(false);
  });

  it('rejects negative scores', () => {
    expect(isValidSetScore(-1, 11)).toBe(false);
  });
});

describe('validateMatchSets', () => {
  it('accepts a straight two-nil', () => {
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 11, b: 5 },
    ]);
    expect(r.valid).toBe(true);
    expect(r.setsA).toBe(2);
    expect(r.setsB).toBe(0);
    expect(r.winner).toBe('A');
  });

  it('accepts a two-one decided in the third', () => {
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 9, b: 11 },
      { a: 12, b: 10 },
    ]);
    expect(r.valid).toBe(true);
    expect(r.setsA).toBe(2);
    expect(r.setsB).toBe(1);
    expect(r.winner).toBe('A');
  });

  it('names B as winner when B takes two sets', () => {
    const r = validateMatchSets([
      { a: 5, b: 11 },
      { a: 11, b: 8 },
      { a: 9, b: 11 },
    ]);
    expect(r.valid).toBe(true);
    expect(r.winner).toBe('B');
  });

  it('rejects a third set played after a two-nil', () => {
    // The match was already over; this set should never have happened.
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 11, b: 5 },
      { a: 11, b: 3 },
    ]);
    expect(r.valid).toBe(false);
  });

  it('rejects a single set', () => {
    expect(validateMatchSets([{ a: 11, b: 7 }]).valid).toBe(false);
  });

  it('rejects four sets', () => {
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 9, b: 11 },
      { a: 11, b: 8 },
      { a: 11, b: 8 },
    ]);
    expect(r.valid).toBe(false);
  });

  it('rejects an empty match', () => {
    expect(validateMatchSets([]).valid).toBe(false);
  });

  it('rejects a match containing an invalid set', () => {
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 11, b: 10 },
    ]);
    expect(r.valid).toBe(false);
  });

  it('rejects a one-one match left unfinished', () => {
    const r = validateMatchSets([
      { a: 11, b: 7 },
      { a: 7, b: 11 },
    ]);
    expect(r.valid).toBe(false);
  });
});

describe('classifyPingpongPlayer', () => {
  const now = new Date('2026-07-31T12:00:00Z');
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it('marks a newcomer as provisional', () => {
    const c = classifyPingpongPlayer(0, 350, null, now);
    expect(c.provisional).toBe(true);
    expect(c.confirmed).toBe(false);
  });

  it('keeps a player provisional below eight weighted matches', () => {
    // This is the anti-farming subtlety: raw match count is irrelevant here.
    const c = classifyPingpongPlayer(7.5, 40, daysAgo(1), now);
    expect(c.provisional).toBe(true);
  });

  it('confirms a player past eight weighted matches with a settled deviation', () => {
    const c = classifyPingpongPlayer(8, 120, daysAgo(1), now);
    expect(c.provisional).toBe(false);
    expect(c.confirmed).toBe(true);
  });

  it('keeps a player provisional while the deviation stays high', () => {
    const c = classifyPingpongPlayer(20, 151, daysAgo(1), now);
    expect(c.provisional).toBe(true);
  });

  it('marks a player inactive after fourteen days', () => {
    const c = classifyPingpongPlayer(20, 60, daysAgo(15), now);
    expect(c.inactive).toBe(true);
    expect(c.confirmed).toBe(false);
  });

  it('keeps a player active on the fourteenth day', () => {
    const c = classifyPingpongPlayer(20, 60, daysAgo(13), now);
    expect(c.inactive).toBe(false);
    expect(c.confirmed).toBe(true);
  });

  it('archives a player after one hundred and eighty days', () => {
    const c = classifyPingpongPlayer(20, 60, daysAgo(181), now);
    expect(c.archived).toBe(true);
    expect(c.confirmed).toBe(false);
  });

  it('never confirms an archived player', () => {
    const c = classifyPingpongPlayer(50, 40, daysAgo(200), now);
    expect(c.confirmed).toBe(false);
  });
});
