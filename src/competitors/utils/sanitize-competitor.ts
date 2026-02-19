import { Competitor } from '../competitor.entity';

const INACTIVE_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000; // 8 days

export const sanitizeCompetitor = (c: Competitor) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  profilePictureUrl: c.profilePictureUrl,
  rating: c.rating,
  rd: c.rd,
  vol: c.vol,
  raceCount: c.raceCount,
  avgRank12: c.avgRank12,
  lifetimeAvgRank: c.lifetimeAvgRank,
  lastRaceDate: c.lastRaceDate,
  conservativeScore: c.rating - 2 * c.rd,
  provisional: c.raceCount < 5 || c.rd > 150,
  inactive:
    c.raceCount < 5 || c.rd > 150
      ? false
      : !c.lastRaceDate ||
        Date.now() - new Date(c.lastRaceDate).getTime() > INACTIVE_THRESHOLD_MS,

  winStreak: c.winStreak,
  bestWinStreak: c.bestWinStreak,
  totalWins: c.totalWins,
  playStreak: c.playStreak,
  bestPlayStreak: c.bestPlayStreak,
  recentPositions: c.recentPositions?.map(Number) ?? null,
  previousDayRank: c.previousDayRank,
  totalLifetimeRaces: c.totalLifetimeRaces,
  currentMonthRaceCount: c.currentMonthRaceCount,

  characterVariant: c.characterVariant
    ? {
        id: c.characterVariant.id,
        label: c.characterVariant.label,
        baseCharacter: c.characterVariant.baseCharacter
          ? {
              id: c.characterVariant.baseCharacter.id,
              name: c.characterVariant.baseCharacter.name,
            }
          : undefined,
      }
    : null,
});
