import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { DocumentSeriesEntity, DocumentSequenceEntity } from '../../entities/document-series.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { CompanyEBelgeProfileEntity } from '../../entities/company-ebelge-profile.entity';
import { computeObligations, formatDocumentNumber, isValidExternalDocNo, isValidSeriesFor, PAPER_REASONS, todayKey } from '../../shared/tr';

export interface NextNumber {
  documentNo: string;
  seriesCode: string;
  sequence: number;
  mode: string;
}

/** Tables whose documentNo is unique per company (duplicate check for external / provider numbers). */
const NUMBERED_TABLES: Record<string, string> = {
  INVOICE: 'invoices',
  DESPATCH: 'despatches',
  EXPENSE_VOUCHER: 'expense_vouchers',
  PRODUCER_RECEIPT: 'expense_vouchers',
};

/**
 * Gap-free document numbers (VUK 231/1; 509 V.4). The counter row of (company, kind, mode,
 * series, year) is locked with SELECT ... FOR UPDATE inside the caller's transaction, so
 * concurrent issues get consecutive numbers and a rolled-back issue releases its number.
 * EDOCUMENT / INTERNAL counters restart at 1 every calendar year; PAPER counters do not.
 */
@Injectable()
export class DocumentNumberService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly legalParams: LegalParameterService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** Series codes that may not be used (legal parameter DOCUMENT_SERIES_FORBIDDEN, TR). */
  async forbiddenSeries(country = 'TR', date = todayKey()): Promise<string[]> {
    try {
      const v = await this.legalParams.param<string[]>('DOCUMENT_SERIES_FORBIDDEN', date, country);
      return Array.isArray(v) ? v.map((x) => String(x).toUpperCase()) : [];
    } catch {
      return [];
    }
  }

  async validateSeriesCode(mode: string, code: string, country = 'TR'): Promise<void> {
    if (!isValidSeriesFor(mode, code)) throw new BadRequestException(err('SERIES_CODE_INVALID', { code }));
    if (mode !== 'INTERNAL' && (await this.forbiddenSeries(country)).includes(code)) {
      throw new BadRequestException(err('SERIES_CODE_FORBIDDEN', { code }));
    }
  }

  /**
   * The series to use: the explicit code (must be an active series of that kind / mode), else the
   * series of the warehouse (despatch), else the default one.
   */
  async resolveSeries(manager: EntityManager, kind: string, mode: string, explicit?: string | null, warehouseSeries?: string | null): Promise<string> {
    const rows = await manager.find(DocumentSeriesEntity, { where: { companyId: this.companyId, kind, mode, isActive: true } });
    const pick = (code?: string | null) => (code ? rows.find((r) => r.seriesCode === code.toUpperCase()) : undefined);
    if (explicit) {
      const row = pick(explicit);
      if (!row) throw new BadRequestException(err('SERIES_NOT_FOUND', { kind, mode }));
      return row.seriesCode;
    }
    const row = pick(warehouseSeries) || rows.find((r) => r.isDefault) || rows[0];
    if (!row) throw new BadRequestException(err('SERIES_NOT_FOUND', { kind, mode }));
    return row.seriesCode;
  }

  /**
   * Next number of the series for a document dated `date` (YYYY-MM-DD). Must run inside the
   * transaction that saves the document. Refuses a date before the last numbered document of the
   * series (DOCUMENT_DATE_BEFORE_LAST, good practice of VUK 231 / 509 V.4).
   */
  async next(manager: EntityManager, kind: string, mode: string, seriesCode: string, date: string): Promise<NextNumber> {
    const company = await manager.findOne(CompanyEntity, { where: { id: this.companyId }, select: ['id', 'country'] });
    await this.validateSeriesCode(mode, seriesCode, company?.country || 'TR');
    const year = mode === 'PAPER' ? 0 : Number(date.slice(0, 4));
    const key = { companyId: this.companyId, kind, mode, seriesCode, year };
    // A missing counter (first document of the series / year) is created inside this transaction with
    // an upsert, which takes the row's exclusive lock directly: concurrent first issues queue on it
    // instead of upgrading shared locks (deadlock), and no second pool connection is needed.
    const exists = await manager.query(
      'SELECT 1 AS x FROM `document_sequences` WHERE `companyId` = ? AND `kind` = ? AND `mode` = ? AND `seriesCode` = ? AND `year` = ?',
      [this.companyId, kind, mode, seriesCode, year],
    );
    if (!exists?.length) {
      await manager.query(
        'INSERT INTO `document_sequences` (`id`, `companyId`, `kind`, `mode`, `seriesCode`, `year`, `lastNumber`) VALUES (?, ?, ?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE `id` = `id`',
        [randomUUID(), this.companyId, kind, mode, seriesCode, year],
      );
    }
    const seq = await manager.findOneOrFail(DocumentSequenceEntity, { where: key, lock: { mode: 'pessimistic_write' } });
    const last = seq.lastDate ? String(seq.lastDate).slice(0, 10) : null;
    if (last && date < last) throw new BadRequestException(err('DOCUMENT_DATE_BEFORE_LAST', { series: seriesCode, last, date }));
    const n = Number(seq.lastNumber) + 1;
    await manager.update(DocumentSequenceEntity, { id: seq.id }, { lastNumber: n, lastDate: last && last > date ? last : date });
    return { documentNo: formatDocumentNumber(mode, seriesCode, year, n), seriesCode, sequence: n, mode };
  }

  /**
   * A number given by an external system (GİB portal, accounting package, integrator) or printed on
   * a paper form: format check and uniqueness within the company (409 DOCUMENT_NUMBER_DUPLICATE).
   */
  async assertExternalNumber(manager: EntityManager, kind: string, documentNo: string, exceptId?: string | null): Promise<string> {
    const no = String(documentNo || '').trim();
    if (!isValidExternalDocNo(no)) throw new BadRequestException(err('DOCUMENT_NUMBER_INVALID', { number: no }));
    await this.assertUnique(manager, kind, no, exceptId);
    return no;
  }

  async assertUnique(manager: EntityManager, kind: string, documentNo: string, exceptId?: string | null): Promise<void> {
    const table = NUMBERED_TABLES[kind];
    if (!table) return;
    const rows: { id: string }[] = await manager.query(`SELECT \`id\` FROM \`${table}\` WHERE \`companyId\` = ? AND \`documentNo\` = ?`, [this.companyId, documentNo]);
    if (rows.some((r) => r.id !== exceptId)) throw new ConflictException(err('DOCUMENT_NUMBER_DUPLICATE', { number: documentNo }));
  }

  /**
   * e-Belge obligation on `date` that rules out the company's own paper series for an invoice /
   * despatch advice (509 IV.2.4.3 / IV.3.5; computeObligations with the company's e-Belge profile
   * and bookkeeping type). Null when paper is still allowed. `amountTry`: invoice total incl. taxes
   * (paper invoices are capped while the paper limit applies).
   */
  async electronicObligation(
    manager: EntityManager,
    company: Pick<CompanyEntity, 'id' | 'country' | 'bookkeepingType'>,
    kind: string,
    date: string,
    amountTry?: number | null,
  ): Promise<{ kind: string; reason: string } | null> {
    if ((company.country || 'TR').toUpperCase() !== 'TR' || (kind !== 'INVOICE' && kind !== 'DESPATCH')) return null;
    let rep: ReturnType<typeof computeObligations>;
    try {
      const profile = await manager.findOne(CompanyEBelgeProfileEntity, { where: { companyId: company.id } });
      const { params } = await this.legalParams.obligationParams('TR', date);
      rep = computeObligations(profile as any, company.bookkeepingType, date, params);
    } catch {
      return null; // obligation data unavailable: the compliance panel reports it (EBELGE_* alerts)
    }
    const started = (o: { activeSince: string | null; mandatoryFrom: string | null; reason: string | null }) =>
      o.activeSince ? 'ACTIVE' : o.mandatoryFrom && o.mandatoryFrom <= date ? o.reason || 'MANDATORY' : null;
    if (kind === 'DESPATCH') {
      const why = started(rep.eIrsaliye);
      return why ? { kind: 'e-İrsaliye', reason: why } : null;
    }
    if (!rep.paperInvoice.allowed) {
      const why = started(rep.eFatura) || started(rep.eArsiv) || 'MANDATORY';
      return { kind: 'e-Fatura / e-Arşiv', reason: why };
    }
    const limit = rep.paperInvoice.limit;
    if (limit !== null && limit !== undefined && amountTry !== null && amountTry !== undefined && Number(amountTry) > Number(limit)) {
      return { kind: 'e-Arşiv', reason: `LIMIT ${limit} TL` };
    }
    return null;
  }

  /**
   * Number for a legal document being approved / issued:
   *  - e-Belge mode PROVIDER: next EDOCUMENT number (paperFallback: PAPER series, 509 V.7);
   *  - mode NONE: the number of the external system (GİB portal / integrator) when given (checked
   *    for duplicates), else the next number of the PAPER series. The PAPER series is refused for
   *    an invoice / despatch advice once the company is obliged to use e-documents, unless a 509 V.7
   *    reason (`paperReason`) is given (422 EDOCUMENT_REQUIRED).
   */
  async assign(
    manager: EntityManager,
    company: Pick<CompanyEntity, 'eDocumentMode'> & Partial<Pick<CompanyEntity, 'id' | 'country' | 'bookkeepingType'>>,
    kind: string,
    date: string,
    opts: {
      externalDocNo?: string | null;
      seriesCode?: string | null;
      warehouseSeries?: string | null;
      paperFallback?: boolean;
      paperReason?: string | null;
      amountTry?: number | null;
      exceptId?: string | null;
    } = {},
  ): Promise<{ documentNo: string; seriesCode: string | null; numberMode: string }> {
    if (company.eDocumentMode === 'PROVIDER' && !opts.paperFallback) {
      const code = await this.resolveSeries(manager, kind, 'EDOCUMENT', opts.seriesCode, opts.warehouseSeries);
      const n = await this.next(manager, kind, 'EDOCUMENT', code, date);
      return { documentNo: n.documentNo, seriesCode: code, numberMode: 'EDOCUMENT' };
    }
    if (opts.externalDocNo && String(opts.externalDocNo).trim()) {
      const no = await this.assertExternalNumber(manager, kind, String(opts.externalDocNo), opts.exceptId);
      return { documentNo: no, seriesCode: null, numberMode: 'EXTERNAL' };
    }
    if (company.id && company.eDocumentMode !== 'PROVIDER') {
      const reasonOk = !!opts.paperReason && (PAPER_REASONS as readonly string[]).includes(opts.paperReason);
      const ob = reasonOk ? null : await this.electronicObligation(manager, company as CompanyEntity, kind, date, opts.amountTry);
      if (ob) throw new UnprocessableEntityException(err('EDOCUMENT_REQUIRED', { date, kind: ob.kind, reason: ob.reason }));
    }
    const code = await this.resolveSeries(manager, kind, 'PAPER', opts.seriesCode, opts.warehouseSeries);
    const n = await this.next(manager, kind, 'PAPER', code, date);
    await this.assertUnique(manager, kind, n.documentNo, opts.exceptId);
    return { documentNo: n.documentNo, seriesCode: code, numberMode: 'PAPER' };
  }

  // ------------------------------------------------------------------ series admin
  list(): Promise<DocumentSeriesEntity[]> {
    return this.dataSource.manager.find(DocumentSeriesEntity, { where: { companyId: this.companyId }, order: { kind: 'ASC', mode: 'ASC', seriesCode: 'ASC' } });
  }

  async counters(): Promise<DocumentSequenceEntity[]> {
    return this.dataSource.manager.find(DocumentSequenceEntity, { where: { companyId: this.companyId }, order: { kind: 'ASC', seriesCode: 'ASC', year: 'DESC' } });
  }

  async create(dto: { kind: string; mode: string; seriesCode: string; isDefault?: boolean; warehouseId?: string | null; note?: string | null }): Promise<DocumentSeriesEntity> {
    const code = String(dto.seriesCode || '').toUpperCase();
    const company = await this.dataSource.manager.findOne(CompanyEntity, { where: { id: this.companyId } });
    await this.validateSeriesCode(dto.mode, code, company?.country || 'TR');
    return this.dataSource.transaction(async (m) => {
      if (await m.exists(DocumentSeriesEntity, { where: { companyId: this.companyId, kind: dto.kind, mode: dto.mode, seriesCode: code } })) {
        throw new ConflictException(err('SERIES_EXISTS', { code }));
      }
      const hasAny = await m.exists(DocumentSeriesEntity, { where: { companyId: this.companyId, kind: dto.kind, mode: dto.mode } });
      const isDefault = !!dto.isDefault || !hasAny;
      if (isDefault) await m.update(DocumentSeriesEntity, { companyId: this.companyId, kind: dto.kind, mode: dto.mode }, { isDefault: false });
      return m.save(DocumentSeriesEntity, m.create(DocumentSeriesEntity, {
        companyId: this.companyId, kind: dto.kind, mode: dto.mode, seriesCode: code, isDefault, isActive: true, warehouseId: dto.warehouseId || null, note: dto.note || null,
      }));
    });
  }

  async update(id: string, dto: { isDefault?: boolean; isActive?: boolean; note?: string | null; warehouseId?: string | null }): Promise<DocumentSeriesEntity> {
    return this.dataSource.transaction(async (m) => {
      const row = await m.findOne(DocumentSeriesEntity, { where: { companyId: this.companyId, id } });
      if (!row) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
      if (dto.isDefault) {
        await m.update(DocumentSeriesEntity, { companyId: this.companyId, kind: row.kind, mode: row.mode }, { isDefault: false });
        row.isDefault = true;
        row.isActive = true;
      }
      if (dto.isActive !== undefined) row.isActive = dto.isActive;
      if (dto.note !== undefined) row.note = dto.note || null;
      if (dto.warehouseId !== undefined) row.warehouseId = dto.warehouseId || null;
      return m.save(DocumentSeriesEntity, row);
    });
  }

  /** Seeds the default PAPER / INTERNAL series of a new company (idempotent). */
  async ensureDefaults(manager: EntityManager, companyId: string, defaults: { kind: string; mode: string; seriesCode: string; note: string }[]): Promise<void> {
    const existing = await manager.find(DocumentSeriesEntity, { where: { companyId, kind: In(defaults.map((d) => d.kind)) } });
    for (const d of defaults) {
      if (existing.some((e) => e.kind === d.kind && e.mode === d.mode)) continue;
      await manager.save(DocumentSeriesEntity, manager.create(DocumentSeriesEntity, { companyId, ...d, isDefault: true, isActive: true }));
    }
  }
}
