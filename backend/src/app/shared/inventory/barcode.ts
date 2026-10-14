/** Barcode symbologies supported for product / unit barcodes. */
export type BarcodeType = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128';
export const BARCODE_TYPES: BarcodeType[] = ['EAN13', 'EAN8', 'UPCA', 'CODE128'];

const DIGIT_LENGTH: Partial<Record<BarcodeType, number>> = { EAN13: 13, EAN8: 8, UPCA: 12 };

/** GS1 mod-10 check digit for the payload (all digits except the check digit). */
export function gs1CheckDigit(payload: string): number {
  let sum = 0;
  // Weights alternate 3,1,... starting from the rightmost payload digit.
  for (let i = 0; i < payload.length; i++) {
    const d = payload.charCodeAt(payload.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidGs1Checksum(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  return gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Guesses the symbology: 13/12/8 digits => EAN13/UPCA/EAN8, otherwise CODE128. */
export function detectBarcodeType(code: string): BarcodeType {
  if (/^\d{13}$/.test(code)) return 'EAN13';
  if (/^\d{12}$/.test(code)) return 'UPCA';
  if (/^\d{8}$/.test(code)) return 'EAN8';
  return 'CODE128';
}

export type BarcodeError = 'BARCODE_INVALID_FORMAT' | 'BARCODE_INVALID_CHECKSUM';

/**
 * Validates a barcode. EAN/UPC must have the right digit count and a valid
 * GS1 check digit; CODE128 accepts 1-64 printable ASCII characters.
 */
export function validateBarcode(code: string, type?: BarcodeType | null): { type: BarcodeType; error?: BarcodeError } {
  const t = type || detectBarcodeType(code);
  const len = DIGIT_LENGTH[t];
  if (len) {
    if (!new RegExp(`^\\d{${len}}$`).test(code)) return { type: t, error: 'BARCODE_INVALID_FORMAT' };
    if (!hasValidGs1Checksum(code)) return { type: t, error: 'BARCODE_INVALID_CHECKSUM' };
    return { type: t };
  }
  if (!/^[\x20-\x7E]{1,64}$/.test(code)) return { type: t, error: 'BARCODE_INVALID_FORMAT' };
  return { type: t };
}

/** Builds a valid EAN-13 from a 12-digit payload. */
export function makeEan13(payload12: string): string {
  return payload12 + gs1CheckDigit(payload12);
}
