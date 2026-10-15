/**
 * Series every company starts with (migration 1784274135000 and new companies). PAPER series
 * must match the printed (matbu) forms bought from the licensed printer; companies change them
 * under Settings > Document series. EDOCUMENT series are added when e-Belge is activated.
 */
export const DEFAULT_SERIES: { kind: string; mode: string; seriesCode: string; note: string }[] = [
  { kind: 'INVOICE', mode: 'PAPER', seriesCode: 'A', note: 'Matbu fatura serisi (basımevi seri-sıra)' },
  { kind: 'DESPATCH', mode: 'PAPER', seriesCode: 'A', note: 'Matbu sevk irsaliyesi serisi' },
  { kind: 'EXPENSE_VOUCHER', mode: 'PAPER', seriesCode: 'GP', note: 'Matbu gider pusulası serisi' },
  { kind: 'PRODUCER_RECEIPT', mode: 'PAPER', seriesCode: 'MM', note: 'Matbu müstahsil makbuzu serisi' },
  { kind: 'GOODS_RECEIPT', mode: 'INTERNAL', seriesCode: 'MKB', note: 'Mal kabul fişi (iç belge)' },
  { kind: 'RETURN', mode: 'INTERNAL', seriesCode: 'IAD', note: 'İade belgesi (iç belge)' },
];
