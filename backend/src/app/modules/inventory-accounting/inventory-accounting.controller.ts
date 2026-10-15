import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { Roles } from '../../guards/roles.decorator';
import { err } from '../../shared/i18n/app-error';
import { resolveLang, translate } from '../../shared/i18n/messages';
import { FiscalPeriodService } from './fiscal-period.service';
import { CostingService, LandedCostInput } from './costing.service';
import { InventoryReportService } from './inventory-report.service';
import { TaxReportService } from './tax-report.service';
import { DisposalService } from './disposal.service';
import { ImpairmentService } from './impairment.service';
import { JournalService } from './journal.service';
import { TraceabilityService } from './traceability.service';
import { PriceService } from './price.service';
import { Breakdown } from './valuation.service';
import { AccountMappingDto, DisposalCreateDto, DisposalTransitionDto, LotGenealogyDto, LotStatusDto, RecallDto, RecallUpdateDto } from '../../dto/inventory-accounting.dto';

const HTML = 'text/html; charset=utf-8';
const breakdownOf = (v?: string): Breakdown => (v === 'warehouse' || v === 'lot' ? v : 'product');
const userOf = (req: any) => req?.user?.username || 'System';
/**
 * Cost values, tax pre-reports, journal data and customer trace data (names / VKN / TCKN) are
 * restricted to administrators and managers; the read-only viewer role does not see them.
 */
const STAFF = ['admin', 'manager'];

@ApiTags('fiscal-periods')
@ApiSecurity('api-key')
@Controller('fiscal-periods')
export class FiscalPeriodController {
  constructor(private readonly svc: FiscalPeriodService) {}

  @Get()
  list(@Query('year') year?: string) {
    return this.svc.list(year ? Number(year) : undefined);
  }

  @Get(':id/checks')
  checks(@Param('id') id: string) {
    return this.svc.checks(id);
  }

  @Roles(...STAFF)
  @Get(':id/snapshot')
  snapshot(@Param('id') id: string) {
    return this.svc.snapshot(id);
  }

  @Roles('admin')
  @Post(':id/close')
  @ApiOperation({ summary: 'Dönemi kapat: kontroller, kapanış bakiyesi snapshot, kilit (VUK 174)' })
  close(@Param('id') id: string, @Req() req: any) {
    return this.svc.close(id, userOf(req));
  }

  @Roles('admin')
  @Post(':id/reopen')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Yeniden açma talebi (gerekçe zorunlu; ikinci yöneticinin onayıyla geçerli)' })
  async reopen(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    const out = await this.svc.requestReopen(id, reason, userOf(req));
    return { ...out, message: translate(out.code, resolveLang(req.headers?.['accept-language'])) };
  }

  @Roles('admin')
  @Put('start-month')
  startMonth(@Body('month') month: number) {
    return this.svc.setFiscalYearStartMonth(month);
  }
}

@ApiTags('costing')
@ApiSecurity('api-key')
@Controller('costing')
export class CostingController {
  constructor(private readonly svc: CostingService) {}

  @Get('settings')
  settings() {
    return this.svc.settings();
  }

  @Roles('admin')
  @Put('method')
  @ApiOperation({ summary: 'Maliyet yöntemi değişikliği (yalnızca açık mali yıl başında; gerekçe audit log’a yazılır)' })
  method(@Body() body: { method: string; effectiveFrom: string; reason: string; postReceiptFxPolicy?: string }, @Req() req: any) {
    return this.svc.changeMethod(body, userOf(req));
  }

  @Roles('admin')
  @Put('fx-policy')
  fxPolicy(@Body('policy') policy: string) {
    return this.svc.setFxPolicy(policy);
  }

  @Roles(...STAFF)
  @Get('products/:id')
  productCost(@Param('id') id: string) {
    return this.svc.productCost(id);
  }

  @Roles(...STAFF)
  @Get('landed-costs')
  landed(@Query('goodsReceiptId') goodsReceiptId?: string) {
    return this.svc.listLandedCosts(goodsReceiptId);
  }

  @Roles('admin', 'manager')
  @Post('landed-costs')
  @ApiOperation({ summary: 'Ek maliyet dağıtımı (nakliye, gümrük, sigorta, depolama...; VUK 262)' })
  addLanded(@Body() body: LandedCostInput, @Req() req: any) {
    return this.svc.addLandedCost(body, userOf(req));
  }

  @Roles('admin')
  @Post('opening-import')
  @ApiOperation({ summary: 'Açılış maliyeti CSV (sku;lotNumber;unitCost)' })
  openingImport(@Body('csv') csv: string, @Req() req: any) {
    return this.svc.importOpeningCosts(csv, userOf(req));
  }
}

@ApiTags('reports')
@ApiSecurity('api-key')
@Roles(...STAFF)
@Controller('reports')
export class AccountingReportController {
  constructor(
    private readonly inventory: InventoryReportService,
    private readonly tax: TaxReportService,
    private readonly impairment: ImpairmentService,
    private readonly trace: TraceabilityService,
    private readonly disposals: DisposalService,
  ) {}

  @Get('inventory-list')
  @ApiOperation({ summary: 'Envanter listesi (maliyet bedeli, asOf); format=html imzaya hazır çıktı' })
  async inventoryList(@Query('asOf') asOf: string, @Query('breakdown') breakdown: string, @Query('warehouseId') warehouseId: string, @Query('format') format: string, @Res({ passthrough: true }) res: any) {
    if (format === 'html') {
      res.type(HTML);
      return this.inventory.inventoryListHtml(asOf, breakdownOf(breakdown || 'lot'), warehouseId || undefined);
    }
    return this.inventory.inventoryList(asOf, breakdownOf(breakdown), warehouseId || undefined);
  }

  @Get('stock-ledger')
  stockLedger(@Query('productId') productId: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!productId) throw new BadRequestException(err('PRODUCT_NOT_FOUND'));
    return this.inventory.stockLedger(productId, from, to);
  }

  @Get('inventory-summary')
  async inventorySummary(@Query('asOf') asOf: string, @Query('format') format: string, @Res({ passthrough: true }) res: any) {
    if (format === 'html') {
      res.type(HTML);
      return this.inventory.inventorySummaryHtml(asOf);
    }
    return this.inventory.inventorySummary(asOf);
  }

  @Get('e-envanter')
  async eEnvanter(@Query('asOf') asOf: string, @Query('format') format: string, @Res({ passthrough: true }) res: any) {
    if (format === 'xlsx') {
      const out = (await this.inventory.eEnvanterExport(asOf, 'xlsx')) as { buffer: Buffer; fileName: string };
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${out.fileName}"` });
      return new StreamableFile(out.buffer);
    }
    return this.inventory.eEnvanterExport(asOf, 'json');
  }

  @Get('physical-count-status')
  countStatus() {
    return this.inventory.countPolicyStatus();
  }

  @Get('vat')
  @ApiOperation({ summary: 'KDV ön raporu (period=YYYY-MM). Ön rapordur, beyanname yerine geçmez.' })
  async vat(@Query('period') period: string, @Query('format') format: string, @Res({ passthrough: true }) res: any) {
    if (format === 'html') {
      res.type(HTML);
      return this.tax.vatReportHtml(period);
    }
    return this.tax.vatReport(period);
  }

  @Get('vat-withholding')
  @ApiOperation({ summary: 'KDV-2 ön raporu (period=YYYY-MM)' })
  vatWithholding(@Query('period') period: string) {
    return this.tax.vatWithholdingReport(period);
  }

  @Get('vat-impact-movements')
  @ApiOperation({ summary: 'KDV etkili hareketler: işletmeden çekme / hediye (emsal bedel), zayi (KDV düzeltmesi)' })
  vatImpact(@Query('period') period: string) {
    return this.tax.vatImpactMovements(period);
  }

  @Get('wastage')
  wastage(@Query('from') from?: string, @Query('to') to?: string) {
    return this.tax.wastageReport(from, to);
  }

  @Get('impairment-candidates')
  impairmentCandidates(@Query('date') date?: string) {
    return this.impairment.candidates(date);
  }

  @Get('traceability')
  @ApiOperation({ summary: 'İzlenebilirlik: lotId | lotNumber (+productId) | serial' })
  traceability(@Query('lotId') lotId?: string, @Query('lotNumber') lotNumber?: string, @Query('productId') productId?: string, @Query('serial') serial?: string) {
    return this.trace.trace({ lotId, lotNumber, productId, serial });
  }

  @Get('disposal-ratio')
  disposalRatio(@Query('year') year?: string) {
    return this.disposals.yearlyRatioReport(year ? Number(year) : undefined);
  }
}

@ApiTags('stock-counts')
@ApiSecurity('api-key')
@Controller('stock-counts')
export class StockCountReportController {
  constructor(private readonly inventory: InventoryReportService) {}

  @Get(':id/report')
  @Header('Content-Type', HTML)
  report(@Param('id') id: string) {
    return this.inventory.countReportHtml(id);
  }

  @Get(':id/roll')
  roll(@Param('id') id: string) {
    return this.inventory.countRoll(id);
  }
}

@ApiTags('disposals')
@ApiSecurity('api-key')
@Roles(...STAFF)
@Controller('disposals')
export class DisposalController {
  constructor(private readonly svc: DisposalService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.svc.list(status || undefined);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/tutanak')
  @Header('Content-Type', HTML)
  tutanak(@Param('id') id: string) {
    return this.svc.tutanakHtml(id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Body() body: DisposalCreateDto, @Req() req: any) {
    return this.svc.create(body, userOf(req));
  }

  @Roles('admin')
  @Post(':id/transition')
  transition(@Param('id') id: string, @Body() body: DisposalTransitionDto, @Req() req: any) {
    return this.svc.transition(id, body, userOf(req));
  }
}

@ApiTags('impairment')
@ApiSecurity('api-key')
@Roles(...STAFF)
@Controller('impairment')
export class ImpairmentController {
  constructor(private readonly svc: ImpairmentService) {}

  @Get()
  list(@Query('date') date?: string) {
    return this.svc.list(date || undefined);
  }

  @Get('sheet')
  @Header('Content-Type', HTML)
  sheet(@Query('date') date: string) {
    return this.svc.sheetHtml(date);
  }

  @Roles('admin')
  @Post()
  post(@Body() body: { valuationDate: string; productIds: string[]; note?: string }, @Req() req: any) {
    return this.svc.post(body.valuationDate, body.productIds, body.note, userOf(req));
  }
}

@ApiTags('accounting')
@ApiSecurity('api-key')
@Roles(...STAFF)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly svc: JournalService) {}

  @Get('mappings')
  mappings() {
    return this.svc.mappings();
  }

  @Roles('admin')
  @Post('mappings')
  addMapping(@Body() body: AccountMappingDto) {
    return this.svc.saveMapping({ ...body, id: undefined });
  }

  @Roles('admin')
  @Put('mappings/:id')
  updateMapping(@Param('id') id: string, @Body() body: AccountMappingDto) {
    return this.svc.saveMapping({ ...body, id });
  }

  @Roles('admin')
  @Delete('mappings/:id')
  deleteMapping(@Param('id') id: string) {
    return this.svc.deleteMapping(id);
  }

  @Get('journal-batches')
  batches() {
    return this.svc.listBatches();
  }

  @Roles('admin', 'manager')
  @Get('journal-export')
  @ApiOperation({ summary: 'Yevmiye fişi aktarımı (from, to, format=json|csv|xlsx, exportBatchId: idempotent). Yalnızca bilanço esası.' })
  async journal(@Query('from') from: string, @Query('to') to: string, @Query('format') format: string, @Query('exportBatchId') exportBatchId: string, @Query('locale') locale: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const { content, repeated } = await this.svc.export(from, to, exportBatchId || null, userOf(req));
    res.set('X-Export-Batch-Id', content.exportBatchId);
    res.set('X-Export-Repeated', repeated ? 'true' : 'false');
    if (format === 'csv' || format === 'xlsx') {
      const out = this.svc.render(content, format, locale === 'en' ? 'en' : 'tr');
      res.set({ 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.fileName}"` });
      return typeof out.body === 'string' ? out.body : new StreamableFile(out.body);
    }
    return { ...content, repeated };
  }
}

@ApiTags('lots')
@ApiSecurity('api-key')
@Controller('lots')
export class LotController {
  constructor(private readonly svc: TraceabilityService) {}

  @Get('quarantine-suggestions')
  quarantine() {
    return this.svc.quarantineSuggestions();
  }

  @Roles(...STAFF)
  @Get('recalls')
  recalls() {
    return this.svc.listRecalls();
  }

  @Get('mock-recall-status')
  mockStatus() {
    return this.svc.mockRecallStatus();
  }

  @Roles('admin', 'manager')
  @Post('recall')
  @ApiOperation({ summary: 'Geri çağırma: lotlar bloke edilir, müşteri listesi çıkarılır, lot.recalled webhook (isMock: tatbikat)' })
  recall(@Body() body: RecallDto, @Req() req: any) {
    return this.svc.recall(body, userOf(req));
  }

  @Roles('admin', 'manager')
  @Patch('recalls/:id')
  updateRecall(@Param('id') id: string, @Body() body: RecallUpdateDto) {
    return this.svc.updateRecall(id, body);
  }

  @Roles('admin', 'manager')
  @Post('status')
  status(@Body() body: LotStatusDto) {
    return this.svc.setLotStatus(body);
  }

  @Roles('admin', 'manager')
  @Post('genealogy')
  genealogy(@Body() body: LotGenealogyDto, @Req() req: any) {
    return this.svc.addGenealogy(body, userOf(req));
  }
}

@ApiTags('gs1')
@ApiSecurity('api-key')
@Controller('gs1')
export class Gs1Controller {
  constructor(private readonly svc: TraceabilityService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  parse(@Body('code') code: string) {
    return this.svc.parseGs1(code);
  }

  @Get('next-gtin')
  next() {
    return this.svc.nextGtin();
  }
}

@ApiTags('prices')
@ApiSecurity('api-key')
@Controller()
export class PriceController {
  constructor(private readonly svc: PriceService, private readonly trace: TraceabilityService) {}

  @Get('prices/labels')
  @Header('Content-Type', HTML)
  labels(@Query('ids') ids: string) {
    return this.svc.labelsHtml(String(ids || '').split(',').map((s) => s.trim()).filter(Boolean));
  }

  @Get('prices/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="fiyat-listesi.csv"')
  exportCsv(@Query('locale') locale?: string) {
    return this.svc.priceListCsv(locale === 'en' ? 'en' : 'tr');
  }

  @Get('prices/:productId/history')
  history(@Param('productId') productId: string) {
    return this.svc.history(productId);
  }

  @Get('prices/:productId/reference')
  reference(@Param('productId') productId: string, @Query('at') at?: string) {
    return this.svc.reference(productId, at);
  }

  @Roles(...STAFF)
  @Get('serials/:serial/trace')
  serial(@Param('serial') serial: string) {
    return this.trace.serialTrace(serial);
  }
}
