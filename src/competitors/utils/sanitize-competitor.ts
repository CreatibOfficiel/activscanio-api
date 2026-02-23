import { Competitor } from '../competitor.entity';
import {
  classifyCompetitor,
  calculateConservativeScore,
} from './competitor-classification';

export const sanitizeCompetitor = (c: Competitor) => {
  const { provisional, inactive } = classifyCompetitor(
    c.raceCount,
    c.rd,
    c.lastRaceDate,
  );

  return {
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
    conservativeScore: calculateConservativeScore(c.rating, c.rd),
    provisional,
    inactive,

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
  };
};
