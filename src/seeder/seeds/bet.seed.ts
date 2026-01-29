import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Bet, BetStatus } from 'src/betting/entities/bet.entity';
import { BetPick, BetPosition } from 'src/betting/entities/bet-pick.entity';
import { User, UserRole } from 'src/users/user.entity';
import {
  BettingWeek,
  BettingWeekStatus,
} from 'src/betting/entities/betting-week.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import { CompetitorOdds } from 'src/betting/entities/competitor-odds.entity';
import { BettorRanking } from 'src/betting/entities/bettor-ranking.entity';
import {
  seededRandom,
  addDays,
  calculateBetPoints,
} from '../utils/seed-helpers';

const logger = new Logger('BetSeed');

const PARTICIPATION_RATE = 0.7; // 70% of users bet each week
const BOOST_USAGE_RATE = 0.15; // 15% use their boost

export async function seedBets(dataSource: DataSource): Promise<Bet[]> {
  const betRepository = dataSource.getRepository(Bet);
  const betPickRepository = dataSource.getRepository(BetPick);
  const userRepository = dataSource.getRepository(User);
  const bettingWeekRepository = dataSource.getRepository(BettingWeek);
  const competitorRepository = dataSource.getRepository(Competitor);
  const competitorOddsRepository = dataSource.getRepository(CompetitorOdds);
  const bettorRankingRepository = dataSource.getRepository(BettorRanking);

  // Check if we already have bets
  const existingCount = await betRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Bets already exist. Skipping...');
    return betRepository.find({ relations: ['picks'] });
  }

  // Get all necessary data
  const users = await userRepository.find({
    where: [{ role: UserRole.BETTOR }, { role: UserRole.PLAYER }],
  });
  const bettingWeeks = await bettingWeekRepository.find({
    order: { startDate: 'ASC' },
  });
  const competitors = await competitorRepository.find();

  if (users.length === 0) {
    logger.warn('⚠️ No users found. Please seed users first.');
    return [];
  }

  if (bettingWeeks.length === 0) {
    logger.warn('⚠️ No betting weeks found. Please seed betting weeks first.');
    return [];
  }

  const betsToCreate: Bet[] = [];
  const picksToCreate: BetPick[] = [];
  const rankingsToUpdate = new Map<
    string,
    {
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
    }
  >();

  // Get odds for all weeks
  const allOdds = await competitorOddsRepository.find();
  const oddsByWeek = new Map<string, Map<string, number>>();

  for (const odd of allOdds) {
    if (!oddsByWeek.has(odd.bettingWeekId)) {
      oddsByWeek.set(odd.bettingWeekId, new Map());
    }
    oddsByWeek.get(odd.bettingWeekId)!.set(odd.competitorId, odd.odd);
  }

  // Generate bets for each week
  for (const week of bettingWeeks) {
    // Skip open weeks - betting still in progress
    if (week.status === BettingWeekStatus.OPEN) continue;

    const weekOdds = oddsByWeek.get(week.id) || new Map();

    // Randomly select users who will bet this week
    for (const user of users) {
      // Skip some users to simulate partial participation
      if (!seededRandom.bool(PARTICIPATION_RATE)) continue;

      // Create bet
      const bet = new Bet();
      bet.userId = user.id;
      bet.bettingWeekId = week.id;
      bet.placedAt = addDays(new Date(week.startDate), seededRandom.int(0, 5));

      // Select 3 different competitors for predictions
      const selectedCompetitors = seededRandom.pickMultiple(competitors, 3);
      const positions = [
        BetPosition.FIRST,
        BetPosition.SECOND,
        BetPosition.THIRD,
      ];

      // Decide if user uses boost this week (only on one pick)
      const usesBoost = seededRandom.bool(BOOST_USAGE_RATE);
      const boostPosition = usesBoost ? seededRandom.int(0, 2) : -1;

      let totalBetPoints = 0;
      let correctPicks = 0;
      const picks: BetPick[] = [];

      for (let i = 0; i < 3; i++) {
        const competitor = selectedCompetitors[i];
        const position = positions[i];
        const odd = weekOdds.get(competitor.id) || 2.5;
        const hasBoost = i === boostPosition;

        const pick = new BetPick();
        pick.competitorId = competitor.id;
        pick.position = position;
        pick.oddAtBet = odd;
        pick.hasBoost = hasBoost;
        pick.bet = bet;

        // Check if prediction is correct (for finalized weeks)
        if (week.status === BettingWeekStatus.FINALIZED) {
          const isCorrect =
            (position === BetPosition.FIRST &&
              week.podiumFirstId === competitor.id) ||
            (position === BetPosition.SECOND &&
              week.podiumSecondId === competitor.id) ||
            (position === BetPosition.THIRD &&
              week.podiumThirdId === competitor.id);

          pick.isCorrect = isCorrect;
          const points = calculateBetPoints(isCorrect, odd, hasBoost);
          pick.pointsEarned = points;
          totalBetPoints += points;

          if (isCorrect) correctPicks++;
        }

        picks.push(pick);
      }

      // Set bet status for finalized weeks
      if (week.status === BettingWeekStatus.FINALIZED) {
        bet.isFinalized = true;
        bet.status = correctPicks > 0 ? BetStatus.WON : BetStatus.LOST;
        bet.pointsEarned = totalBetPoints;
      } else {
        bet.isFinalized = false;
        bet.status = BetStatus.PENDING;
      }

      betsToCreate.push(bet);
      picksToCreate.push(...picks);

      // Track user rankings
      const rankingKey = `${user.id}-${week.month}-${week.year}`;
      if (!rankingsToUpdate.has(rankingKey)) {
        rankingsToUpdate.set(rankingKey, {
          totalPoints: 0,
          betsPlaced: 0,
          betsWon: 0,
          perfectBets: 0,
          boostsUsed: 0,
        });
      }
      const ranking = rankingsToUpdate.get(rankingKey)!;
      ranking.betsPlaced++;
      ranking.totalPoints += totalBetPoints;
      if (correctPicks > 0) ranking.betsWon++;
      if (correctPicks === 3) ranking.perfectBets++;
      if (usesBoost) ranking.boostsUsed++;
    }
  }

  // Save bets first to get IDs
  const savedBets = await betRepository.save(betsToCreate);
  logger.log(`✅ ${savedBets.length} bets seeded successfully!`);

  // Update picks with bet IDs and save
  const betIdMap = new Map<string, string>();
  for (const bet of savedBets) {
    betIdMap.set(`${bet.userId}-${bet.bettingWeekId}`, bet.id);
  }

  for (const pick of picksToCreate) {
    const key = `${pick.bet.userId}-${pick.bet.bettingWeekId}`;
    pick.betId = betIdMap.get(key)!;
  }

  // Save picks in batches
  const batchSize = 100;
  for (let i = 0; i < picksToCreate.length; i += batchSize) {
    const batch = picksToCreate.slice(i, i + batchSize);
    await betPickRepository.save(batch);
  }
  logger.log(`✅ ${picksToCreate.length} bet picks seeded successfully!`);

  // Create bettor rankings
  await seedBettorRankings(
    dataSource,
    users,
    bettingWeeks,
    rankingsToUpdate,
    bettorRankingRepository,
  );

  return savedBets;
}

async function seedBettorRankings(
  dataSource: DataSource,
  users: User[],
  weeks: BettingWeek[],
  rankingsData: Map<
    string,
    {
      totalPoints: number;
      betsPlaced: number;
      betsWon: number;
      perfectBets: number;
      boostsUsed: number;
    }
  >,
  bettorRankingRepository: import('typeorm').Repository<BettorRanking>,
) {
  // Check if rankings exist
  const existingCount = await bettorRankingRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Bettor rankings already exist. Skipping...');
    return;
  }

  const rankingsToCreate: Partial<BettorRanking>[] = [];

  // Get unique months from weeks
  const monthsSet = new Set<string>();
  for (const week of weeks) {
    if (week.status === 'finalized') {
      monthsSet.add(`${week.month}-${week.year}`);
    }
  }

  // Create rankings for each user/month combination
  for (const [key, data] of rankingsData.entries()) {
    const [userId, monthStr, yearStr] = key.split('-');
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);

    rankingsToCreate.push({
      userId,
      month,
      year,
      totalPoints: Math.round(data.totalPoints * 100) / 100,
      betsPlaced: data.betsPlaced,
      betsWon: data.betsWon,
      perfectBets: data.perfectBets,
      boostsUsed: data.boostsUsed,
      weeklyParticipationStreak: seededRandom.int(0, 4),
      perfectBetStreak: seededRandom.int(0, 2),
      consecutivePerfectBets: seededRandom.int(0, 1),
    });
  }

  // Sort rankings by points within each month and assign ranks
  const rankingsByMonth = new Map<string, Partial<BettorRanking>[]>();
  for (const ranking of rankingsToCreate) {
    const key = `${ranking.month}-${ranking.year}`;
    if (!rankingsByMonth.has(key)) {
      rankingsByMonth.set(key, []);
    }
    rankingsByMonth.get(key)!.push(ranking);
  }

  for (const [, monthRankings] of rankingsByMonth) {
    monthRankings.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    monthRankings.forEach((r, index) => {
      r.rank = index + 1;
    });
  }

  // Save rankings in batches
  const batchSize = 50;
  for (let i = 0; i < rankingsToCreate.length; i += batchSize) {
    const batch = rankingsToCreate.slice(i, i + batchSize);
    await bettorRankingRepository.save(batch);
  }

  logger.log(
    `✅ ${rankingsToCreate.length} bettor rankings seeded successfully!`,
  );
}
