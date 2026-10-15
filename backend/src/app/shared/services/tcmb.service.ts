import { BadGatewayException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../i18n/app-error';
import { CompanyEntity } from '../../entities/company.entity';
import { isWeekend, parseTcmbXml, tcmbBulletinPath, TcmbBulletin } from '../finance/currency';
import { addDays, todayKey, zonedDayStart } from '../tr';

const RATE_TYPES: [keyof Omit<TcmbBulletin['rates'][number], 'currency'>, string][] = [
  ['forexBuying', 'FOREX_BUYING'],
  ['forexSelling', 'FOREX_SELLING'],
];

/** 15:30 Europe/Istanbul on the bulletin day (TCMB announcement time). */
function announcedAt(date: string): Date {
  return new Date(zonedDayStart(date, 'Europe/Istanbul').getTime() + (15 * 60 + 30) * 60_000);
}

/**
 * TCMB indicative exchange rates (gösterge niteliğindeki kurlar). Every business day after
 * the 15:30 announcement the bulletin is fetched and stored per TR company with
 * fxAutoFetch as source TCMB (FOREX_BUYING is the one used for VAT; selling kept for
 * reference). No bulletin on weekends / public holidays: the last rate stays valid.
 * Set TCMB_FETCH_DISABLED=true to switch the scheduler off (tests, offline dev).
 */
@Injectable()
export class TcmbService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TcmbService.name);
  private readonly baseUrl = (process.env['TCMB_BASE_URL'] || 'https://www.tcmb.gov.tr/kurlar').replace(/\/$/, '');

  constructor(private readonly dataSource: DataSource) {}

  private get disabled(): boolean {
    return process.env['TCMB_FETCH_DISABLED'] === 'true' || process.env['NODE_ENV'] === 'test';
  }

  onApplicationBootstrap() {
    if (this.disabled) return;
    // Catch up after downtime (non-blocking).
    setTimeout(() => this.fetchForAll().catch((e) => this.logger.warn(`TCMB catch-up failed: ${(e as Error).message}`)), 5000);
  }

  @Cron('0 45 15 * * 1-5', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (this.disabled) return;
    try {
      await this.fetchForAll();
    } catch (e) {
      this.logger.warn(`TCMB fetch failed: ${(e as Error).message}`);
    }
  }

  /** Downloads one bulletin: `date` (YYYY-MM-DD) from the archive, else today.xml. */
  async download(date?: string | null): Promise<TcmbBulletin> {
    const url = date ? `${this.baseUrl}/${tcmbBulletinPath(date)}` : `${this.baseUrl}/today.xml`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw new BadGatewayException(err('TCMB_FETCH_FAILED', { reason: (e as Error).message }));
    }
    // Archive answers 404 for weekends / holidays.
    if (!res.ok) throw new BadGatewayException(err('TCMB_FETCH_FAILED', { reason: `HTTP ${res.status}` }));
    try {
      return parseTcmbXml(await res.text());
    } catch {
      throw new BadGatewayException(err('TCMB_FETCH_FAILED', { reason: 'XML' }));
    }
  }

  /** Stores a bulletin for one company (upsert per currency / day / rate type). Returns rows written. */
  async store(manager: EntityManager, companyId: string, b: TcmbBulletin): Promise<number> {
    let n = 0;
    for (const r of b.rates) {
      for (const [field, rateType] of RATE_TYPES) {
        const rate = r[field];
        if (!rate) continue;
        await manager.query(
          'INSERT INTO `exchange_rates` (`id`, `companyId`, `baseCurrency`, `quoteCurrency`, `rate`, `date`, `source`, `rateType`, `announcedAt`, `bulletinNo`) ' +
            "VALUES (?, ?, ?, 'TRY', ?, ?, 'TCMB', ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE `rate` = VALUES(`rate`), `source` = 'TCMB', `announcedAt` = VALUES(`announcedAt`), `bulletinNo` = VALUES(`bulletinNo`)",
          [randomUUID(), companyId, r.currency, rate, b.date, rateType, announcedAt(b.date), b.bulletinNo],
        );
        n++;
      }
    }
    return n;
  }

  /** Fetches the bulletin (default today.xml) for one company. */
  async fetchForCompany(companyId: string, date?: string | null): Promise<{ date: string; bulletinNo: string | null; count: number }> {
    const b = await this.download(date);
    const count = await this.store(this.dataSource.manager, companyId, b);
    return { date: b.date, bulletinNo: b.bulletinNo, count };
  }

  /** Scheduled run: today's bulletin for every TR company with automatic fetching. */
  async fetchForAll(): Promise<number> {
    const companies = await this.dataSource.manager.find(CompanyEntity, { where: { country: 'TR', fxAutoFetch: true }, select: ['id'] });
    if (!companies.length) return 0;
    const b = await this.download();
    let n = 0;
    for (const c of companies) n += await this.store(this.dataSource.manager, c.id, b);
    this.logger.log(`TCMB bulletin ${b.bulletinNo} (${b.date}) stored for ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}`);
    return n;
  }

  /** Past days for which the TCMB archive answered 404 (holiday: no bulletin). */
  private readonly noBulletin = new Set<string>();
  /** `companyId|day` of past archive bulletins already stored (a past bulletin never changes). */
  private readonly stored = new Map<string, string>();

  /** One archive day: the bulletin, 'NONE' (HTTP 404 = not published) or 'ERROR' (offline / other). */
  private async tryArchiveDay(day: string): Promise<TcmbBulletin | 'NONE' | 'ERROR'> {
    if (isWeekend(day) || this.noBulletin.has(day)) return 'NONE';
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/${tcmbBulletinPath(day)}`, { signal: AbortSignal.timeout(15000) });
    } catch {
      return 'ERROR';
    }
    if (res.status === 404) {
      if (day < todayKey('Europe/Istanbul')) this.noBulletin.add(day);
      return 'NONE';
    }
    if (!res.ok) return 'ERROR';
    try {
      return parseTcmbXml(await res.text());
    } catch {
      return 'ERROR';
    }
  }

  /**
   * Newest bulletin in (`after`, `upTo`] from the TCMB archive, stored for the company. Walks back
   * day by day (at most 15). `confirmed` = every weekday after the bulletin found (or after `after`)
   * up to `upTo` was answered with "no bulletin" (public holiday), so an older stored rate is the
   * legally applicable one; false when the archive could not be reached.
   */
  async latestBulletin(companyId: string, after: string | null, upTo: string, manager?: EntityManager): Promise<{ date: string | null; confirmed: boolean }> {
    if (this.disabled) return { date: null, confirmed: false };
    let confirmed = true;
    for (let i = 0; i < 15; i++) {
      const day = addDays(upTo, -i);
      if (after && day <= after) break;
      const known = this.stored.get(`${companyId}|${day}`);
      if (known) return { date: known, confirmed };
      const r = await this.tryArchiveDay(day);
      if (r === 'NONE') continue;
      if (r === 'ERROR') {
        confirmed = false;
        continue;
      }
      await this.store(manager || this.dataSource.manager, companyId, r);
      // Only rows committed right away are remembered (a document transaction may still roll back).
      if (day < todayKey('Europe/Istanbul') && !manager?.queryRunner?.isTransactionActive) this.stored.set(`${companyId}|${day}`, r.date);
      return { date: r.date, confirmed };
    }
    return { date: null, confirmed: confirmed && !!after };
  }
}
