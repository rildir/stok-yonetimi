import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityMetadata,
  EntitySubscriberInterface,
  InsertEvent,
  QueryRunner,
  RemoveEvent,
  SoftRemoveEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  UpdateEvent,
} from 'typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { computeDiff } from '../../shared/integrations/audit-diff';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { WebhookService, PendingEvent } from './webhook.service';

/**
 * Tables that are never audited: logs themselves, derived stock rows covered by stock_movements,
 * the movement chain head (bookkeeping of the hash chain) and attachment blobs (linked to their
 * immutable movement; the content would bloat the diff).
 */
const NOT_AUDITED = new Set(['audit_logs', 'webhook_deliveries', 'stock_movements', 'product_warehouse_stocks', 'migrations', 'stock_movement_chains', 'stock_movement_attachments']);

/** Changes to only these fields are noise (e.g. API key last-used bookkeeping). */
const NOISE_ONLY = new Set(['lastUsedAt', 'updatedAt']);

const PENDING_KEY = '__pendingWebhookEvents';

type Row = Record<string, any>;

function level(qty: number, min: number): 'out' | 'low' | 'ok' {
  if (qty <= 0) return 'out';
  if (qty <= min) return 'low';
  return 'ok';
}

/**
 * Global TypeORM subscriber:
 *  - writes an audit_logs row (same transaction) for every change to a business entity made
 *    inside an authenticated request (user or API key);
 *  - derives webhook events and dispatches them only after the transaction commits.
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(@InjectDataSource() dataSource: DataSource, private readonly webhooks: WebhookService) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(e: InsertEvent<Row>) {
    await this.handle('create', e.metadata, e.queryRunner, e.manager, null, e.entity);
  }

  async afterUpdate(e: UpdateEvent<Row>) {
    await this.handle('update', e.metadata, e.queryRunner, e.manager, (e.databaseEntity as Row) ?? null, (e.entity as Row) ?? null);
  }

  async afterRemove(e: RemoveEvent<Row>) {
    const before = (e.databaseEntity as Row) ?? (e.entity as Row) ?? null;
    await this.handle('delete', e.metadata, e.queryRunner, e.manager, before ? { ...before, id: before.id ?? e.entityId } : null, null);
  }

  async afterSoftRemove(e: SoftRemoveEvent<Row>) {
    await this.handle('delete', e.metadata, e.queryRunner, e.manager, (e.databaseEntity as Row) ?? (e.entity as Row) ?? null, null);
  }

  afterTransactionCommit(e: TransactionCommitEvent) {
    if (!e.queryRunner.isTransactionActive) this.flush(e.queryRunner);
  }

  afterTransactionRollback(e: TransactionRollbackEvent) {
    if (!e.queryRunner.isTransactionActive && e.queryRunner.data) delete e.queryRunner.data[PENDING_KEY];
  }

  private async handle(
    action: 'create' | 'update' | 'delete',
    meta: EntityMetadata,
    qr: QueryRunner,
    manager: any,
    before: Row | null,
    after: Row | null,
  ) {
    const table = meta.tableName;
    if (NOT_AUDITED.has(table) && table !== 'stock_movements') return;
    try {
      const actor = TenantContext.current();
      const subject = after ?? before ?? {};
      const companyId: string | undefined =
        subject.companyId ?? (table === 'companies' ? subject.id ?? before?.id : undefined) ?? actor.companyId;
      if (!companyId) return;

      // Webhook events are derived regardless of actor (only after commit).
      const events = this.deriveEvents(table, action, before, after, companyId);
      if (events.length) this.enqueue(qr, events);

      if (NOT_AUDITED.has(table)) return;
      if (!actor.username && !actor.apiKeyId) return; // seeders / background jobs

      const diff = computeDiff(action === 'create' ? null : before, action === 'delete' ? null : after);
      let finalAction: string = action;
      if (action === 'update') {
        if (!diff.changed.length || diff.changed.every((k) => NOISE_ONLY.has(k))) return;
        if (diff.after?.['isDeleted'] === true && diff.before?.['isDeleted'] === false) finalAction = 'delete';
      }
      await manager.insert(AuditLogEntity, {
        companyId,
        userId: actor.userId ?? null,
        username: actor.username?.slice(0, 100) ?? null,
        apiKeyId: actor.apiKeyId ?? null,
        action: finalAction,
        entityType: table,
        entityId: subject.id ? String(subject.id).slice(0, 36) : null,
        before: diff.before,
        after: diff.after,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
      });
    } catch (error) {
      this.logger.warn(`audit/webhook capture failed for ${table}: ${(error as Error).message}`);
    }
  }

  private deriveEvents(table: string, action: string, before: Row | null, after: Row | null, companyId: string): PendingEvent[] {
    const out: PendingEvent[] = [];
    const id = (after ?? before)?.id as string | undefined;
    if (!id && table !== 'stock_movements') return out;
    const ev = (event: string, data: Row | null) => out.push({ companyId, event, entityType: table, entityId: id ?? null, data });

    if (table === 'products') {
      if (action === 'create') return ev('product.created', after), out;
      if (action === 'delete') return ev('product.deleted', before), out;
      if (!before || !after) return ev('product.updated', after), out;
      if (after.isDeleted === true && before.isDeleted === false) return ev('product.deleted', after), out;
      const diff = computeDiff(before, after);
      const stockFields = new Set(['quantity', 'status', 'updatedAt']);
      if (diff.changed.some((k) => !stockFields.has(k))) ev('product.updated', after);
      if (diff.changed.includes('quantity')) {
        const min = Number(after.minQuantity ?? 0);
        const prev = level(Number(before.quantity), min);
        const next = level(Number(after.quantity), min);
        if (next !== 'ok' || prev !== next) {
          out.push({
            companyId,
            event: 'stock.changed',
            entityType: table,
            entityId: id ?? null,
            data: { productId: id, sku: after.sku, name: after.name, previousQuantity: Number(before.quantity), quantity: Number(after.quantity), minQuantity: min, level: next, previousLevel: prev },
          });
        }
      }
    } else if (table === 'orders') {
      if (action === 'create') ev('order.created', after);
      else if (action === 'update') {
        if (before && after && before.status !== after.status && after.status === 'Cancelled') ev('order.cancelled', after);
        else if (!before || !after || computeDiff(before, after).changed.length) ev('order.updated', after);
      }
    } else if (table === 'purchase_orders') {
      if (action === 'update' && after?.status === 'Received' && before?.status !== 'Received') ev('purchase_order.received', after);
    } else if (table === 'stock_movements') {
      if (action === 'create' && (after?.type === 'TRANSFER_IN' || after?.type === 'QUARANTINE_IN')) {
        out.push({ companyId, event: 'transfer.completed', entityType: table, entityId: after.id ?? null, data: after });
      }
    }
    return out;
  }

  private enqueue(qr: QueryRunner | undefined, events: PendingEvent[]) {
    if (qr && qr.isTransactionActive) {
      qr.data = qr.data || {};
      const list: PendingEvent[] = (qr.data[PENDING_KEY] = qr.data[PENDING_KEY] || []);
      list.push(...events);
    } else {
      setImmediate(() => this.webhooks.emitMany(events));
    }
  }

  private flush(qr: QueryRunner) {
    const list: PendingEvent[] | undefined = qr.data?.[PENDING_KEY];
    if (!list?.length) return;
    delete qr.data[PENDING_KEY];
    // A record created in this transaction emits only its ".created" event (no follow-up ".updated").
    const created = new Set(list.filter((e) => e.event.endsWith('.created')).map((e) => `${e.entityType}:${e.entityId}`));
    const seen = new Set<string>();
    const events = list.filter((e) => {
      if (e.event.endsWith('.updated') && created.has(`${e.entityType}:${e.entityId}`)) return false;
      const key = `${e.event}:${e.entityId}`;
      if (e.event !== 'stock.changed' && e.event !== 'transfer.completed') {
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    });
    setImmediate(() => this.webhooks.emitMany(events));
  }
}
