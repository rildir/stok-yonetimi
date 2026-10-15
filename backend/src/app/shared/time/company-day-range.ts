import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { CompanyEntity } from '../../entities/company.entity';
import { DEFAULT_TIMEZONE, isDateKey, zonedDayEnd, zonedDayStart } from '../tr';

/** IANA time zone of a company (DB values are UTC; calendar days are the company's). */
export async function companyTimezone(m: EntityManager, companyId: string): Promise<string> {
  const c = await m.findOne(CompanyEntity, { where: { id: companyId }, select: ['id', 'timezone'] });
  return c?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Adds `column >= start-of-day` / `column < start-of-next-day` for calendar days
 * (YYYY-MM-DD) in time zone `tz`; the end day is inclusive. Full timestamps are used as given.
 */
export function applyDayRange<T extends object>(qb: SelectQueryBuilder<T>, column: string, tz: string, startDate?: string | null, endDate?: string | null): void {
  if (startDate) qb.andWhere(`${column} >= :rangeFrom`, { rangeFrom: isDateKey(startDate) ? zonedDayStart(startDate, tz) : new Date(startDate) });
  if (endDate) {
    if (isDateKey(endDate)) qb.andWhere(`${column} < :rangeTo`, { rangeTo: zonedDayEnd(endDate, tz) });
    else qb.andWhere(`${column} <= :rangeTo`, { rangeTo: new Date(endDate) });
  }
}
