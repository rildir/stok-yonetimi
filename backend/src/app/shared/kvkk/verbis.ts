/**
 * VERBİS registration obligation (KVKK md. 16; Kurul kararları 2018/87, 2023/1154, 2025/1572,
 * 2025/2393). The thresholds are legal parameters (legal_parameters, with sourceRef / confidence);
 * this function only applies them:
 *  - EMPLOYEES: annual employee count >= VERBIS_EMPLOYEE_THRESHOLD;
 *  - BALANCE_SHEET: annual balance-sheet total >= VERBIS_BALANCE_SHEET_THRESHOLD - only for
 *    controllers keeping balance-sheet books (BILANCO) when VERBIS_NON_BALANCE_SHEET_EMPLOYEES_ONLY
 *    is in force (2025/2393: işletme hesabı / basit usul are assessed on employees only);
 *  - MAIN_ACTIVITY_SPECIAL: main activity is special-category processing, unless below both
 *    special thresholds (2025/1572); without those parameters the activity alone triggers it.
 */
export interface VerbisInput {
  bookkeepingType?: string | null;
  employeeCount: number | null;
  balanceSheetTotal: number | null;
  mainActivitySpecial?: boolean;
  employeeThreshold: number | null;
  balanceSheetThreshold: number | null;
  specialEmployeeThreshold: number | null;
  specialBalanceSheetThreshold: number | null;
  /** VERBIS_NON_BALANCE_SHEET_EMPLOYEES_ONLY in force */
  nonBalanceSheetEmployeesOnly: boolean;
}

export interface VerbisAssessment {
  required: boolean;
  reasons: ('MAIN_ACTIVITY_SPECIAL' | 'EMPLOYEES' | 'BALANCE_SHEET')[];
  inputsMissing: boolean;
  balanceSheetApplies: boolean;
}

export function assessVerbis(i: VerbisInput): VerbisAssessment {
  const balanceSheetBooks = !i.bookkeepingType || i.bookkeepingType === 'BILANCO';
  const balanceApplies = balanceSheetBooks || !i.nonBalanceSheetEmployeesOnly;
  const emp = i.employeeCount;
  const bal = i.balanceSheetTotal;
  const reasons: VerbisAssessment['reasons'] = [];
  if (i.mainActivitySpecial) {
    const exemptionKnown = i.specialEmployeeThreshold !== null || i.specialBalanceSheetThreshold !== null;
    const overSpecial =
      (i.specialEmployeeThreshold !== null && (emp ?? 0) >= i.specialEmployeeThreshold) ||
      (balanceApplies && i.specialBalanceSheetThreshold !== null && (bal ?? 0) >= i.specialBalanceSheetThreshold);
    if (!exemptionKnown || overSpecial) reasons.push('MAIN_ACTIVITY_SPECIAL');
  }
  if (i.employeeThreshold !== null && (emp ?? 0) >= i.employeeThreshold) reasons.push('EMPLOYEES');
  if (balanceApplies && i.balanceSheetThreshold !== null && (bal ?? 0) >= i.balanceSheetThreshold) reasons.push('BALANCE_SHEET');
  return { required: reasons.length > 0, reasons, inputsMissing: emp === null || (balanceApplies && bal === null), balanceSheetApplies: balanceApplies };
}
