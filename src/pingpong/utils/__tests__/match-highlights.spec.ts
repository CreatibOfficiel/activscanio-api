import { detectMatchHighlights } from '../match-highlights';

/**
 * Per-match highlights.
 *
 * These are the achievements that cannot be derived from running totals: they
 * live in the shape of a single match. A player can have a thousand wins and
 * never once have won a set 11-0.
 */
describe('detectMatchHighlights', () => {
  const winnerIsA = { winner: 'A' as const };

  describe('shutout set', () => {
    it('spots a set won without conceding a point', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 0 },
          { a: 11, b: 5 },
        ],
        ...winnerIsA,
      });

      expect(h.dealtShutoutSet).toBe(true);
      expect(h.concededShutoutSet).toBe(false);
    });

    it('reads the same whichever side of the table the winner was on', () => {
      // Same match as above, players swapped. Everything is reported from the
      // winner's point of view, so the result must be identical.
      const h = detectMatchHighlights({
        sets: [
          { a: 0, b: 11 },
          { a: 5, b: 11 },
        ],
        winner: 'B',
      });

      expect(h.dealtShutoutSet).toBe(true);
      expect(h.concededShutoutSet).toBe(false);
    });

    it('reports a shutout conceded by the winner', () => {
      // "Crème fraîche" is taken by losing a set 0-11, so it is claimed by
      // whoever conceded it — which can be the player who went on to win.
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 0, b: 11 },
          { a: 11, b: 8 },
        ],
        ...winnerIsA,
      });

      expect(h.concededShutoutSet).toBe(true);
      expect(h.dealtShutoutSet).toBe(false);
    });

    it('reports both when each player takes a shutout set', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 0 },
          { a: 0, b: 11 },
          { a: 11, b: 9 },
        ],
        ...winnerIsA,
      });

      expect(h.dealtShutoutSet).toBe(true);
      expect(h.concededShutoutSet).toBe(true);
    });

    it('does not count 11-1 as a shutout', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 1 },
          { a: 11, b: 2 },
        ],
        ...winnerIsA,
      });

      expect(h.dealtShutoutSet).toBe(false);
    });
  });

  describe('the loser side', () => {
    // Two of the achievements are claimed by the player who lost the match:
    // conceding a 0-11 set, and being on the wrong end of the scoreline. The
    // caller flips the perspective by flipping `winner`, so the same function
    // answers for both players.
    const sets = [
      { a: 11, b: 0 },
      { a: 11, b: 6 },
    ];

    it('gives the shutout to the winner', () => {
      const h = detectMatchHighlights({ sets, winner: 'A' });
      expect(h.dealtShutoutSet).toBe(true);
      expect(h.concededShutoutSet).toBe(false);
    });

    it('gives the conceded shutout to the loser when read from their side', () => {
      const h = detectMatchHighlights({ sets, winner: 'B' });
      expect(h.concededShutoutSet).toBe(true);
      expect(h.dealtShutoutSet).toBe(false);
    });
  });

  describe('comeback', () => {
    it('spots a win after dropping the first set', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 5, b: 11 },
          { a: 11, b: 8 },
          { a: 11, b: 9 },
        ],
        ...winnerIsA,
      });

      expect(h.cameBack).toBe(true);
    });

    it('is not a comeback when the first set was won', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 9, b: 11 },
          { a: 11, b: 8 },
        ],
        ...winnerIsA,
      });

      expect(h.cameBack).toBe(false);
    });

    it('is not a comeback on a straight two-nil', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 11, b: 3 },
        ],
        ...winnerIsA,
      });

      expect(h.cameBack).toBe(false);
    });
  });

  describe('deuce set', () => {
    it('spots a set won past 10-10', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 12, b: 10 },
          { a: 11, b: 4 },
        ],
        ...winnerIsA,
      });

      expect(h.wonDeuceSet).toBe(true);
      expect(h.deuceSetsWon).toBe(1);
    });

    it('counts every deuce set the winner took', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 5, b: 11 },
          { a: 13, b: 11 },
          { a: 12, b: 10 },
        ],
        ...winnerIsA,
      });

      expect(h.deuceSetsWon).toBe(2);
    });

    it('ignores deuce sets the loser took', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 10, b: 12 },
          { a: 11, b: 6 },
        ],
        ...winnerIsA,
      });

      expect(h.deuceSetsWon).toBe(0);
    });

    it('does not treat a clean 11-9 as deuce', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 9 },
          { a: 11, b: 9 },
        ],
        ...winnerIsA,
      });

      expect(h.wonDeuceSet).toBe(false);
    });
  });

  describe('heist — the rarest shape', () => {
    it('spots a comeback sealed with two deuce sets', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 5, b: 11 },
          { a: 12, b: 10 },
          { a: 14, b: 12 },
        ],
        ...winnerIsA,
      });

      expect(h.isHeist).toBe(true);
    });

    it('is not a heist without the dropped first set', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 12, b: 10 },
          { a: 14, b: 12 },
        ],
        ...winnerIsA,
      });

      expect(h.isHeist).toBe(false);
    });

    it('is not a heist with only one deuce set', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 5, b: 11 },
          { a: 12, b: 10 },
          { a: 11, b: 4 },
        ],
        ...winnerIsA,
      });

      expect(h.isHeist).toBe(false);
    });
  });

  describe('upset', () => {
    it('spots a win over someone rated far higher', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 11, b: 7 },
        ],
        ...winnerIsA,
        selfRatingBefore: 1400,
        opponentRatingBefore: 1600,
      });

      expect(h.ratingGapBeaten).toBe(200);
      expect(h.isUpset).toBe(true);
    });

    it('is not an upset when the favourite wins', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 11, b: 7 },
        ],
        ...winnerIsA,
        selfRatingBefore: 1700,
        opponentRatingBefore: 1400,
      });

      expect(h.ratingGapBeaten).toBe(0);
      expect(h.isUpset).toBe(false);
    });

    it('needs a gap of at least 150 points', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 11, b: 7 },
        ],
        ...winnerIsA,
        selfRatingBefore: 1500,
        opponentRatingBefore: 1640,
      });

      expect(h.isUpset).toBe(false);
    });

    it('reports no upset when ratings are unknown', () => {
      const h = detectMatchHighlights({
        sets: [
          { a: 11, b: 5 },
          { a: 11, b: 7 },
        ],
        ...winnerIsA,
      });

      expect(h.isUpset).toBe(false);
      expect(h.ratingGapBeaten).toBe(0);
    });
  });
});
