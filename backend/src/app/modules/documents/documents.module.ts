import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { DocumentNumberService } from './document-number.service';
import { DocumentHooks } from './document-support';
import { DespatchService } from './despatch.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';
import { GoodsReceiptService } from './goods-receipt.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { DocumentComplianceService } from './document-compliance.service';
import { DocumentPrintService } from './document-print.service';
import { DocumentsDemoSeeder } from './demo-documents.seed';
import {
  DespatchController,
  DocumentAdminController,
  ExpenseVoucherController,
  GoodsReceiptController,
  InvoiceController,
  OrderDocumentsController,
  ReturnController,
} from './documents.controller';

/** WP4 document regime: numbering, despatch advices, invoices, returns, goods receipts, expense vouchers. */
@Module({
  imports: [SharedModule, GatewayModule],
  controllers: [DespatchController, InvoiceController, OrderDocumentsController, GoodsReceiptController, ReturnController, ExpenseVoucherController, DocumentAdminController],
  providers: [DocumentNumberService, DocumentHooks, DespatchService, InvoiceService, ReturnService, GoodsReceiptService, ExpenseVoucherService, DocumentComplianceService, DocumentPrintService, DocumentsDemoSeeder],
  exports: [DocumentNumberService, DocumentHooks, DespatchService, InvoiceService, ReturnService, GoodsReceiptService, ExpenseVoucherService, DocumentComplianceService],
})
export class DocumentsModule {}
