import { QueryRunner } from 'typeorm';

/** Stock quantity columns converted from int to DECIMAL(18,4) by migration 1784274129000 (WP2). */
export const QUANTITY_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: 'products', column: 'quantity', ddl: "decimal(18,4) NOT NULL DEFAULT '0.0000'" },
  { table: 'products', column: 'minQuantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'product_warehouse_stocks', column: 'quantity', ddl: "decimal(18,4) NOT NULL DEFAULT '0.0000'" },
  { table: 'stock_lots', column: 'quantity', ddl: "decimal(18,4) NOT NULL DEFAULT '0.0000'" },
  { table: 'stock_movements', column: 'quantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'stock_movements', column: 'previousQuantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'stock_movements', column: 'newQuantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'order_items', column: 'quantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'order_items', column: 'unitQuantity', ddl: "decimal(18,4) NOT NULL DEFAULT '0.0000'" },
  { table: 'purchase_order_items', column: 'quantity', ddl: 'decimal(18,4) NOT NULL' },
  { table: 'purchase_order_items', column: 'unitQuantity', ddl: "decimal(18,4) NOT NULL DEFAULT '0.0000'" },
];

export const INT_QUANTITY_DDL: Record<string, string> = {
  'products.quantity': "int NOT NULL DEFAULT '0'",
  'products.minQuantity': 'int NOT NULL',
  'product_warehouse_stocks.quantity': "int NOT NULL DEFAULT '0'",
  'stock_lots.quantity': "int NOT NULL DEFAULT '0'",
  'order_items.unitQuantity': "decimal(12,4) NOT NULL DEFAULT '0.0000'",
  'purchase_order_items.unitQuantity': "decimal(12,4) NOT NULL DEFAULT '0.0000'",
};

type Q = Pick<QueryRunner, 'query'>;

/** int -> DECIMAL(18,4) for all quantity columns (MODIFY keeps values; exported for the data-preservation test). */
export async function convertQuantityColumnsToDecimal(q: Q): Promise<void> {
  for (const c of QUANTITY_COLUMNS) {
    await q.query(`ALTER TABLE \`${c.table}\` MODIFY \`${c.column}\` ${c.ddl}`);
  }
}

