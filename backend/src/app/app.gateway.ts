import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    credentials: true,
  },
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Server Initialized');
  }

  async handleConnection(client: any) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        this.logger.warn(`Connection rejected (No token): ${client.id}`);
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      client['user'] = payload;
      this.logger.log(`Client authenticated: ${payload.username} (${client.id})`);
    } catch (err: any) {
      this.logger.warn(`Connection rejected (Invalid token): ${client.id} - ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  notifyPasswordResetRequest(data: { username: string; fullName: string }) {
    if (this.server) {
      this.server.emit('password_reset_requested', data);
    }
  }
}
