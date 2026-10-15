type Query = (sql: string, params?: unknown[]) => Promise<any>;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * purchase_order_items.receivedQuantity from what actually entered stock: the IN movements booked
 * against the purchase order (legacy receipts reference the PO number, goods receipts the PO id),
 * per product. When a PO has several lines of one product, the received quantity fills them in
 * line order up to each line's ordered quantity; any surplus stays on the last line.
 * POs without receipt movements keep their status-based value (Received -> ordered quantity,
 * otherwise 0), so data imported without a stock ledger is not reopened.
 * Returns the number of changed lines.
 */
export async function backfillPurchaseReceived(query: Query): Promise<number> {
  const pos: { id: string; poNumber: string; status: string }[] = await query(
    "SELECT `id`, `poNumber`, `status` FROM `purchase_orders` WHERE `status` IN ('Received', 'Partially Received')",
  );
  let changed = 0;
  for (const po of pos) {
    const moved: { productId: string; qty: string }[] = await query(
      "SELECT `productId`, SUM(`quantity`) AS qty FROM `stock_movements` WHERE `referenceType` = 'purchase_order' AND `type` = 'IN' AND `referenceId` IN (?, ?) GROUP BY `productId`",
      [po.id, po.poNumber],
    );
    const lines: { id: string; productId: string; quantity: string; receivedQuantity: string }[] = await query(
      'SELECT `id`, `productId`, `quantity`, `receivedQuantity` FROM `purchase_order_items` WHERE `purchaseOrderId` = ? ORDER BY `id`',
      [po.id],
    );
    const target = new Map<string, number>();
    if (!moved.length) {
      for (const l of lines) target.set(l.id, po.status === 'Received' ? Number(l.quantity) : 0);
    } else {
      const left = new Map(moved.map((r) => [r.productId, round4(Number(r.qty) || 0)]));
      const byProduct = new Map<string, typeof lines>();
      for (const l of lines) byProduct.set(l.productId, [...(byProduct.get(l.productId) || []), l]);
      for (const [productId, group] of byProduct) {
        let rest = left.get(productId) || 0;
        group.forEach((l, i) => {
          const take = i === group.length - 1 ? rest : Math.min(rest, Number(l.quantity));
          target.set(l.id, round4(Math.max(0, take)));
          rest = round4(rest - take);
        });
      }
    }
    for (const l of lines) {
      const v = target.get(l.id) ?? 0;
      if (round4(Number(l.receivedQuantity)) === v) continue;
      await query('UPDATE `purchase_order_items` SET `receivedQuantity` = ? WHERE `id` = ?', [v, l.id]);
      changed++;
    }
  }
  return changed;
}
