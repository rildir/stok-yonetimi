import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { SecurityIncidentEntity } from '../../entities/kvkk.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { kvkkHoursLeft, maskIdentifier, todayKey } from '../../shared/tr';

export interface IncidentInput {
  title?: string;
  description?: string | null;
  severity?: string;
  awareAt?: string | null;
  dataCategories?: string[] | null;
  affectedSubjectTypes?: string[] | null;
  affectedCount?: number | null;
  affectedFrom?: string | null;
  affectedTo?: string | null;
  boardNotifiedAt?: string | null;
  boardNotificationRef?: string | null;
  subjectsNotifiedAt?: string | null;
  measures?: string | null;
}

const OPEN = ['SUSPECTED', 'CONFIRMED', 'NOTIFIED'];

/**
 * Personal-data breach register (R63, KVKK md. 12/5; Kurul Kararı 2019/10): the 72-hour deadline
 * for notifying the Board runs from awareAt (KVKK_BREACH_NOTIFY_HOURS). Alerts (SecurityAlertService)
 * open SUSPECTED incidents; an administrator confirms (starts the clock) or dismisses them.
 */
@Injectable()
export class IncidentService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly tenant: TenantContext, private readonly legal: LegalParameterService) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  private present(i: SecurityIncidentEntity, now = new Date()) {
    const clock = i.deadlineAt && ['CONFIRMED'].includes(i.status);
    return { ...i, hoursLeft: clock ? kvkkHoursLeft(i.deadlineAt as Date, now) : null, overdue: !!clock && new Date(i.deadlineAt as Date).getTime() < now.getTime() };
  }

  async list() {
    const rows = await this.ds.manager.find(SecurityIncidentEntity, { where: { companyId: this.companyId }, order: { detectedAt: 'DESC' }, take: 200 });
    return rows.map((r) => this.present(r));
  }

  private async find(id: string) {
    const i = await this.ds.manager.findOne(SecurityIncidentEntity, { where: { id, companyId: this.companyId } });
    if (!i) throw new NotFoundException(err('INCIDENT_NOT_FOUND'));
    return i;
  }

  async get(id: string) {
    return this.present(await this.find(id));
  }

  private async deadline(awareAt: Date): Promise<Date> {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const hours = Number((await this.legal.paramOrNull<number>('KVKK_BREACH_NOTIFY_HOURS', todayKey(c.timezone, awareAt), c.country || 'TR')) ?? 72);
    return new Date(awareAt.getTime() + hours * 3600000);
  }

  private apply(i: SecurityIncidentEntity, input: IncidentInput) {
    const d = (v: string | null | undefined) => (v ? new Date(v) : null);
    if (input.title !== undefined) i.title = input.title;
    if (input.description !== undefined) i.description = input.description || null;
    if (input.severity !== undefined && ['LOW', 'MEDIUM', 'HIGH'].includes(input.severity)) i.severity = input.severity;
    if (input.dataCategories !== undefined) i.dataCategories = input.dataCategories || null;
    if (input.affectedSubjectTypes !== undefined) i.affectedSubjectTypes = input.affectedSubjectTypes || null;
    if (input.affectedCount !== undefined) i.affectedCount = input.affectedCount ?? null;
    if (input.affectedFrom !== undefined) i.affectedFrom = d(input.affectedFrom);
    if (input.affectedTo !== undefined) i.affectedTo = d(input.affectedTo);
    if (input.boardNotifiedAt !== undefined) i.boardNotifiedAt = d(input.boardNotifiedAt);
    if (input.boardNotificationRef !== undefined) i.boardNotificationRef = input.boardNotificationRef || null;
    if (input.subjectsNotifiedAt !== undefined) i.subjectsNotifiedAt = d(input.subjectsNotifiedAt);
    if (input.measures !== undefined) i.measures = input.measures || null;
  }

  /** Manual record; with awareAt the incident is confirmed at once and the 72-hour clock starts. */
  async create(input: IncidentInput, username: string) {
    if (!input.title?.trim()) throw new BadRequestException(err('VALIDATION_FAILED'));
    return this.ds.transaction(async (m) => {
      const n = await m.count(SecurityIncidentEntity, { where: { companyId: this.companyId } });
      const i = m.create(SecurityIncidentEntity, { companyId: this.companyId, incidentNo: `IHL-${new Date().getUTCFullYear()}-${String(n + 1).padStart(4, '0')}`, title: input.title!.trim(), source: 'MANUAL', status: 'SUSPECTED', detectedAt: new Date(), createdBy: username });
      this.apply(i, input);
      if (input.awareAt) {
        i.awareAt = new Date(input.awareAt);
        i.deadlineAt = await this.deadline(i.awareAt);
        i.status = 'CONFIRMED';
      }
      return this.present(await m.save(SecurityIncidentEntity, i));
    });
  }

  async update(id: string, input: IncidentInput) {
    const i = await this.find(id);
    if (!OPEN.includes(i.status)) throw new BadRequestException(err('INCIDENT_TRANSITION_INVALID'));
    this.apply(i, input);
    if (i.boardNotifiedAt && i.status === 'CONFIRMED') i.status = 'NOTIFIED';
    return this.present(await this.ds.manager.save(SecurityIncidentEntity, i));
  }

  /** Confirms a (suspected) breach: awareAt defaults to now; deadline = awareAt + 72 h. */
  async confirm(id: string, awareAt?: string | null) {
    const i = await this.find(id);
    if (i.status !== 'SUSPECTED') throw new BadRequestException(err('INCIDENT_TRANSITION_INVALID'));
    i.awareAt = awareAt ? new Date(awareAt) : new Date();
    i.deadlineAt = await this.deadline(i.awareAt);
    i.status = 'CONFIRMED';
    return this.present(await this.ds.manager.save(SecurityIncidentEntity, i));
  }

  async dismiss(id: string, reason: string) {
    const i = await this.find(id);
    if (i.status !== 'SUSPECTED') throw new BadRequestException(err('INCIDENT_TRANSITION_INVALID'));
    i.status = 'DISMISSED';
    i.measures = [i.measures, reason ? `Değerlendirme: ${reason}` : null].filter(Boolean).join('\n') || null;
    i.closedAt = new Date();
    return this.present(await this.ds.manager.save(SecurityIncidentEntity, i));
  }

  async close(id: string) {
    const i = await this.find(id);
    if (!['CONFIRMED', 'NOTIFIED'].includes(i.status)) throw new BadRequestException(err('INCIDENT_TRANSITION_INVALID'));
    if (!i.boardNotifiedAt) throw new BadRequestException(err('INCIDENT_BOARD_NOTICE_REQUIRED'));
    i.status = 'CLOSED';
    i.closedAt = new Date();
    return this.present(await this.ds.manager.save(SecurityIncidentEntity, i));
  }

  /**
   * "Etkilenen kişiler": data subjects whose records existed in the affected window, by subject
   * type (customers, natural-person suppliers, users). Names are masked; counts feed the Board form.
   */
  async affected(id: string) {
    const i = await this.find(id);
    const to = i.affectedTo ?? i.awareAt ?? i.detectedAt;
    const types = i.affectedSubjectTypes?.length ? i.affectedSubjectTypes : ['CUSTOMER', 'SUPPLIER', 'USER'];
    const out: Record<string, { count: number; sample: { id: string; name: string; email: string | null }[] }> = {};
    const mask = (s: string | null) => (s ? `${s.slice(0, 1)}***` : '');
    if (types.includes('CUSTOMER')) {
      const rows: { id: string; name: string; email: string | null }[] = await this.ds.query('SELECT id, name, email FROM customers WHERE companyId = ? AND anonymizedAt IS NULL AND createdAt <= ? ORDER BY name LIMIT 5000', [this.companyId, to]);
      out['CUSTOMER'] = { count: rows.length, sample: rows.slice(0, 50).map((r) => ({ id: r.id, name: r.name.split(' ').map(mask).join(' '), email: r.email ? maskIdentifier(r.email) : null })) };
    }
    if (types.includes('SUPPLIER')) {
      const rows: { id: string; name: string; email: string | null }[] = await this.ds.query("SELECT id, name, email FROM suppliers WHERE companyId = ? AND type IN ('individual', 'farmer') AND createdAt <= ? ORDER BY name LIMIT 5000", [this.companyId, to]);
      out['SUPPLIER'] = { count: rows.length, sample: rows.slice(0, 50).map((r) => ({ id: r.id, name: r.name.split(' ').map(mask).join(' '), email: r.email ? maskIdentifier(r.email) : null })) };
    }
    if (types.includes('USER')) {
      const rows: { id: string; name: string; email: string | null }[] = await this.ds.query('SELECT id, fullName name, email FROM users WHERE companyId = ? AND createdAt <= ? ORDER BY fullName LIMIT 5000', [this.companyId, to]);
      out['USER'] = { count: rows.length, sample: rows.slice(0, 50).map((r) => ({ id: r.id, name: (r.name || '').split(' ').map(mask).join(' '), email: r.email ? maskIdentifier(r.email) : null })) };
    }
    const total = Object.values(out).reduce((s, x) => s + x.count, 0);
    return { incidentId: i.id, until: to, total, bySubjectType: out };
  }

  async openSummary() {
    const rows = await this.ds.manager.find(SecurityIncidentEntity, { where: { companyId: this.companyId, status: In(OPEN) } });
    const now = new Date();
    const confirmed = rows.filter((r) => r.status === 'CONFIRMED' && r.deadlineAt);
    const nearest = confirmed.sort((a, b) => new Date(a.deadlineAt as Date).getTime() - new Date(b.deadlineAt as Date).getTime())[0];
    return {
      open: rows.length,
      suspected: rows.filter((r) => r.status === 'SUSPECTED').length,
      awaitingNotice: confirmed.length,
      nearest: nearest ? { id: nearest.id, incidentNo: nearest.incidentNo, deadlineAt: nearest.deadlineAt, hoursLeft: kvkkHoursLeft(nearest.deadlineAt as Date, now) } : null,
    };
  }
}
