import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../i18n/app-error';
import { OtvCodeEntity, TaxExemptionCodeEntity, WithholdingCodeEntity } from '../../entities/tax-code.entity';
import { isDateKey, todayKey } from '../tr';

export type TaxCodeKind = 'exemptions' | 'withholdings' | 'otv';
type CodeRow = { code: string; validFrom: string; validTo?: string | null };

const ENTITY = { exemptions: TaxExemptionCodeEntity, withholdings: WithholdingCodeEntity, otv: OtvCodeEntity } as const;

/** Version of each code valid on `date` (latest validFrom on or before it). */
export function codesValidOn<T extends CodeRow>(rows: T[], date: string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const from = String(r.validFrom).slice(0, 10);
    const to = r.validTo ? String(r.validTo).slice(0, 10) : null;
    if (from > date || (to && to < date)) continue;
    const cur = best.get(r.code);
    if (!cur || String(cur.validFrom) < from) best.set(r.code, r);
  }
  return [...best.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Read access to the global UBL-TR code tables (exemption, withholding, ÖTV) with a
 * small in-process cache; super administrators add new versions (never edit rows).
 */
@Injectable()
export class TaxCodeService {
  private cache = new Map<TaxCodeKind, { at: number; rows: CodeRow[] }>();

  constructor(private readonly dataSource: DataSource) {}

  private async all<T extends CodeRow>(kind: TaxCodeKind, manager?: EntityManager): Promise<T[]> {
    const hit = this.cache.get(kind);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.rows as T[];
    const rows = (await (manager || this.dataSource.manager).find(ENTITY[kind] as any, { order: { code: 'ASC', validFrom: 'ASC' } })) as T[];
    this.cache.set(kind, { at: Date.now(), rows });
    return rows;
  }

  async list(kind: TaxCodeKind, date?: string, includeHistory = false): Promise<CodeRow[]> {
    const rows = await this.all(kind);
    if (includeHistory) return rows;
    return codesValidOn(rows, date && isDateKey(date) ? date : todayKey());
  }

  async exemption(code: string, date: string, manager?: EntityManager): Promise<TaxExemptionCodeEntity> {
    const row = codesValidOn(await this.all<TaxExemptionCodeEntity>('exemptions', manager), date).find((r) => r.code === code);
    if (!row) throw new BadRequestException(err('EXEMPTION_CODE_INVALID', { code }));
    return row;
  }

  async withholding(code: string, date: string, manager?: EntityManager): Promise<WithholdingCodeEntity> {
    const row = codesValidOn(await this.all<WithholdingCodeEntity>('withholdings', manager), date).find((r) => r.code === code);
    if (!row) throw new BadRequestException(err('WITHHOLDING_CODE_INVALID', { code }));
    return row;
  }

  async otv(code: string, date: string, manager?: EntityManager): Promise<OtvCodeEntity> {
    const row = codesValidOn(await this.all<OtvCodeEntity>('otv', manager), date).find((r) => r.code === code);
    if (!row) throw new BadRequestException(err('OTV_CODE_INVALID', { code }));
    return row;
  }

  /** Adds a new version of a code (super administrator); the previous open version is closed the day before. */
  async addVersion(kind: TaxCodeKind, input: Record<string, unknown>): Promise<CodeRow> {
    const code = String(input['code'] || '').trim();
    const validFrom = String(input['validFrom'] || '');
    if (!code || !isDateKey(validFrom)) throw new BadRequestException(err('VALIDATION_FAILED'));
    const saved = await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ENTITY[kind] as any);
      if (await repo.exist({ where: { code, validFrom } })) throw new ConflictException(err('TAX_CODE_VERSION_EXISTS', { code, date: validFrom }));
      const prev = (await repo.find({ where: { code }, order: { validFrom: 'DESC' } })) as CodeRow[];
      const open = prev.find((p) => !p.validTo && String(p.validFrom) < validFrom);
      if (open) {
        const d = new Date(`${validFrom}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        await repo.update({ code, validFrom: open.validFrom } as any, { validTo: d.toISOString().slice(0, 10) } as any);
      }
      return (await repo.save(repo.create({ ...input, code, validFrom } as any))) as unknown as CodeRow;
    });
    this.cache.delete(kind);
    return saved;
  }
}
