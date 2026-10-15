import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { LEGAL_PARAMETER_SEEDS, WP4_PARAMETER_KEYS } from '../shared/legal/legal-parameter-seeds';
import { dropDocumentTriggers, ensureDocumentTriggers } from '../shared/documents/document-triggers';
import { DEFAULT_SERIES } from '../shared/documents/default-series';

/**
 * WP4: document regime (VUK 229-235; 509 Sıra No.lu VUK GT).
 *
 *  A. document_series / document_sequences (gap-free numbering per kind, mode, series, year).
 *  B. despatches + despatch_lines, invoices + invoice_lines, returns + return_items,
 *     goods_receipts + goods_receipt_items, expense_vouchers (company FK RESTRICT).
 *  C. companies.stockDeductOn ('despatch' for TR companies), eDocumentMode (NONE), producerReceiptEnabled;
 *     orders.stockMode / documentsLegacy / ÖKC receipt; order_items despatched / invoiced / returned
 *     quantities; purchase_order_items received / returned quantities; orders and purchase_orders
 *     company FK CASCADE -> RESTRICT (commercial records are not removed with the company).
 *  D. Backfill: existing orders are legacy (stock already left at order time; no documents expected),
 *     completed orders count as despatched, received purchase orders as received. Default PAPER /
 *     INTERNAL series for every company.
 *  E. WP4 legal parameters; immutability triggers on the document tables.
 */
const SCHEMA: string[] = [
  "ALTER TABLE `purchase_orders` DROP FOREIGN KEY `FK_purchase_orders_company`",
  "ALTER TABLE `orders` DROP FOREIGN KEY `FK_orders_company`",
  "CREATE TABLE `document_series` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `kind` varchar(20) NOT NULL, `mode` varchar(10) NOT NULL, `seriesCode` varchar(3) NOT NULL, `isDefault` tinyint NOT NULL DEFAULT 0, `isActive` tinyint NOT NULL DEFAULT 1, `warehouseId` varchar(36) NULL, `note` varchar(255) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_document_series_company_kind_mode_code` (`companyId`, `kind`, `mode`, `seriesCode`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `document_sequences` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `kind` varchar(20) NOT NULL, `mode` varchar(10) NOT NULL, `seriesCode` varchar(3) NOT NULL, `year` int NOT NULL, `lastNumber` int NOT NULL DEFAULT '0', `lastDate` date NULL, `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_document_sequences_key` (`companyId`, `kind`, `mode`, `seriesCode`, `year`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `despatches` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `documentNo` varchar(50) NULL, `seriesCode` varchar(3) NULL, `numberMode` varchar(10) NULL, `profileId` varchar(20) NOT NULL DEFAULT 'TEMELIRSALIYE', `typeCode` varchar(10) NOT NULL DEFAULT 'SEVK', `purpose` varchar(20) NOT NULL, `status` varchar(25) NOT NULL DEFAULT 'DRAFT', `orderId` varchar(36) NULL, `orderNumber` varchar(50) NULL, `customerId` varchar(36) NULL, `supplierId` varchar(36) NULL, `returnId` varchar(36) NULL, `goodsReceiptId` varchar(36) NULL, `sourceWarehouseId` varchar(36) NULL, `targetWarehouseId` varchar(36) NULL, `inTransitWarehouseId` varchar(36) NULL, `stockEffect` tinyint NOT NULL DEFAULT 1, `sellerSnapshot` json NULL, `buyerSnapshot` json NULL, `deliveryAddress` json NULL, `originAddress` json NULL, `carrierParty` json NULL, `drivers` json NULL, `plates` json NULL, `actualDespatchAt` datetime NULL, `issueDate` date NULL, `issueTime` varchar(8) NULL, `invoiceRefs` json NULL, `paperNo` varchar(50) NULL, `paperDate` date NULL, `paperReason` varchar(2) NULL, `gibNoticeRef` varchar(100) NULL, `evidenceAttachmentId` varchar(36) NULL, `deliveryChannel` varchar(10) NULL, `gibStatus` varchar(30) NULL, `providerRef` varchar(100) NULL, `invoiceStatus` varchar(10) NOT NULL DEFAULT 'NONE', `approvedBy` varchar(100) NULL, `approvedAt` datetime NULL, `receivedAt` datetime NULL, `receivedBy` varchar(100) NULL, `note` text NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_despatches_ettn` (`ettn`), INDEX `IDX_despatches_company_order` (`companyId`, `orderId`), INDEX `IDX_despatches_company_status` (`companyId`, `status`), UNIQUE INDEX `UQ_despatches_company_documentNo` (`companyId`, `documentNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `despatch_lines` (`id` varchar(36) NOT NULL, `despatchId` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `lineNo` int NOT NULL DEFAULT '1', `orderItemId` varchar(36) NULL, `productId` varchar(36) NULL, `productName` varchar(255) NOT NULL, `productSku` varchar(100) NULL, `quantity` decimal(18,4) NOT NULL, `unitCode` varchar(20) NULL, `unitPrice` decimal(18,6) NULL, `warehouseId` varchar(36) NULL, `lots` json NULL, `serials` json NULL, `tracking` json NULL, `invoicedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `returnedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', INDEX `IDX_despatch_lines_orderItem` (`orderItemId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `invoices` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `ettn` char(36) NOT NULL, `documentNo` varchar(50) NULL, `seriesCode` varchar(3) NULL, `numberMode` varchar(10) NULL, `kind` varchar(10) NOT NULL DEFAULT 'SALES', `profileId` varchar(20) NOT NULL, `typeCode` varchar(20) NOT NULL DEFAULT 'SATIS', `status` varchar(15) NOT NULL DEFAULT 'DRAFT', `gibStatus` varchar(30) NULL, `providerRef` varchar(100) NULL, `objection` tinyint NOT NULL DEFAULT 0, `objectionNote` varchar(500) NULL, `issueDate` date NULL, `issueTime` varchar(8) NULL, `deliveryDate` date NULL, `issuedBeforeDelivery` tinyint NOT NULL DEFAULT 0, `lateIssueConfirmed` tinyint NOT NULL DEFAULT 0, `customerId` varchar(36) NULL, `supplierId` varchar(36) NULL, `orderIds` json NULL, `despatchRefs` json NULL, `billingReferences` json NULL, `sellerSnapshot` json NULL, `buyerSnapshot` json NULL, `currency` varchar(3) NOT NULL DEFAULT 'TRY', `exchangeRate` decimal(18,6) NOT NULL DEFAULT '1.000000', `exchangeRateSource` varchar(10) NULL, `exchangeRateDate` date NULL, `subtotal` decimal(14,2) NOT NULL DEFAULT '0.00', `documentDiscountAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `chargesTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `otvTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `taxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `withheldTaxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `notCollectedTaxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `grandTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `payableTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `subtotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', `taxTotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', `grandTotalTry` decimal(14,2) NOT NULL DEFAULT '0.00', `taxBreakdown` json NULL, `charges` json NULL, `internetSaleInfo` json NULL, `replacesDespatch` tinyint NOT NULL DEFAULT 0, `externalDocNo` varchar(50) NULL, `externalDocDate` date NULL, `paperReason` varchar(2) NULL, `gibNoticeRef` varchar(100) NULL, `returnId` varchar(36) NULL, `issuedBy` varchar(100) NULL, `issuedAt` datetime NULL, `cancelledAt` datetime NULL, `cancelledBy` varchar(100) NULL, `cancelReason` varchar(500) NULL, `notes` text NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_invoices_ettn` (`ettn`), INDEX `IDX_invoices_company_status` (`companyId`, `status`), UNIQUE INDEX `UQ_invoices_company_documentNo` (`companyId`, `documentNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `invoice_lines` (`id` varchar(36) NOT NULL, `invoiceId` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `lineNo` int NOT NULL DEFAULT '1', `orderItemId` varchar(36) NULL, `despatchLineId` varchar(36) NULL, `originalLineId` varchar(36) NULL, `productId` varchar(36) NULL, `productName` varchar(255) NOT NULL, `productSku` varchar(100) NULL, `quantity` decimal(18,4) NOT NULL, `unitCode` varchar(20) NULL, `unitFactor` decimal(12,4) NOT NULL DEFAULT '1.0000', `baseQuantity` decimal(18,4) NOT NULL, `unitPrice` decimal(18,6) NOT NULL DEFAULT '0.000000', `grossAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `discountAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `netAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `taxRate` decimal(5,2) NOT NULL DEFAULT '0.00', `taxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `taxes` json NULL, `exemptionCode` varchar(10) NULL, `vatNotCollected` tinyint NOT NULL DEFAULT 0, `withholdingCode` varchar(10) NULL, `withholdingRate` decimal(5,2) NULL, `withheldTaxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `otvCode` varchar(10) NULL, `otvRate` decimal(5,2) NULL, `otvAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `lineTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `tracking` json NULL, `returnedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', INDEX `IDX_invoice_lines_orderItem` (`orderItemId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `returns` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `returnNo` varchar(30) NOT NULL, `type` varchar(20) NOT NULL, `status` varchar(15) NOT NULL DEFAULT 'DRAFT', `invoiceId` varchar(36) NULL, `invoiceNo` varchar(50) NULL, `invoiceDate` date NULL, `orderId` varchar(36) NULL, `goodsReceiptId` varchar(36) NULL, `purchaseOrderId` varchar(36) NULL, `customerId` varchar(36) NULL, `supplierId` varchar(36) NULL, `partySnapshot` json NULL, `currency` varchar(3) NOT NULL DEFAULT 'TRY', `subtotal` decimal(14,2) NOT NULL DEFAULT '0.00', `taxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `withheldTaxTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `grandTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `taxBreakdown` json NULL, `refundChannel` varchar(20) NULL, `refundRef` varchar(100) NULL, `counterpartyDocNo` varchar(50) NULL, `counterpartyDocDate` date NULL, `counterpartyEttn` varchar(36) NULL, `deliveryDate` date NULL, `notifiedAt` datetime NULL, `withdrawalDeadline` date NULL, `goodsReturnDeadline` date NULL, `refundDueDate` date NULL, `goodsMovedAt` datetime NULL, `returnInvoiceId` varchar(36) NULL, `expenseVoucherId` varchar(36) NULL, `despatchId` varchar(36) NULL, `completedAt` datetime NULL, `completedBy` varchar(100) NULL, `note` text NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_returns_company_status` (`companyId`, `status`), UNIQUE INDEX `UQ_returns_company_returnNo` (`companyId`, `returnNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `return_items` (`id` varchar(36) NOT NULL, `returnId` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `invoiceLineId` varchar(36) NULL, `goodsReceiptItemId` varchar(36) NULL, `productId` varchar(36) NULL, `productName` varchar(255) NOT NULL, `productSku` varchar(100) NULL, `quantity` decimal(18,4) NOT NULL, `unitCode` varchar(20) NULL, `unitPrice` decimal(18,6) NOT NULL DEFAULT '0.000000', `netAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `taxRate` decimal(5,2) NOT NULL DEFAULT '0.00', `taxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `exemptionCode` varchar(10) NULL, `withholdingCode` varchar(10) NULL, `withholdingRate` decimal(5,2) NULL, `withheldTaxAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `lineTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `condition` varchar(12) NOT NULL DEFAULT 'RESELLABLE', `targetWarehouseId` varchar(36) NULL, `tracking` json NULL, `reversesMovementId` varchar(36) NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `goods_receipts` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `receiptNo` varchar(30) NOT NULL, `status` varchar(15) NOT NULL DEFAULT 'DRAFT', `purchaseOrderId` varchar(36) NOT NULL, `poNumber` varchar(50) NULL, `supplierId` varchar(36) NULL, `supplierSnapshot` json NULL, `warehouseId` varchar(36) NOT NULL, `receivedAt` datetime NOT NULL, `supplierDespatchNo` varchar(50) NULL, `supplierDespatchDate` date NULL, `supplierDespatchEttn` varchar(36) NULL, `supplierInvoiceNo` varchar(50) NULL, `supplierInvoiceDate` date NULL, `supplierInvoiceEttn` varchar(36) NULL, `supplierInvoiceAmount` decimal(14,2) NULL, `acceptedNetAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `currency` varchar(3) NOT NULL DEFAULT 'TRY', `buyerCarries` tinyint NOT NULL DEFAULT 0, `ownDespatchId` varchar(36) NULL, `requiresExpenseVoucher` tinyint NOT NULL DEFAULT 0, `expenseVoucherId` varchar(36) NULL, `hasDiscrepancy` tinyint NOT NULL DEFAULT 0, `note` text NULL, `completedAt` datetime NULL, `completedBy` varchar(100) NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_goods_receipts_company_po` (`companyId`, `purchaseOrderId`), UNIQUE INDEX `UQ_goods_receipts_company_receiptNo` (`companyId`, `receiptNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `goods_receipt_items` (`id` varchar(36) NOT NULL, `goodsReceiptId` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `purchaseOrderItemId` varchar(36) NOT NULL, `productId` varchar(36) NULL, `productName` varchar(255) NOT NULL, `productSku` varchar(100) NULL, `unitCode` varchar(20) NULL, `orderedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `despatchQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `countedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `rejectedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `rejectReason` varchar(20) NULL, `acceptedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `surplusQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `shortageQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', `unitPrice` decimal(18,6) NOT NULL DEFAULT '0.000000', `lots` json NULL, `serials` json NULL, `tracking` json NULL, `returnedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000', INDEX `IDX_goods_receipt_items_poItem` (`purchaseOrderItemId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `expense_vouchers` (`id` varchar(36) NOT NULL, `companyId` varchar(36) NOT NULL, `kind` varchar(20) NOT NULL DEFAULT 'GIDER_PUSULASI', `documentNo` varchar(50) NULL, `seriesCode` varchar(3) NULL, `numberMode` varchar(10) NULL, `status` varchar(15) NOT NULL DEFAULT 'DRAFT', `issueDate` date NULL, `deliveryDate` date NULL, `dueDate` date NULL, `supplierId` varchar(36) NULL, `sellerSnapshot` json NULL, `goodsReceiptId` varchar(36) NULL, `returnId` varchar(36) NULL, `currency` varchar(3) NOT NULL DEFAULT 'TRY', `lines` json NULL, `grossTotal` decimal(14,2) NOT NULL DEFAULT '0.00', `withholdingRate` decimal(5,2) NOT NULL DEFAULT '0.00', `withholdingAmount` decimal(14,2) NOT NULL DEFAULT '0.00', `otherDeductions` decimal(14,2) NOT NULL DEFAULT '0.00', `netPayable` decimal(14,2) NOT NULL DEFAULT '0.00', `paymentChannel` varchar(20) NULL, `paymentRef` varchar(100) NULL, `paidAt` date NULL, `signedCopyReceived` tinyint NOT NULL DEFAULT 0, `signedCopyAt` datetime NULL, `issuedBy` varchar(100) NULL, `issuedAt` datetime NULL, `cancelledAt` datetime NULL, `cancelledBy` varchar(100) NULL, `cancelReason` varchar(500) NULL, `note` text NULL, `createdBy` varchar(100) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_expense_vouchers_company_status` (`companyId`, `status`), UNIQUE INDEX `UQ_expense_vouchers_company_documentNo` (`companyId`, `documentNo`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "ALTER TABLE `companies` ADD `stockDeductOn` varchar(10) NOT NULL DEFAULT 'order'",
  "ALTER TABLE `companies` ADD `eDocumentMode` varchar(10) NOT NULL DEFAULT 'NONE'",
  "ALTER TABLE `companies` ADD `producerReceiptEnabled` tinyint NOT NULL DEFAULT 0",
  "ALTER TABLE `purchase_order_items` ADD `receivedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'",
  "ALTER TABLE `purchase_order_items` ADD `returnedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'",
  "ALTER TABLE `order_items` ADD `despatchedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'",
  "ALTER TABLE `order_items` ADD `invoicedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'",
  "ALTER TABLE `order_items` ADD `returnedQuantity` decimal(18,4) NOT NULL DEFAULT '0.0000'",
  "ALTER TABLE `orders` ADD `stockMode` varchar(10) NOT NULL DEFAULT 'order'",
  "ALTER TABLE `orders` ADD `documentsLegacy` tinyint NOT NULL DEFAULT 0",
  "ALTER TABLE `orders` ADD `okcReceiptNo` varchar(50) NULL",
  "ALTER TABLE `orders` ADD `okcReceiptDate` date NULL",
  "ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_orders_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `orders` ADD CONSTRAINT `FK_orders_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `document_series` ADD CONSTRAINT `FK_document_series_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `document_sequences` ADD CONSTRAINT `FK_document_sequences_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `despatches` ADD CONSTRAINT `FK_despatches_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `despatch_lines` ADD CONSTRAINT `FK_despatch_lines_despatch` FOREIGN KEY (`despatchId`) REFERENCES `despatches`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE `invoices` ADD CONSTRAINT `FK_invoices_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `invoice_lines` ADD CONSTRAINT `FK_invoice_lines_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE `returns` ADD CONSTRAINT `FK_returns_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `return_items` ADD CONSTRAINT `FK_return_items_return` FOREIGN KEY (`returnId`) REFERENCES `returns`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE `goods_receipts` ADD CONSTRAINT `FK_goods_receipts_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
  "ALTER TABLE `goods_receipt_items` ADD CONSTRAINT `FK_goods_receipt_items_receipt` FOREIGN KEY (`goodsReceiptId`) REFERENCES `goods_receipts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION",
  "ALTER TABLE `expense_vouchers` ADD CONSTRAINT `FK_expense_vouchers_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION",
];

export class DocumentRegime1784274135000 implements MigrationInterface {
  name = 'DocumentRegime1784274135000';

  public async up(q: QueryRunner): Promise<void> {
    for (const sql of SCHEMA) await q.query(sql);

    // C/D backfill
    await q.query("UPDATE `companies` SET `stockDeductOn` = 'despatch' WHERE `country` = 'TR'");
    await q.query("UPDATE `orders` SET `stockMode` = 'order', `documentsLegacy` = 1");
    await q.query("UPDATE `order_items` oi JOIN `orders` o ON o.`id` = oi.`orderId` SET oi.`despatchedQuantity` = oi.`quantity` WHERE o.`status` = 'Completed'");
    await q.query(
      "UPDATE `purchase_order_items` pi JOIN `purchase_orders` po ON po.`id` = pi.`purchaseOrderId` SET pi.`receivedQuantity` = pi.`quantity` WHERE po.`status` IN ('Received', 'Partially Received')",
    );
    const companies: { id: string }[] = await q.query('SELECT `id` FROM `companies`');
    for (const c of companies) {
      for (const s of DEFAULT_SERIES) {
        await q.query(
          'INSERT IGNORE INTO `document_series` (`id`, `companyId`, `kind`, `mode`, `seriesCode`, `isDefault`, `isActive`, `note`) VALUES (?, ?, ?, ?, ?, 1, 1, ?)',
          [randomUUID(), c.id, s.kind, s.mode, s.seriesCode, s.note],
        );
      }
    }

    // E
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP4_PARAMETER_KEYS.includes(x.key))) {
      await q.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'migration'],
      );
    }
    await ensureDocumentTriggers((sql, params) => q.query(sql, params));
  }

  public async down(q: QueryRunner): Promise<void> {
    await dropDocumentTriggers((sql, params) => q.query(sql, params));
    await q.query("DELETE FROM `legal_parameters` WHERE `key` IN (?) AND `createdBy` = 'migration'", [WP4_PARAMETER_KEYS]);
    for (const fk of [
      ['expense_vouchers', 'FK_expense_vouchers_company'],
      ['goods_receipt_items', 'FK_goods_receipt_items_receipt'],
      ['goods_receipts', 'FK_goods_receipts_company'],
      ['return_items', 'FK_return_items_return'],
      ['returns', 'FK_returns_company'],
      ['invoice_lines', 'FK_invoice_lines_invoice'],
      ['invoices', 'FK_invoices_company'],
      ['despatch_lines', 'FK_despatch_lines_despatch'],
      ['despatches', 'FK_despatches_company'],
      ['document_sequences', 'FK_document_sequences_company'],
      ['document_series', 'FK_document_series_company'],
    ]) {
      await q.query(`ALTER TABLE \`${fk[0]}\` DROP FOREIGN KEY \`${fk[1]}\``);
    }
    for (const t of ['expense_vouchers', 'goods_receipt_items', 'goods_receipts', 'return_items', 'returns', 'invoice_lines', 'invoices', 'despatch_lines', 'despatches', 'document_sequences', 'document_series']) {
      await q.query(`DROP TABLE \`${t}\``);
    }
    await q.query('ALTER TABLE `orders` DROP FOREIGN KEY `FK_orders_company`');
    await q.query('ALTER TABLE `purchase_orders` DROP FOREIGN KEY `FK_purchase_orders_company`');
    await q.query('ALTER TABLE `orders` ADD CONSTRAINT `FK_orders_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
    await q.query('ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_orders_company` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
    for (const [t, c] of [
      ['orders', 'okcReceiptDate'], ['orders', 'okcReceiptNo'], ['orders', 'documentsLegacy'], ['orders', 'stockMode'],
      ['order_items', 'returnedQuantity'], ['order_items', 'invoicedQuantity'], ['order_items', 'despatchedQuantity'],
      ['purchase_order_items', 'returnedQuantity'], ['purchase_order_items', 'receivedQuantity'],
      ['companies', 'producerReceiptEnabled'], ['companies', 'eDocumentMode'], ['companies', 'stockDeductOn'],
    ]) {
      await q.query(`ALTER TABLE \`${t}\` DROP COLUMN \`${c}\``);
    }
  }
}
