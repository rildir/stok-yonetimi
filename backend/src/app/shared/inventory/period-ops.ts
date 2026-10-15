import { EntityManager } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { FiscalPeriodEntity } from '../../entities/inventory-accounting.entity';
import { addDays, DEFAULT_TIMEZONE, fiscalYearPeriods, zonedDayStart } from '../tr';

/**
 * Fiscal period helpers shared by the accounting module and the maker-checker approval in
 * StockMovementService (reopening a closed period is approved there by a second administrator).
 */

/** Creates the year + quarter rows of `years` that do not exist yet (idempotent). */
export async function ensureFiscalPeriods(manager: EntityManager, company: Pick<CompanyEntity, 'id' | 'timezone' | 'fiscalYearStartMonth'>, years: number[]): Promise<void> {
  const tz = company.timezone || DEFAULT_TIMEZONE;
  for (const y of years) {
    for (const p of fiscalYearPeriods(y, company.fiscalYearStartMonth || 1)) {
      await manager.query(
        'INSERT IGNORE INTO `fiscal_periods` (`id`, `companyId`, `periodType`, `fiscalYear`, `quarter`, `startDate`, `endDate`, `startAt`, `endAt`, `status`) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [company.id, p.periodType, p.fiscalYear, p.quarter, p.startDate, p.endDate, zonedDayStart(p.startDate, tz), zonedDayStart(addDays(p.endDate, 1), tz), 'OPEN'],
      );
    }
  }
}

export function periodLabel(p: Pick<FiscalPeriodEntity, 'fiscalYear' | 'quarter'>): string {
  return p.quarter ? `${p.fiscalYear}/Q${p.quarter}` : String(p.fiscalYear);
}

/** Latest end day among closed periods (the stock lock date follows it), null when none. */
export async function latestClosedEnd(manager: EntityManager, companyId: string): Promise<string | null> {
  const row = await manager
    .createQueryBuilder(FiscalPeriodEntity, 'p')
    .select("DATE_FORMAT(MAX(p.endDate), '%Y-%m-%d')", 'd')
    .where('p.companyId = :c AND p.status = :s', { c: companyId, s: 'CLOSED' })
    .getRawOne();
  return row?.d || null;
}

/**
 * Reopens a closed period (approved maker-checker request): status OPEN, reopen counter and
 * reason; the company stock lock date moves back to the end of the latest period still closed.
 * A closed year reopens with it the quarter being reopened (the year cannot stay closed).
 */
export async function applyPeriodReopen(manager: EntityManager, companyId: string, periodId: string, reason: string): Promise<FiscalPeriodEntity> {
  const p = await manager.findOne(FiscalPeriodEntity, { where: { companyId, id: periodId }, lock: { mode: 'pessimistic_write' } });
  if (!p) throw new Error('PERIOD_NOT_FOUND');
  const toOpen: FiscalPeriodEntity[] = [p];
  if (p.periodType === 'QUARTER') {
    const year = await manager.findOne(FiscalPeriodEntity, { where: { companyId, periodType: 'YEAR', fiscalYear: p.fiscalYear } });
    if (year && year.status === 'CLOSED') toOpen.push(year);
  }
  for (const x of toOpen) {
    if (x.status !== 'CLOSED') continue;
    x.status = 'OPEN';
    x.reopenCount = (x.reopenCount || 0) + 1;
    x.lastReopenReason = String(reason).slice(0, 500);
    await manager.save(FiscalPeriodEntity, x);
  }
  const company = await manager.findOneByOrFail(CompanyEntity, { id: companyId });
  const lock = company.stockLockDate ? String(company.stockLockDate).slice(0, 10) : null;
  const startDate = String(p.startDate).slice(0, 10);
  if (lock && lock >= startDate) {
    const closedEnd = await latestClosedEnd(manager, companyId);
    const previousDay = addDays(startDate, -1);
    company.stockLockDate = closedEnd && closedEnd < startDate ? closedEnd : closedEnd && closedEnd >= startDate ? previousDay : null;
    await manager.save(CompanyEntity, company);
  }
  return p;
}
