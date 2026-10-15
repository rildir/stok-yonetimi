import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { ValuationService } from './valuation.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { CostingService } from './costing.service';
import { InventoryReportService } from './inventory-report.service';
import { TaxReportService } from './tax-report.service';
import { DisposalService } from './disposal.service';
import { ImpairmentService } from './impairment.service';
import { JournalService } from './journal.service';
import { TraceabilityService } from './traceability.service';
import { PriceService } from './price.service';
import { InventoryAccountingDemoSeeder } from './demo-inventory-accounting.seed';
import {
  AccountingController,
  AccountingReportController,
  CostingController,
  DisposalController,
  FiscalPeriodController,
  Gs1Controller,
  ImpairmentController,
  LotController,
  PriceController,
  StockCountReportController,
} from './inventory-accounting.controller';

/**
 * WP6: costing, fiscal periods and closing, period-end inventory and tax pre-reports, wastage /
 * disposal, impairment, journal export, prices and food traceability.
 */
@Module({
  imports: [SharedModule, GatewayModule],
  controllers: [
    FiscalPeriodController,
    CostingController,
    AccountingReportController,
    StockCountReportController,
    DisposalController,
    ImpairmentController,
    AccountingController,
    LotController,
    Gs1Controller,
    PriceController,
  ],
  providers: [
    ValuationService,
    FiscalPeriodService,
    CostingService,
    InventoryReportService,
    TaxReportService,
    DisposalService,
    ImpairmentService,
    JournalService,
    TraceabilityService,
    PriceService,
    InventoryAccountingDemoSeeder,
  ],
  exports: [ValuationService, FiscalPeriodService, CostingService, PriceService],
})
export class InventoryAccountingModule {}
