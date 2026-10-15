/**
 * Backend entry to the shared Turkish compliance library (libs/tr-compliance).
 * Imported by relative path so the backend build does not depend on tsconfig path aliases;
 * the frontend imports the same code as '@stok/tr-compliance'.
 */
export * from '../../../../../libs/tr-compliance/src';
