import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { SeasonArchive } from 'src/seasons/entities/season-archive.entity';
import { ArchivedCompetitorRanking } from 'src/seasons/entities/archived-competitor-ranking.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { User, UserRole } from 'src/users/user.entity';
import { Bet } from 'src/betting/entities/bet.entity';
import { seededRandom, subtractMonths } from '../utils/seed-helpers';

const logger = new Logger('SeasonSeed');

const MONTHS_TO_ARCHIVE = 4; // 4 months of archives

export async function seedSeasonArchives(
  dataSource: DataSource,
): Promise<SeasonArchive[]> {
  const seasonArchiveRepository = dataSource.getRepository(SeasonArchive);
  const archivedRankingRepository = dataSource.getRepository(
    ArchivedCompetitorRanking,
  );
  const competitorRepository = dataSource.getRepository(Competitor);
  const userRepository = dataSource.getRepository(User);
  const betRepository = dataSource.getRepository(Bet);

  // Check if we already have archives
  const existingCount = await seasonArchiveRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Season archives already exist. Skipping...');
    return seasonArchiveRepository.find({
      relations: ['competitorRankings'],
    });
  }

  const competitors = await competitorRepository.find();
  const users = await userRepository.find({
    where: [{ role: UserRole.BETTOR }, { role: UserRole.PLAYER }],
  });
  const betsCount = await betRepository.count();

  if (competitors.length === 0) {
    logger.warn('⚠️ No competitors found. Please seed competitors first.');
    return [];
  }

  const archivesToCreate: SeasonArchive[] = [];
  const rankingsToCreate: ArchivedCompetitorRanking[] = [];

  const now = new Date();

  // Create archives for the past months (skip current month)
  for (let i = 1; i <= MONTHS_TO_ARCHIVE; i++) {
    const archiveDate = subtractMonths(now, i);
    const month = archiveDate.getMonth() + 1;
    const year = archiveDate.getFullYear();

    // Calculate start and end of month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const seasonNames = [
      'Season Alpha',
      'Season Beta',
      'Season Gamma',
      'Season Delta',
      'Season Epsilon',
    ];

    const archive = new SeasonArchive();
    archive.month = month;
    archive.year = year;
    archive.seasonName = seasonNames[i - 1] || `Season ${i}`;
    archive.startDate = startDate;
    archive.endDate = endDate;
    archive.archivedAt = new Date(endDate);
    archive.archivedAt.setDate(archive.archivedAt.getDate() + 1);

    // Simulated statistics for the month
    archive.totalCompetitors = seededRandom.int(
      Math.floor(competitors.length * 0.7),
      competitors.length,
    );
    archive.totalBettors = seededRandom.int(
      Math.floor(users.length * 0.6),
      users.length,
    );
    archive.totalRaces = seededRandom.int(15, 30);
    archive.totalBets = seededRandom.int(30, 80);

    archivesToCreate.push(archive);
  }

  // Save archives first to get IDs
  const savedArchives = await seasonArchiveRepository.save(archivesToCreate);
  logger.log(`✅ ${savedArchives.length} season archives seeded successfully!`);

  // Create competitor rankings for each archive
  for (const archive of savedArchives) {
    // Create shuffled rankings with some variation
    const shuffledCompetitors = seededRandom.shuffle([...competitors]);

    for (let rank = 0; rank < shuffledCompetitors.length; rank++) {
      const competitor = shuffledCompetitors[rank];

      // Generate realistic stats based on rank
      const baseRating = 1500 + (competitors.length - rank) * 15;
      const ratingVariation = seededRandom.float(-50, 50);

      const ranking = new ArchivedCompetitorRanking();
      ranking.seasonArchiveId = archive.id;
      ranking.competitorId = competitor.id;
      ranking.competitorName = `${competitor.firstName} ${competitor.lastName}`;
      ranking.rank = rank + 1;
      ranking.finalRating =
        Math.round((baseRating + ratingVariation) * 100) / 100;
      ranking.finalRd = seededRandom.float(50, 150);
      ranking.finalVol = seededRandom.float(0.04, 0.08);
      ranking.totalRaces = seededRandom.int(5, 20);
      ranking.winStreak = seededRandom.int(0, 5);
      ranking.avgRank12 = seededRandom.float(2, 10);

      rankingsToCreate.push(ranking);
    }
  }

  // Save rankings in batches
  const batchSize = 50;
  for (let i = 0; i < rankingsToCreate.length; i += batchSize) {
    const batch = rankingsToCreate.slice(i, i + batchSize);
    await archivedRankingRepository.save(batch);
  }

  logger.log(
    `✅ ${rankingsToCreate.length} archived competitor rankings seeded successfully!`,
  );

  return savedArchives;
}
