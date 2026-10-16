import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { effectivePermissions } from './shared/kvkk/permissions';
import { maskPayloadForNonPiiReaders } from './shared/kvkk/masking';
import { attachAvailability } from './shared/inventory/reservations';

export const companyRoom = (companyId: string) => `company:${companyId}`;
export const companyAdminRoom = (companyId: string) => `company:${companyId}:admins`;
/** Sockets whose user holds customers.pii.read receive payloads as they are ... */
export const companyPiiRoom = (companyId: string) => `company:${companyId}:pii`;
/** ... everybody else (viewer, auditor) receives a copy with personal data masked (R61). */
export const companyMaskedRoom = (companyId: string) => `company:${companyId}:masked`;

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
      // Same secret as the HTTP guard (JwtModule / resolveJwtSecret).
      const payload = await this.jwtService.verifyAsync(token);
      // Resolve tenant from DB (authoritative, also covers tokens issued before multi-tenancy).
      const user = await this.dataSource.getRepository(UserEntity).findOne({
        where: { username: payload.username },
        select: { id: true, companyId: true, tokenVersion: true, role: true, permissions: true },
      });
      if (!user || user.tokenVersion !== payload.tokenVersion || (payload.companyId && payload.companyId !== user.companyId)) {
        this.logger.warn(`Connection rejected (Stale session): ${client.id}`);
        client.disconnect();
        return;
      }
      client['user'] = { ...payload, companyId: user.companyId };
      client.join(companyRoom(user.companyId));
      const canReadPii = effectivePermissions(user.role, user.permissions).includes('customers.pii.read');
      client.join(canReadPii ? companyPiiRoom(user.companyId) : companyMaskedRoom(user.companyId));
      if (user.role === 'admin') client.join(companyAdminRoom(user.companyId));
      this.logger.log(`Client authenticated: ${payload.username} (${client.id})`);
    } catch (err: any) {
      this.logger.warn(`Connection rejected (Invalid token): ${client.id} - ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast only to sockets of the given company. Never use server.emit for tenant data.
   * Holders of customers.pii.read get the payload as is; the others a masked copy (identity
   * numbers, natural persons' contact data - same rules as HTTP responses). Products carry the
   * API availability (availableQuantity net of reservations, sellableQuantity, reservedQuantity).
   */
  emitToCompany(companyId: string, event: string, data: unknown) {
    if (!this.server) return;
    const product = event === 'product_mutated' ? (data as { product?: { id?: string } } | null)?.product : null;
    if (product && product.id) {
      // A copy: the caller's entity may still be used (and saved) after the event.
      const copy = { ...product } as { id: string };
      attachAvailability(this.dataSource.manager, companyId, [copy])
        .catch((e) => this.logger.warn(`product availability for event failed: ${(e as Error).message}`))
        .finally(() => this.broadcast(companyId, event, { ...(data as object), product: copy }));
      return;
    }
    this.broadcast(companyId, event, data);
  }

  private broadcast(companyId: string, event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(companyPiiRoom(companyId)).emit(event, data);
    this.server.to(companyMaskedRoom(companyId)).emit(event, maskPayloadForNonPiiReaders(data));
  }

  /** Only to sockets of the company's admins (e.g. legal-parameter warnings). */
  emitToCompanyAdmins(companyId: string, event: string, data: unknown) {
    if (this.server) {
      this.server.to(companyAdminRoom(companyId)).emit(event, data);
    }
  }

  notifyPasswordResetRequest(companyId: string, data: { username: string; fullName: string }) {
    this.emitToCompanyAdmins(companyId, 'password_reset_requested', data);
  }
}
