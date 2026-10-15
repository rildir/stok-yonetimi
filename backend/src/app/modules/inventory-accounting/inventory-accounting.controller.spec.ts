import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { AccountingController, AccountingReportController, DisposalController, ImpairmentController, LotController, PriceController } from './inventory-accounting.controller';

/** WP6 review: cost / tax / customer-trace reads are for administrators and managers only. */
describe('WP6 report access (roles metadata)', () => {
  const reflector = new Reflector();
  const roles = (cls: any, method: string) => reflector.getAllAndOverride<string[]>('roles', [cls.prototype[method], cls]);

  it('restricts cost, tax and trace reports to admin / manager', () => {
    for (const m of ['inventoryList', 'stockLedger', 'inventorySummary', 'eEnvanter', 'vat', 'vatWithholding', 'vatImpact', 'wastage', 'impairmentCandidates', 'traceability', 'disposalRatio']) {
      expect(roles(AccountingReportController, m)).toEqual(['admin', 'manager']);
    }
    expect(roles(AccountingController, 'batches')).toEqual(['admin', 'manager']);
    expect(roles(AccountingController, 'mappings')).toEqual(['admin', 'manager']);
    expect(roles(LotController, 'recalls')).toEqual(['admin', 'manager']);
    expect(roles(DisposalController, 'list')).toEqual(['admin', 'manager']);
    expect(roles(ImpairmentController, 'list')).toEqual(['admin', 'manager']);
    expect(roles(PriceController, 'serial')).toEqual(['admin', 'manager']);
  });

  it('keeps the stricter method-level roles', () => {
    expect(roles(DisposalController, 'transition')).toEqual(['admin']);
    expect(roles(ImpairmentController, 'post')).toEqual(['admin']);
    expect(roles(AccountingController, 'addMapping')).toEqual(['admin']);
  });
});
