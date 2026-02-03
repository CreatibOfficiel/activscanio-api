import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Bet } from './bet.entity';
import { Competitor } from '../../competitors/competitor.entity';

export enum BetPosition {
  FIRST = 'first',
  SECOND = 'second',
  THIRD = 'third',
}

@Entity('bet_picks')
export class BetPick {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  betId: string;

  @Column()
  competitorId: string;

  @ManyToOne(() => Bet, (bet) => bet.picks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'betId' })
  bet: Bet;

  @ManyToOne(() => Competitor, { eager: true })
  @JoinColumn({ name: 'competitorId' })
  competitor: Competitor;

  @Column({
    type: 'enum',
    enum: BetPosition,
  })
  position: BetPosition;

  @Column({ type: 'float' })
  oddAtBet: number;

  @Column({ type: 'boolean', default: false })
  hasBoost: boolean;

  @Column({ type: 'boolean', nullable: true })
  isCorrect: boolean;

  @Column({ type: 'float', nullable: true })
  pointsEarned: number;

  /** Final odd at the moment of bet resolution (for BOG calculation) */
  @Column({ type: 'float', nullable: true })
  finalOdd: number | null;

  /** True if the final odd was better than oddAtBet (BOG applied) */
  @Column({ type: 'boolean', default: false })
  usedBogOdd: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
