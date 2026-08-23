import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Competitor } from '../competitors/competitor.entity';
import { User } from '../users/user.entity';
import { NotificationPreferences } from '../notifications/notification-preferences.entity';
import { AlumniReminderDelivery } from './alumni-reminder-delivery.entity';
import { anniversaryTrigger, anniversaryYears, isAlumni, parisDate } from '../competitors/utils/player-lifecycle';

export interface AlumniReminderItem {
  id: string;
  firstName: string;
  years: number;
  contactUrl: string | null;
  profilePictureUrl: string;
  totalGames: number;
  characterName: string | null;
  characterImageUrl: string | null;
}

@Injectable()
export class AlumniService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Competitor) private readonly competitors: Repository<Competitor>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(NotificationPreferences) private readonly preferences: Repository<NotificationPreferences>,
  ) {}

  private async due(today: string, includeWindow: boolean): Promise<AlumniReminderItem[]> {
    const year = Number(today.slice(0, 4));
    const alumni = await this.competitors.find({
      where: { keepAnniversaryReminder: true },
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
    });
    const todayTime = Date.parse(`${today}T12:00:00Z`);
    return alumni.flatMap((player) => {
      if (!player.leftAt || !isAlumni(player.leftAt, today)) return [];
      const trigger = anniversaryTrigger(player.leftAt, year);
      const age = anniversaryYears(player.leftAt, year);
      const days = Math.floor((todayTime - Date.parse(`${trigger}T12:00:00Z`)) / 86_400_000);
      if (age < 1 || days < 0 || days > (includeWindow ? 6 : 0)) return [];
      return [{
        id: player.id,
        firstName: player.firstName,
        years: age,
        contactUrl: player.contactUrl,
        profilePictureUrl: player.profilePictureUrl,
        totalGames: player.totalLifetimeRaces,
        characterName: player.characterVariant?.baseCharacter?.name ?? null,
        characterImageUrl: player.characterVariant?.imageUrl ?? null,
      }];
    });
  }

  async claimForUser(clerkId: string): Promise<AlumniReminderItem[]> {
    const today = parisDate();
    const user = await this.users.findOne({ where: { clerkId }, relations: ['competitor'] });
    if (!user?.competitor || isAlumni(user.competitor.leftAt, today)) return [];
    const preference = await this.preferences.findOne({ where: { userId: user.id } });
    if (preference && (!preference.enableInApp || !preference.showAlumniReminders)) return [];
    const candidates = await this.due(today, true);
    if (!candidates.length) return [];

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const daily = await manager.count(AlumniReminderDelivery, {
        where: { userId: user.id, deliveredOn: today },
      });
      if (daily > 0) return [];
      const existing = await manager.find(AlumniReminderDelivery, {
        where: { userId: user.id, anniversaryYear: Number(today.slice(0, 4)) },
      });
      const seen = new Set(existing.map((row) => row.alumniId));
      const deliver = candidates.filter((item) => !seen.has(item.id));
      if (!deliver.length) return [];
      await manager.insert(AlumniReminderDelivery, deliver.map((item) => ({
        userId: user.id,
        alumniId: item.id,
        anniversaryYear: Number(today.slice(0, 4)),
        deliveredOn: today,
      })));
      return deliver;
    });
  }

  tvAnniversaries(): Promise<AlumniReminderItem[]> {
    return this.due(parisDate(), false);
  }

  async hallOfFame() {
    const all = await this.competitors.find({
      relations: ['characterVariant', 'characterVariant.baseCharacter'],
      order: { totalLifetimeRaces: 'DESC' },
    });
    return all.filter((player) => isAlumni(player.leftAt)).map((player) => ({
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      profilePictureUrl: player.profilePictureUrl,
      leftAt: player.leftAt,
      totalGames: player.totalLifetimeRaces,
      totalWins: player.totalWins,
      bestWinStreak: player.bestWinStreak,
      characterName: player.characterVariant?.baseCharacter?.name ?? null,
      characterImageUrl: player.characterVariant?.imageUrl ?? null,
    }));
  }
}
