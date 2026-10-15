import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { EDocumentService } from './edocument.service';
import { InboxService } from './inbox.service';
import { EDocumentArchiveService } from './archive.service';

/**
 * Scheduled e-Belge jobs (WP5): outbox every 20 s, status polling every minute, inbox every 15
 * minutes, deemed acceptance and MATBUDAN deadline warnings hourly, archive integrity daily.
 * Disabled in tests (NODE_ENV=test) and with EBELGE_WORKER=off.
 */
@Injectable()
export class EBelgeWorker {
  private readonly logger = new Logger(EBelgeWorker.name);
  private running = new Set<string>();

  constructor(
    private readonly tenant: TenantContext,
    private readonly edocs: EDocumentService,
    private readonly inbox: InboxService,
    private readonly archive: EDocumentArchiveService,
    private readonly gateway: AppGateway,
  ) {}

  private get enabled(): boolean {
    return process.env.NODE_ENV !== 'test' && process.env.EBELGE_WORKER !== 'off';
  }

  private async once(name: string, fn: () => Promise<void>): Promise<void> {
    if (!this.enabled || this.running.has(name)) return;
    this.running.add(name);
    try {
      await fn();
    } catch (e) {
      this.logger.warn(`${name} failed: ${(e as Error).message}`);
    } finally {
      this.running.delete(name);
    }
  }

  private async eachCompany(fn: (companyId: string) => Promise<unknown>): Promise<void> {
    for (const c of await this.archive.providerCompanies()) {
      try {
        await this.tenant.run(c, () => fn(c));
      } catch (e) {
        this.logger.warn(`company ${c}: ${(e as Error).message}`);
      }
    }
  }

  @Interval('ebelge-outbox', 20_000)
  outbox() {
    return this.once('outbox', async () => {
      const r = await this.edocs.processOutbox(25, undefined, { automatic: true });
      if (r.processed) this.logger.log(`outbox: ${r.sent} sent, ${r.failed} failed`);
    });
  }

  @Interval('ebelge-status', 60_000)
  statuses() {
    return this.once('status', () => this.eachCompany((c) => this.edocs.pollStatuses(c)));
  }

  @Cron('0 */15 * * * *')
  fetchInbox() {
    return this.once('inbox', () => this.eachCompany((c) => this.inbox.fetch(c)));
  }

  @Cron('0 5 * * * *')
  hourly() {
    return this.once('hourly', () =>
      this.eachCompany(async (c) => {
        await this.inbox.autoAccept(c);
        const due = (await this.edocs.matbudanDeadlines(c)).filter((x) => x.overdue || x.deadlineAt.getTime() - Date.now() < 6 * 3600_000);
        if (due.length) this.gateway.emitToCompany(c, 'ebelge_matbudan_deadline', { documents: due });
      }),
    );
  }

  @Cron('0 30 3 * * *', { timeZone: 'Europe/Istanbul' })
  integrity() {
    return this.once('integrity', () => this.eachCompany((c) => this.archive.integrityCheck(c)));
  }
}
