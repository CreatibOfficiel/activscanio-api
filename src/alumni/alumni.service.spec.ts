import { AlumniService } from './alumni.service';

const ACTIVE_USER = {
  id: 'user-1',
  clerkId: 'clerk-1',
  competitor: { leftAt: null },
};

function serviceWith(manager: { count: jest.Mock; find: jest.Mock; insert: jest.Mock }) {
  const dataSource = {
    transaction: jest.fn((_level, work) => work(manager)),
  };
  const competitors = {
    find: jest.fn().mockResolvedValue([{
      id: 'alumni-1', firstName: 'Alice', lastName: 'A', profilePictureUrl: '',
      leftAt: '2025-08-23', keepAnniversaryReminder: true, contactUrl: null,
      totalLifetimeRaces: 42, characterVariant: null,
    }]),
  };
  const users = { findOne: jest.fn().mockResolvedValue(ACTIVE_USER) };
  const preferences = { findOne: jest.fn().mockResolvedValue(null) };
  return new AlumniService(dataSource as never, competitors as never, users as never, preferences as never);
}

describe('AlumniService reminder idempotency', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-08-24T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('delivers at most one reminder group per user and day', async () => {
    const manager = { count: jest.fn().mockResolvedValue(1), find: jest.fn(), insert: jest.fn() };
    await expect(serviceWith(manager).claimForUser('clerk-1')).resolves.toEqual([]);
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('does not repeat an alumni reminder for the same anniversary year', async () => {
    const manager = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([{ alumniId: 'alumni-1' }]),
      insert: jest.fn(),
    };
    await expect(serviceWith(manager).claimForUser('clerk-1')).resolves.toEqual([]);
    expect(manager.insert).not.toHaveBeenCalled();
  });
});
