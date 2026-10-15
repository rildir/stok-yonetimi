import { EntityManager } from 'typeorm';
import { roundQty } from '../tr';

/**
 * Base quantities reserved by pending 'despatch'-mode orders (ordered, not yet despatched), per
 * product. In despatch mode an order only reserves stock; it leaves on despatch approval.
 */
export async function reservedQuantities(manager: EntityManager, companyId: string, productIds?: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (productIds && !productIds.length) return out;
  const rows: { productId: string; qty: string }[] = await manager.query(
    'SELECT oi.`productId` AS productId, SUM(oi.`quantity` - oi.`despatchedQuantity`) AS qty FROM `order_items` oi JOIN `orders` o ON o.`id` = oi.`orderId` ' +
      "WHERE o.`companyId` = ? AND o.`status` = 'Pending' AND o.`stockMode` = 'despatch' AND o.`deletedAt` IS NULL" +
      (productIds ? ' AND oi.`productId` IN (?)' : '') +
      ' GROUP BY oi.`productId`',
    productIds ? [companyId, productIds] : [companyId],
  );
  for (const r of rows || []) out.set(r.productId, Math.max(0, roundQty(Number(r.qty) || 0)));
  return out;
}
