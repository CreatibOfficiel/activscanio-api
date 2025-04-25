import { Competitor } from "../competitor.entity";

export const sanitizeCompetitor = (c: Competitor) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  profilePictureUrl: c.profilePictureUrl,
  mu: c.mu,
  sigma: c.sigma,
  rank: c.rank,
  raceCount: c.raceCount,
  avgRank12: c.avgRank12,

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
