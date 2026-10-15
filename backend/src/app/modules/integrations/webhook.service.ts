import { err } from '../../shared/i18n/app-error';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WebhookEndpointEntity } from '../../entities/webhook-endpoint.entity';
import { WebhookDeliveryEntity } from '../../entities/webhook-delivery.entity';
import { OrderEntity } from '../../entities/order.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { redact } from '../../shared/integrations/audit-diff';
import { checkWebhookUrl } from '../../shared/integrations/url-guard';
import {
  MAX_ATTEMPTS,
  SIGNATURE_HEADER,
  WEBHOOK_EVENTS,
  generateWebhookSecret,
  retryDelayMs,
  signatureHeader,
} from '../../shared/integrations/webhook-signature';

export interface PendingEvent {
  companyId: string;
  event: string;
  entityType: string;
  entityId: string | null;
  data: Record<string, any> | null;
}

export interface WebhookEndpointInput {
  url?: string;
  description?: string | null;
  events?: string[];
  active?: boolean;
}

const TEST_EVENT = 'webhook.test';

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private timer?: NodeJS.Timeout;
  private readonly inFlight = new Set<string>();

  constructor(
    @InjectRepository(WebhookEndpointEntity) private readonly endpoints: Repository<WebhookEndpointEntity>,
    @InjectRepository(WebhookDeliveryEntity) private readonly deliveries: Repository<WebhookDeliveryEntity>,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(PurchaseOrderEntity) private readonly purchaseOrders: Repository<PurchaseOrderEntity>,
    private readonly tenant: TenantContext,
  ) {}

  // ---------------------------------------------------------------- scheduler
  onModuleInit() {
    if (process.env.JEST_WORKER_ID || process.env.WEBHOOK_SCHEDULER === 'off') return;
    const every = Number(process.env.WEBHOOK_SCHEDULER_MS) || 10_000;
    this.timer = setInterval(() => void this.processDue(), every);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Retry pending deliveries whose nextRetryAt has passed. */
  async processDue(): Promise<void> {
    try {
      const due = await this.deliveries.find({
        where: { status: 'pending', nextRetryAt: LessThanOrEqual(new Date()) },
        order: { nextRetryAt: 'ASC' },
        take: 20,
      });
      for (const d of due) await this.dispatch(d.id);
    } catch (e) {
      this.logger.warn(`webhook scheduler: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- endpoints (tenant scoped)
  private get companyId() {
    return this.tenant.companyId;
  }

  private present(e: WebhookEndpointEntity) {
    const { secret, ...rest } = e;
    return rest;
  }

  private validateEvents(events: string[] | undefined): string[] {
    const list = Array.from(new Set(events || []));
    const bad = list.filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (bad.length) throw new BadRequestException(err('WEBHOOK_EVENT_INVALID', { events: bad.join(', ') }));
    if (!list.length) throw new BadRequestException(err('WEBHOOK_EVENTS_REQUIRED'));
    return list;
  }

  private async validateUrl(url: string) {
    const check = await checkWebhookUrl(url);
    if (!check.ok) throw new BadRequestException(err(check.code));
  }

  async listEndpoints() {
    const rows = await this.endpoints.find({ where: { companyId: this.companyId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.present(r));
  }

  private async findEndpoint(id: string) {
    const ep = await this.endpoints.findOne({ where: { id, companyId: this.companyId } });
    if (!ep) throw new NotFoundException(err('WEBHOOK_NOT_FOUND'));
    return ep;
  }

  async createEndpoint(input: WebhookEndpointInput) {
    await this.validateUrl(input.url || '');
    const ep = await this.endpoints.save(
      this.endpoints.create({
        companyId: this.companyId,
        url: input.url!,
        description: input.description || null,
        events: this.validateEvents(input.events),
        active: input.active ?? true,
        secret: generateWebhookSecret(),
      }),
    );
    return { ...this.present(ep), secret: ep.secret };
  }

  async updateEndpoint(id: string, input: WebhookEndpointInput) {
    const ep = await this.findEndpoint(id);
    if (input.url !== undefined && input.url !== ep.url) {
      await this.validateUrl(input.url);
      ep.url = input.url;
    }
    if (input.description !== undefined) ep.description = input.description || null;
    if (input.events !== undefined) ep.events = this.validateEvents(input.events);
    if (input.active !== undefined) ep.active = input.active;
    return this.present(await this.endpoints.save(ep));
  }

  async rotateSecret(id: string) {
    const ep = await this.findEndpoint(id);
    ep.secret = generateWebhookSecret();
    await this.endpoints.save(ep);
    return { secret: ep.secret };
  }

  async deleteEndpoint(id: string) {
    const ep = await this.findEndpoint(id);
    await this.endpoints.remove(ep);
    return { success: true };
  }

  async listDeliveries(q: { endpointId?: string; status?: string; event?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (q.endpointId) where['endpointId'] = q.endpointId;
    if (q.status) where['status'] = q.status;
    if (q.event) where['event'] = q.event;
    const [items, total] = await this.deliveries.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async sendTest(id: string) {
    const ep = await this.findEndpoint(id);
    const d = await this.createDelivery(ep, TEST_EVENT, { message: 'Test event', endpointId: ep.id });
    await this.dispatch(d.id);
    return this.deliveries.findOneByOrFail({ id: d.id });
  }

  async resend(deliveryId: string) {
    const old = await this.deliveries.findOne({ where: { id: deliveryId, companyId: this.companyId } });
    if (!old) throw new NotFoundException(err('WEBHOOK_DELIVERY_NOT_FOUND'));
    const ep = await this.findEndpoint(old.endpointId);
    const d = await this.createDelivery(ep, old.event, (old.payload?.['data'] as Record<string, unknown>) ?? {});
    await this.dispatch(d.id);
    return this.deliveries.findOneByOrFail({ id: d.id });
  }

  // ---------------------------------------------------------------- emission
  /** Called by AuditSubscriber after commit. Never throws. */
  async emitMany(events: PendingEvent[]): Promise<void> {
    for (const e of events) {
      try {
        await this.emit(e);
      } catch (error) {
        this.logger.warn(`webhook emit ${e.event} failed: ${(error as Error).message}`);
      }
    }
  }

  private async emit(e: PendingEvent) {
    const all = await this.endpoints.find({ where: { companyId: e.companyId, active: true } });
    const targets = all.filter((ep) => (ep.events || []).includes(e.event));
    if (!targets.length) return;
    const data = await this.buildData(e);
    for (const ep of targets) {
      const d = await this.createDelivery(ep, e.event, data);
      void this.dispatch(d.id);
    }
  }

  /** Orders / POs are re-read after commit so the payload includes items, charges and totals. */
  private async buildData(e: PendingEvent): Promise<Record<string, unknown>> {
    if (e.entityId && (e.event.startsWith('order.') || e.event.startsWith('purchase_order.'))) {
      const repo: Repository<any> = e.event.startsWith('order.') ? this.orders : this.purchaseOrders;
      const row = await repo.findOne({ where: { id: e.entityId, companyId: e.companyId }, relations: ['items', 'charges'], withDeleted: true });
      if (row) return { ...redact(row), items: (row.items || []).map((i: any) => redact(i)), charges: (row.charges || []).map((c: any) => redact(c)) };
    }
    return redact(e.data) || {};
  }

  private async createDelivery(ep: WebhookEndpointEntity, event: string, data: Record<string, unknown>) {
    const d = this.deliveries.create({
      companyId: ep.companyId,
      endpointId: ep.id,
      event,
      payload: {},
      status: 'pending',
      attempts: 0,
      nextRetryAt: new Date(),
    });
    const saved = await this.deliveries.save(d);
    saved.payload = { id: saved.id, event, createdAt: new Date().toISOString(), companyId: ep.companyId, data };
    await this.deliveries.update({ id: saved.id }, { payload: saved.payload as any });
    return saved;
  }

  /** Send one delivery attempt; schedules a retry with exponential backoff on failure. */
  async dispatch(id: string): Promise<void> {
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);
    try {
      const d = await this.deliveries.findOne({ where: { id } });
      if (!d || d.status !== 'pending') return;
      const ep = await this.endpoints.findOne({ where: { id: d.endpointId, companyId: d.companyId } });
      if (!ep) {
        await this.deliveries.update({ id }, { status: 'failed', error: 'endpoint deleted', nextRetryAt: null });
        return;
      }
      const attempts = d.attempts + 1;
      let responseCode: number | null = null;
      let responseBody: string | null = null;
      let error: string | null = null;
      const check = await checkWebhookUrl(ep.url);
      if (!check.ok) {
        error = check.code;
      } else {
        const body = JSON.stringify(d.payload);
        try {
          const res = await fetch(ep.url, {
            method: 'POST',
            redirect: 'manual',
            signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS) || 10_000),
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SmartInventory-Webhooks/1.0',
              'X-Webhook-Id': d.id,
              'X-Webhook-Event': d.event,
              [SIGNATURE_HEADER]: signatureHeader(ep.secret, body),
            },
            body,
          });
          responseCode = res.status;
          responseBody = (await res.text().catch(() => '')).slice(0, 2000);
        } catch (e) {
          error = ((e as Error).message || 'request failed').slice(0, 500);
        }
      }
      const ok = responseCode !== null && responseCode >= 200 && responseCode < 300;
      const exhausted = attempts >= MAX_ATTEMPTS || (check.ok === false && check.code === 'WEBHOOK_URL_INVALID');
      await this.deliveries.update(
        { id },
        {
          attempts,
          responseCode,
          responseBody,
          error: ok ? null : error ?? `HTTP ${responseCode}`,
          status: ok ? 'success' : exhausted ? 'failed' : 'pending',
          deliveredAt: ok ? new Date() : null,
          nextRetryAt: ok || exhausted ? null : new Date(Date.now() + retryDelayMs(attempts)),
        },
      );
    } finally {
      this.inFlight.delete(id);
    }
  }
}
