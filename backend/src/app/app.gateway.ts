import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    credentials: true
  }
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    console.log('[AppGateway] WebSocket Server Initialized');
  }

  async handleConnection(client: any) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        console.warn(`[AppGateway] Connection rejected (No token): ${client.id}`);
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET
      });
      client['user'] = payload;
      console.log(`[AppGateway] Client authenticated: ${payload.username} (${client.id})`);
    } catch (err: any) {
      console.warn(`[AppGateway] Connection rejected (Invalid token): ${client.id} - ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    console.log(`[AppGateway] Client disconnected: ${client.id}`);
  }
}
