import { I18nService } from '../../i18n/i18n.service';
import { UiStateService } from '../../services/ui-state.service';
import { MovementWarning } from '../../models/inventory.models';

/** i18n key per warning code returned with booked stock movements. */
const WARNING_KEYS: Record<string, string> = {
  LATE_ENTRY_WARNING: 'stockMovements.warning.lateEntry',
};

/**
 * Shows the warnings of a booked stock movement (VUK 219 late entry...) as an info
 * toast; falls back to `successKey` when there is none. Used by every screen that
 * books stock with a user-entered date (adjustment, reversal, PO receipt, order).
 */
export function toastMovementResult(
  ui: UiStateService,
  i18n: I18nService,
  warnings: MovementWarning[] | null | undefined,
  successKey: string,
  successParams: Record<string, unknown> = {},
): void {
  const texts = (warnings || [])
    .filter((w) => WARNING_KEYS[w.code])
    .map((w) => i18n.t(WARNING_KEYS[w.code], (w.params || {}) as Record<string, any>));
  if (texts.length) ui.showToast(texts.join(' '), 'info');
  else ui.showToast(i18n.t(successKey, successParams as Record<string, any>), 'success');
}
