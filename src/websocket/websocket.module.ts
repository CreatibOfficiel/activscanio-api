import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { EventsGateway } from './events.gateway';
import { WebSocketEventListener } from './websocket-event-listener.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [EventsGateway, WebSocketEventListener],
  exports: [EventsGateway],
})
export class WebsocketModule {}
