import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { err } from '../i18n/app-error';
import { LegalParameterEntity } from '../../entities/legal-parameter.entity';
import { ANNUAL_PARAMETER_KEYS, OBLIGATION_PARAMETER_KEYS, SPECIAL_TAX_IDS_KEY } from '../legal/legal-parameter-seeds';
import { addDays, isDateKey, ObligationParams, SpecialTaxId, todayKey } from '../tr';
import { setSpecialTaxIds } from '../identity/validators';

export interface CreateLegalParameterInput {
  country?: string;
  key: string;
  validFrom: string;
  validTo?: string | null;
  value: unknown;
  sourceRef: string;
  confidence?: string;
  note?: string | null;
}

/** Row whose [validFrom, validTo] range contains `date`. */
export function pickParameter<T extends Pick<LegalParameterEntity, 'validFrom' | 'validTo'>>(rows: T[], date: string): T | null {
  return (
    rows
      .filter((r) => String(r.validFrom).slice(0, 10) <= date && (!r.validTo || String(r.validTo).slice(0, 10) >= date))
      .sort((a, b) => (String(a.validFrom) < String(b.validFrom) ? 1 : -1))[0] ?? null
  );
}

/**
 * Versioned legal parameters (global, per country). Values are cached per
 * country and refreshed on every change. `param()` throws LEGAL_PARAMETER_MISSING
 * (422) so a missing yearly value is never silently replaced by a default.
 */
@Injectable()
export class LegalParameterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegalParameterService.name);
  private cache = new Map<string, LegalParameterEntity[]>();

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    try {
      await this.refreshSpecialIds();
    } catch (e) {
      this.logger.warn(`legal parameters not loaded: ${(e as Error).message}`);
    }
  }

  private async rows(country = 'TR'): Promise<LegalParameterEntity[]> {
    const c = country.toUpperCase();
    let rows = this.cache.get(c);
    if (!rows) {
      rows = await this.dataSource.manager.find(LegalParameterEntity, { where: { country: c }, order: { key: 'ASC', validFrom: 'ASC' } });
      this.cache.set(c, rows);
    }
    return rows;
  }

  invalidate() {
    this.cache.clear();
  }

  async refreshSpecialIds() {
    const value = await this.paramOrNull(SPECIAL_TAX_IDS_KEY, todayKey(), 'TR');
    setSpecialTaxIds(Array.isArray(value) ? (value as SpecialTaxId[]) : []);
  }

  async paramOrNull<T = unknown>(key: string, date: string = todayKey(), country = 'TR'): Promise<T | null> {
    const row = pickParameter((await this.rows(country)).filter((r) => r.key === key), date);
    return row ? (row.value as T) : null;
  }

  /** Value valid on `date` (YYYY-MM-DD); throws 422 LEGAL_PARAMETER_MISSING when none. */
  async param<T = unknown>(key: string, date: string = todayKey(), country = 'TR'): Promise<T> {
    const v = await this.paramOrNull<T>(key, date, country);
    if (v === null || v === undefined) throw new UnprocessableEntityException(err('LEGAL_PARAMETER_MISSING', { key, date }));
    return v;
  }

  async list(country?: string, key?: string): Promise<LegalParameterEntity[]> {
    const where: Record<string, string> = {};
    if (country) where['country'] = country.toUpperCase();
    if (key) where['key'] = key;
    return this.dataSource.manager.find(LegalParameterEntity, { where, order: { country: 'ASC', key: 'ASC', validFrom: 'DESC' } });
  }

  /** Annual keys without a value covering 1 January of `year`. */
  async missingAnnual(year: number, country = 'TR'): Promise<string[]> {
    const rows = await this.rows(country);
    if (!rows.length) return [];
    const date = `${year}-01-01`;
    return ANNUAL_PARAMETER_KEYS.filter((k) => !pickParameter(rows.filter((r) => r.key === k), date));
  }

  /**
   * Adds a new version. An open-ended (or overlapping) previous version is closed
   * the day before; when a later version exists the new one ends the day before it.
   */
  async create(input: CreateLegalParameterInput, username?: string): Promise<LegalParameterEntity> {
    const country = (input.country || 'TR').toUpperCase();
    const key = String(input.key || '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(key)) throw new BadRequestException(err('LEGAL_PARAMETER_INVALID', { reason: 'key' }));
    if (!isDateKey(input.validFrom)) throw new BadRequestException(err('LEGAL_PARAMETER_INVALID', { reason: 'validFrom' }));
    if (input.validTo && (!isDateKey(input.validTo) || input.validTo < input.validFrom)) {
      throw new BadRequestException(err('LEGAL_PARAMETER_INVALID', { reason: 'validTo' }));
    }
    if (!input.sourceRef || !String(input.sourceRef).trim()) throw new BadRequestException(err('LEGAL_PARAMETER_INVALID', { reason: 'sourceRef' }));
    if (input.value === undefined || input.value === null || input.value === '') throw new BadRequestException(err('LEGAL_PARAMETER_INVALID', { reason: 'value' }));

    const saved = await this.dataSource.transaction(async (m) => {
      const existing = await m.find(LegalParameterEntity, { where: { country, key }, order: { validFrom: 'ASC' }, lock: { mode: 'pessimistic_write' } });
      if (existing.some((r) => String(r.validFrom).slice(0, 10) === input.validFrom)) {
        throw new BadRequestException(err('LEGAL_PARAMETER_OVERLAP', { key, date: input.validFrom }));
      }
      let validTo = input.validTo || null;
      const next = existing.find((r) => String(r.validFrom).slice(0, 10) > input.validFrom);
      if (next) {
        const limit = addDays(String(next.validFrom).slice(0, 10), -1);
        if (validTo && validTo > limit) throw new BadRequestException(err('LEGAL_PARAMETER_OVERLAP', { key, date: String(next.validFrom).slice(0, 10) }));
        validTo = validTo || limit;
      }
      for (const prev of existing.filter((r) => String(r.validFrom).slice(0, 10) < input.validFrom)) {
        if (!prev.validTo || String(prev.validTo).slice(0, 10) >= input.validFrom) {
          prev.validTo = addDays(input.validFrom, -1);
          await m.save(LegalParameterEntity, prev);
        }
      }
      return m.save(
        LegalParameterEntity,
        m.create(LegalParameterEntity, {
          country,
          key,
          validFrom: input.validFrom,
          validTo,
          value: input.value,
          sourceRef: String(input.sourceRef).trim().slice(0, 255),
          confidence: ['high', 'medium', 'low'].includes(String(input.confidence)) ? String(input.confidence) : 'high',
          note: input.note ? String(input.note).slice(0, 500) : null,
          createdBy: username ?? null,
        }),
      );
    });
    this.invalidate();
    if (key === SPECIAL_TAX_IDS_KEY) await this.refreshSpecialIds();
    return saved;
  }

  /** Inputs of computeObligations() for `country`, resolved per revenue year / date. */
  async obligationParams(country = 'TR', today: string = todayKey()): Promise<{ params: ObligationParams; sources: Record<string, string> }> {
    const rows = await this.rows(country);
    const K = OBLIGATION_PARAMETER_KEYS;
    const of = (key: string, date: string) => pickParameter(rows.filter((r) => r.key === key), date);
    const num = (key: string, date: string): number | null => {
      const r = of(key, date);
      return r && Number.isFinite(Number(r.value)) ? Number(r.value) : null;
    };
    const str = (key: string, date: string): string | null => {
      const r = of(key, date);
      return r ? String(r.value) : null;
    };
    const paperRow = of(K.paperLimit, today);
    const params: ObligationParams = {
      eFaturaThreshold: (y) => num(K.eFaturaThreshold, `${y}-12-31`),
      eIrsaliyeThreshold: (y) => num(K.eIrsaliyeThreshold, `${y}-12-31`),
      allInvoicesElectronicFrom: {
        BILANCO: str(K.allInvoicesBilanco, today),
        ISLETME: str(K.allInvoicesIsletmeBasit, today),
        BASIT: str(K.allInvoicesIsletmeBasit, today),
      },
      paperInvoiceLimit: paperRow ? { amount: Number(paperRow.value), until: paperRow.validTo ? String(paperRow.validTo).slice(0, 10) : null } : null,
      thresholdStartMonthDay: str(K.startMonthDay, today) || '07-01',
      transitionMonths: num(K.transitionMonths, today) ?? 3,
      toleranceDayEFatura: num(K.toleranceDay, today) ?? 7,
    };
    const sources: Record<string, string> = {};
    for (const key of Object.values(K)) {
      const r = of(key, today) || rows.filter((x) => x.key === key).slice(-1)[0];
      if (r) sources[key] = `${r.sourceRef}${r.confidence !== 'high' ? ` [${r.confidence}]` : ''}`;
    }
    return { params, sources };
  }
}
