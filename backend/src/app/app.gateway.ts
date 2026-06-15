import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('[AppGateway] WebSocket Server Initialized');
  }

  handleConnection(client: any) {
    console.log(`[AppGateway] Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    console.log(`[AppGateway] Client disconnected: ${client.id}`);
  }
}
