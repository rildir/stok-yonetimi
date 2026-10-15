import { assessVerbis, VerbisInput } from './verbis';
import { maskPersonalIdentifiers, maskQrPayload } from './masking';
import { buildPrivacyNotice } from './notice-template';
import { issueRefreshToken, issuedSessionId } from '../../modules/user/session.service';
import { renderHtml } from '../ebelge/render';
import { qrPayload, qrSvg } from '../ebelge/qr';
import { parseUbl } from '../ebelge/ubl/parser';
import { buildInvoiceXml } from '../ebelge/ubl/invoice.builder';
import { earsivInternetInvoice } from '../ebelge/ubl/__fixtures__/golden-inputs';

/** WP7 review round 2: VERBİS assessment, karekod masking, refresh-token reuse, English notices. */
describe('VERBİS assessment (2023/1154, 2025/1572, 2025/2393)', () => {
  const base: VerbisInput = {
    bookkeepingType: 'BILANCO',
    employeeCount: 18,
    balanceSheetTotal: 42_500_000,
    mainActivitySpecial: false,
    employeeThreshold: 50,
    balanceSheetThreshold: 100_000_000,
    specialEmployeeThreshold: 10,
    specialBalanceSheetThreshold: 10_000_000,
    nonBalanceSheetEmployeesOnly: true,
  };

  it('below both thresholds: not required', () => {
    expect(assessVerbis(base)).toEqual({ required: false, reasons: [], inputsMissing: false, balanceSheetApplies: true });
  });

  it('employees or balance sheet over the threshold', () => {
    expect(assessVerbis({ ...base, employeeCount: 50 }).reasons).toEqual(['EMPLOYEES']);
    expect(assessVerbis({ ...base, balanceSheetTotal: 100_000_000 }).reasons).toEqual(['BALANCE_SHEET']);
  });

  it('ISLETME / BASIT books are assessed on employees only when 2025/2393 is in force', () => {
    for (const bookkeepingType of ['ISLETME', 'BASIT']) {
      const r = assessVerbis({ ...base, bookkeepingType, balanceSheetTotal: 500_000_000 });
      expect(r).toMatchObject({ required: false, balanceSheetApplies: false, inputsMissing: false });
      expect(assessVerbis({ ...base, bookkeepingType, balanceSheetTotal: null }).inputsMissing).toBe(false);
      // without the 2025/2393 parameter the balance sheet still counts
      expect(assessVerbis({ ...base, bookkeepingType, balanceSheetTotal: 500_000_000, nonBalanceSheetEmployeesOnly: false }).reasons).toEqual(['BALANCE_SHEET']);
    }
  });

  it('special-category main activity: exempt below both special thresholds, required above either', () => {
    expect(assessVerbis({ ...base, mainActivitySpecial: true, employeeCount: 9, balanceSheetTotal: 9_000_000 }).required).toBe(false);
    expect(assessVerbis({ ...base, mainActivitySpecial: true, employeeCount: 10, balanceSheetTotal: 9_000_000 }).reasons).toEqual(['MAIN_ACTIVITY_SPECIAL']);
    expect(assessVerbis({ ...base, mainActivitySpecial: true, employeeCount: 9, balanceSheetTotal: 10_000_000 }).reasons).toEqual(['MAIN_ACTIVITY_SPECIAL']);
    // no exemption parameters: the activity alone triggers the obligation
    expect(assessVerbis({ ...base, mainActivitySpecial: true, employeeCount: 1, specialEmployeeThreshold: null, specialBalanceSheetThreshold: null }).reasons).toEqual(['MAIN_ACTIVITY_SPECIAL']);
  });

  it('missing inputs are reported', () => {
    expect(assessVerbis({ ...base, employeeCount: null }).inputsMissing).toBe(true);
    expect(assessVerbis({ ...base, balanceSheetTotal: null }).inputsMissing).toBe(true);
  });
});

describe('karekod masking (R61)', () => {
  it('masks TCKN values of the QR payload, keeps VKNs', () => {
    const qr = { vkntckn: '4820193752', avkntckn: '28741509354', no: 'A1' };
    expect(maskQrPayload(qr)).toEqual({ vkntckn: '4820193752', avkntckn: '*******9354', no: 'A1' });
    expect(maskPersonalIdentifiers({ qr: { vkntckn: '28461593794', avkntckn: '28741509354', tasiyicivkn: '1294765301' } })).toEqual({
      qr: { vkntckn: '*******3794', avkntckn: '*******9354', tasiyicivkn: '1294765301' },
    });
  });

  it('the QR image of a masked rendering encodes the masked payload', async () => {
    const xml = buildInvoiceXml(earsivInternetInvoice());
    const raw = qrPayload(parseUbl(xml))!;
    expect(raw['avkntckn']).toBe('28741509354');
    const masked = await renderHtml(xml, { maskPii: true });
    expect(masked).not.toContain('28741509354');
    expect(masked).toContain(await qrSvg(maskQrPayload(raw)));
    expect(masked).not.toContain(await qrSvg(raw));
    expect(await renderHtml(xml)).toContain(await qrSvg(raw));
  }, 30000);
});

describe('refresh tokens', () => {
  it('every issued token names its session and is verifiable; forged tokens are not', () => {
    const sid = '3f0c2a52-8a51-4bb5-9a39-2f5d1c0e7a11';
    const t1 = issueRefreshToken(sid);
    const t2 = issueRefreshToken(sid);
    expect(t1).not.toBe(t2);
    expect(issuedSessionId(t1)).toBe(sid);
    expect(issuedSessionId(t2)).toBe(sid);
    const [, nonce] = t1.split('.');
    expect(issuedSessionId(`${sid}.${nonce}.forged`)).toBeNull();
    expect(issuedSessionId(`${sid}.x.${t1.split('.')[2]}`)).toBeNull();
    expect(issuedSessionId('legacy-opaque-token')).toBeNull();
  });
});

describe('English privacy notice', () => {
  it('lists legal bases and recipient groups in English', () => {
    const n = buildPrivacyNotice({ name: 'Demo', legalName: 'Demo A.Ş.' } as any, 'CUSTOMER', 'en', [], [], () => '10 years');
    expect(n.body).toContain('Revenue Administration (GİB)');
    expect(n.body).toContain('formation / performance of a contract');
    expect(n.body).not.toContain('Gelir İdaresi Başkanlığı');
    expect(n.body).not.toContain('sözleşmenin kurulması');
  });
});
