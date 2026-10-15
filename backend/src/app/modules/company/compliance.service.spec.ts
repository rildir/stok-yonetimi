import { ComplianceService } from './compliance.service';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { LEGAL_PARAMETER_SEEDS } from '../../shared/legal/legal-parameter-seeds';

/** In-memory DataSource stub: legal_parameters rows + two companies. */
function setup() {
  const companies = [
    { id: 'c-tr', country: 'TR', timezone: 'Europe/Istanbul' },
    { id: 'c-us', country: 'US', timezone: 'America/New_York' },
  ];
  const manager = {
    find: async (entity: any, opts?: any) =>
      entity.name === 'LegalParameterEntity'
        ? LEGAL_PARAMETER_SEEDS.filter((p) => !opts?.where?.country || p.country === opts.where.country).map((p, i) => ({ id: String(i), ...p }))
        : companies,
  };
  const ds: any = { manager };
  const params = new LegalParameterService(ds);
  const emitted: { companyId: string; event: string; data: any }[] = [];
  const gateway: any = { emitToCompany: (companyId: string, event: string, data: any) => emitted.push({ companyId, event, data }) };
  const svc = new ComplianceService(ds, {} as any, {} as any, params, gateway);
  return { svc, emitted };
}

describe('ComplianceService.notifyMissingParameters (1 January warning)', () => {
  it('stays quiet while the current year is covered', async () => {
    const { svc, emitted } = setup();
    expect(await svc.notifyMissingParameters(new Date('2026-12-31T20:00:00Z'))).toBe(0);
    expect(emitted).toHaveLength(0);
  });

  it('warns a TR company on 1 January 2027 (company time zone) when VUK232_INVOICE_LIMIT is missing, once per day', async () => {
    const { svc, emitted } = setup();
    // 21:30 UTC on 31.12 is already 1 January in Istanbul, not yet in New York.
    const n = await svc.notifyMissingParameters(new Date('2026-12-31T21:30:00Z'));
    expect(n).toBe(1);
    expect(emitted[0]).toMatchObject({ companyId: 'c-tr', event: 'compliance_warning', data: { code: 'LEGAL_PARAMETER_MISSING', year: 2027 } });
    expect(emitted[0].data.keys).toContain('VUK232_INVOICE_LIMIT');
    expect(await svc.notifyMissingParameters(new Date('2026-12-31T22:30:00Z'))).toBe(0);
  });
});
