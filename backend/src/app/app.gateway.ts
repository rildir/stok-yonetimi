import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/user.entity';

export const companyRoom = (companyId: string) => `company:${companyId}`;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    credentials: true,
  },
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

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
      // Resolve tenant from DB (authoritative, also covers tokens issued before multi-tenancy).
      const user = await this.dataSource.getRepository(UserEntity).findOne({
        where: { username: payload.username },
        select: { id: true, companyId: true, tokenVersion: true },
      });
      if (!user || user.tokenVersion !== payload.tokenVersion || (payload.companyId && payload.companyId !== user.companyId)) {
        this.logger.warn(`Connection rejected (Stale session): ${client.id}`);
        client.disconnect();
        return;
      }
      client['user'] = { ...payload, companyId: user.companyId };
      client.join(companyRoom(user.companyId));
      this.logger.log(`Client authenticated: ${payload.username} (${client.id})`);
    } catch (err: any) {
      this.logger.warn(`Connection rejected (Invalid token): ${client.id} - ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Broadcast only to sockets of the given company. Never use server.emit for tenant data. */
  emitToCompany(companyId: string, event: string, data: unknown) {
    if (this.server) {
      this.server.to(companyRoom(companyId)).emit(event, data);
    }
  }

  notifyPasswordResetRequest(companyId: string, data: { username: string; fullName: string }) {
    this.emitToCompany(companyId, 'password_reset_requested', data);
  }
}
