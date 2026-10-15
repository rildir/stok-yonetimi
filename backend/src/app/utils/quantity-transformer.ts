import { ValueTransformer } from 'typeorm';
import { roundQty } from '../shared/tr';

/**
 * DECIMAL(18,4) stock quantities <-> JS numbers. Values are rounded to 4 decimals
 * on write (no float drift reaches the DB) and parsed on read (mysql2 returns strings).
 */
export class QuantityTransformer implements ValueTransformer {
  to(value: number | string | null | undefined): number | null | undefined {
    if (value === null || value === undefined) return value as null | undefined;
    return roundQty(value);
  }
  from(value: string | number | null): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}

export const QTY = new QuantityTransformer();

/** Column options for a stock quantity: DECIMAL(18,4). */
export const qtyColumn = (extra: { default?: number; nullable?: boolean } = {}) =>
  ({ type: 'decimal', precision: 18, scale: 4, transformer: QTY, ...extra }) as const;
