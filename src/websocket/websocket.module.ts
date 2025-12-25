import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { WebSocketEventListener } from './websocket-event-listener.service';

@Module({
  providers: [EventsGateway, WebSocketEventListener],
  exports: [EventsGateway],
})
export class WebsocketModule {}
