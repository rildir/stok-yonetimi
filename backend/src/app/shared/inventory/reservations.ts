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

/**
 * API view of a product's availability: `sellableQuantity` = stock in sellable warehouses (the
 * stored availableQuantity column), `reservedQuantity` = held by pending despatch-mode orders and
 * `availableQuantity` = sellable minus reserved (never below 0) - what can still be promised.
 * Response-only: call it on objects that are not saved afterwards. Idempotent.
 */
export function presentAvailability<T extends { quantity?: number | null; availableQuantity?: number | null; reservedQuantity?: number; sellableQuantity?: number }>(p: T, reserved: number): T {
  if (p.sellableQuantity !== undefined) return p;
  const sellable = roundQty(Number(p.availableQuantity ?? p.quantity) || 0);
  p.sellableQuantity = sellable;
  p.reservedQuantity = roundQty(reserved || 0);
  p.availableQuantity = Math.max(0, roundQty(sellable - (reserved || 0)));
  return p;
}

/** presentAvailability for a list of products of one company (one query). */
export async function attachAvailability<T extends { id: string; quantity?: number | null; availableQuantity?: number | null; reservedQuantity?: number; sellableQuantity?: number }>(manager: EntityManager, companyId: string, products: T[]): Promise<T[]> {
  const todo = products.filter((p) => p && p.id && p.sellableQuantity === undefined);
  if (!todo.length) return products;
  const reserved = await reservedQuantities(manager, companyId, todo.length > 200 ? undefined : todo.map((p) => p.id));
  for (const p of todo) presentAvailability(p, reserved.get(p.id) || 0);
  return products;
}
