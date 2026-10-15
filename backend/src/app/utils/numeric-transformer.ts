import { ValueTransformer } from 'typeorm';

export class ColumnNumericTransformer implements ValueTransformer {
  to(data: number | null): number | null {
    return data;
  }
  /** DECIMAL string -> number. A number passes through (TypeORM re-applies `from` to saved values: 0 must stay 0). */
  from(data: string | number | null): number | null {
    if (data === null || data === undefined || data === '') return null;
    if (typeof data === 'number') return data;
    const parsed = parseFloat(data);
    return isNaN(parsed) ? null : parsed;
  }
}
