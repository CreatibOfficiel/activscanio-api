import { Competitor } from "../competitor.entity";

export const sanitizeCompetitor = (c: Competitor) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  profilePictureUrl: c.profilePictureUrl,
  rating: c.rating,
  rd: c.rd,
  vol: c.vol,
  rank: c.rank,
  raceCount: c.raceCount,
  avgRank12: c.avgRank12,
  conservativeScore: c.rating - 2 * c.rd,
  provisional: c.raceCount < 5 || c.rd > 150,

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
