/** Lot/serial detail of a document line or movement (quantities in base units). */
export interface TrackingEntry {
  warehouseId: string;
  lotId?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  serials?: string[];
}

export enum TrackingType {
  NONE = 'none',
  LOT = 'lot',
  SERIAL = 'serial',
}
