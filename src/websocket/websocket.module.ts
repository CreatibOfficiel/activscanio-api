import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BettingWeek } from '../betting/entities/betting-week.entity';
import { EventsGateway } from './events.gateway';
import { WebSocketEventListener } from './websocket-event-listener.service';

@Module({
  imports: [TypeOrmModule.forFeature([BettingWeek])],
  providers: [EventsGateway, WebSocketEventListener],
  exports: [EventsGateway],
})
export class WebsocketModule {}
