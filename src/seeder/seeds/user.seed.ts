import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { User, UserRole } from 'src/users/user.entity';
import { Competitor } from 'src/competitors/competitor.entity';
import {
  generateTestClerkId,
  faker,
  seededRandom,
} from '../utils/seed-helpers';

const logger = new Logger('UserSeed');

interface TestUserData {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  competitorIndex?: number; // Index in competitor array to link to
  xp?: number;
  level?: number;
}

// Define test users
const TEST_USERS: TestUserData[] = [
  // 10 Bettors
  {
    clerkId: generateTestClerkId(1),
    email: 'bettor1@test.local',
    firstName: 'Alice',
    lastName: 'Martin',
    role: UserRole.BETTOR,
    xp: 1250,
    level: 5,
  },
  {
    clerkId: generateTestClerkId(2),
    email: 'bettor2@test.local',
    firstName: 'Bob',
    lastName: 'Dupont',
    role: UserRole.BETTOR,
    xp: 800,
    level: 3,
  },
  {
    clerkId: generateTestClerkId(3),
    email: 'bettor3@test.local',
    firstName: 'Charlie',
    lastName: 'Durand',
    role: UserRole.BETTOR,
    xp: 2100,
    level: 7,
  },
  {
    clerkId: generateTestClerkId(4),
    email: 'bettor4@test.local',
    firstName: 'Diana',
    lastName: 'Bernard',
    role: UserRole.BETTOR,
    xp: 450,
    level: 2,
  },
  {
    clerkId: generateTestClerkId(5),
    email: 'bettor5@test.local',
    firstName: 'Ethan',
    lastName: 'Petit',
    role: UserRole.BETTOR,
    xp: 3500,
    level: 10,
  },
  {
    clerkId: generateTestClerkId(6),
    email: 'bettor6@test.local',
    firstName: 'Fiona',
    lastName: 'Robert',
    role: UserRole.BETTOR,
    xp: 600,
    level: 3,
  },
  {
    clerkId: generateTestClerkId(7),
    email: 'bettor7@test.local',
    firstName: 'Georges',
    lastName: 'Richard',
    role: UserRole.BETTOR,
    xp: 1800,
    level: 6,
  },
  {
    clerkId: generateTestClerkId(8),
    email: 'bettor8@test.local',
    firstName: 'Helene',
    lastName: 'Simon',
    role: UserRole.BETTOR,
    xp: 150,
    level: 1,
  },
  {
    clerkId: generateTestClerkId(9),
    email: 'bettor9@test.local',
    firstName: 'Ivan',
    lastName: 'Laurent',
    role: UserRole.BETTOR,
    xp: 950,
    level: 4,
  },
  {
    clerkId: generateTestClerkId(10),
    email: 'bettor10@test.local',
    firstName: 'Julie',
    lastName: 'Lefevre',
    role: UserRole.BETTOR,
    xp: 2800,
    level: 9,
  },
  // 6 Players (linked to competitors)
  {
    clerkId: generateTestClerkId(11),
    email: 'player1@test.local',
    firstName: 'Thibaud',
    lastName: 'CB',
    role: UserRole.PLAYER,
    competitorIndex: 27, // Index of Thibaud CB in competitor list
    xp: 4200,
    level: 12,
  },
  {
    clerkId: generateTestClerkId(12),
    email: 'player2@test.local',
    firstName: 'Julian',
    lastName: 'Miribel',
    role: UserRole.PLAYER,
    competitorIndex: 16, // Index of Julian Miribel in competitor list
    xp: 3100,
    level: 10,
  },
  {
    clerkId: generateTestClerkId(13),
    email: 'player3@test.local',
    firstName: 'Nicolas',
    lastName: 'Miribel',
    role: UserRole.PLAYER,
    competitorIndex: 24, // Index of Nicolas Miribel in competitor list
    xp: 2700,
    level: 9,
  },
  {
    clerkId: generateTestClerkId(14),
    email: 'player4@test.local',
    firstName: 'Thomas',
    lastName: 'Wales',
    role: UserRole.PLAYER,
    competitorIndex: 28, // Index of Thomas Wales in competitor list
    xp: 1950,
    level: 7,
  },
  {
    clerkId: generateTestClerkId(15),
    email: 'player5@test.local',
    firstName: 'Florian',
    lastName: 'Torres',
    role: UserRole.PLAYER,
    competitorIndex: 10, // Index of Florian Torres in competitor list
    xp: 3800,
    level: 11,
  },
  {
    clerkId: generateTestClerkId(16),
    email: 'player6@test.local',
    firstName: 'Maxime',
    lastName: 'Favier',
    role: UserRole.PLAYER,
    competitorIndex: 22, // Index of Maxime Favier in competitor list
    xp: 2200,
    level: 8,
  },
];

export async function seedUsers(dataSource: DataSource): Promise<User[]> {
  const userRepository = dataSource.getRepository(User);
  const competitorRepository = dataSource.getRepository(Competitor);

  // Check if we already have test users
  const existingCount = await userRepository.count({
    where: { clerkId: generateTestClerkId(1) },
  });

  if (existingCount > 0) {
    logger.log('🟡 Test users already exist. Skipping...');
    // Return existing users for other seeds to use
    return userRepository.find({
      where: TEST_USERS.map((u) => ({ clerkId: u.clerkId })),
    });
  }

  // Get all competitors for linking players
  const competitors = await competitorRepository.find();

  if (competitors.length === 0) {
    logger.warn('⚠️ No competitors found. Please seed competitors first.');
    return [];
  }

  // Get competitors already linked to existing users
  const usersWithCompetitors = await userRepository.find({
    where: { competitorId: undefined },
    select: ['competitorId'],
  });

  // Get all existing users to find used competitor IDs
  const allExistingUsers = await userRepository.find();
  const usedCompetitorIds = new Set(
    allExistingUsers.filter((u) => u.competitorId).map((u) => u.competitorId),
  );

  // Filter out already-used competitors
  const availableCompetitors = competitors.filter(
    (c) => !usedCompetitorIds.has(c.id),
  );

  logger.log(
    `📊 ${availableCompetitors.length} competitors available (${usedCompetitorIds.size} already linked)`,
  );

  const usersToCreate: Partial<User>[] = [];
  let availableCompetitorIndex = 0;

  for (const userData of TEST_USERS) {
    const user: Partial<User> = {
      clerkId: userData.clerkId,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      xp: userData.xp || 0,
      level: userData.level || 1,
      achievementCount: seededRandom.int(0, 10),
      profilePictureUrl: faker.image.avatar(),
    };

    // Link player to an available competitor
    if (userData.role === UserRole.PLAYER) {
      // First try the specified index if available
      let competitor = competitors[userData.competitorIndex ?? -1];

      // If specified competitor is already used, pick from available ones
      if (!competitor || usedCompetitorIds.has(competitor.id)) {
        if (availableCompetitorIndex < availableCompetitors.length) {
          competitor = availableCompetitors[availableCompetitorIndex];
          availableCompetitorIndex++;
        } else {
          logger.warn(
            `⚠️ No available competitor for player ${userData.firstName} ${userData.lastName}`,
          );
          competitor = null as unknown as Competitor;
        }
      }

      if (competitor) {
        user.competitorId = competitor.id;
        usedCompetitorIds.add(competitor.id); // Mark as used for this batch
        logger.log(
          `🔗 Linking ${userData.firstName} ${userData.lastName} to competitor ${competitor.firstName} ${competitor.lastName}`,
        );
      }
    }

    usersToCreate.push(user);
  }

  await userRepository.insert(usersToCreate);
  logger.log(`✅ ${usersToCreate.length} test users seeded successfully!`);

  return userRepository.find({
    where: TEST_USERS.map((u) => ({ clerkId: u.clerkId })),
  });
}
