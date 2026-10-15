import { ApiSecurity, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Roles } from '../../guards/roles.decorator';
import {
  ApproveDespatchDto,
  CancelDocumentDto,
  CompleteReturnDto,
  CreateDespatchDto,
  CreateGoodsReceiptDto,
  CreateReturnDto,
  CreateSeriesDto,
  ExpenseVoucherDto,
  InvoiceDraftDto,
  InvoiceFromDespatchesDto,
  IssueInvoiceDto,
  IssueVoucherDto,
  ObjectionDto,
  OrderDespatchDto,
  OwnDespatchDto,
  ReceiveDespatchDto,
  ReturnRefundDto,
  SignedCopyDto,
  SupplierInvoiceDto,
  UpdateInvoiceDto,
  UpdateSeriesDto,
} from '../../dto/documents.dto';
import { DespatchService } from './despatch.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';
import { GoodsReceiptService } from './goods-receipt.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { DocumentNumberService } from './document-number.service';
import { DocumentComplianceService } from './document-compliance.service';
import { DocumentPrintService } from './document-print.service';

const who = (req: any): string | undefined => req?.user?.username;
const HTML = 'text/html; charset=utf-8';

@ApiTags('Belgeler: İrsaliye')
@ApiSecurity('api-key')
@Controller('despatches')
export class DespatchController {
  constructor(private readonly svc: DespatchService, private readonly print: DocumentPrintService) {}

  @Get()
  list(@Query('status') status?: string, @Query('purpose') purpose?: string, @Query('orderId') orderId?: string) {
    return this.svc.list({ status, purpose, orderId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/print')
  @Header('Content-Type', HTML)
  printView(@Param('id') id: string) {
    return this.print.despatch(id);
  }

  @ApiOperation({ summary: 'Satış dışı irsaliye taslağı (transfer, konsinye, tamir, numune, fason, iade)' })
  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateDespatchDto, @Req() req: any) {
    return this.svc.create(dto as any, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: OrderDespatchDto, @Req() req: any) {
    return this.svc.update(id, dto as any, who(req));
  }

  @ApiOperation({ summary: 'Taslak irsaliyeyi sil (onaylanmış irsaliye silinemez / iptal edilemez)' })
  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @ApiOperation({ summary: 'İrsaliyeyi onayla: numara verilir, stok (sevk) düşer, belge dondurulur' })
  @Roles('admin', 'manager')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveDespatchDto, @Req() req: any) {
    return this.svc.approve(id, dto, who(req));
  }

  @ApiOperation({ summary: 'Transfer irsaliyesi: hedef depoda teslim al' })
  @Roles('admin', 'manager')
  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceiveDespatchDto, @Req() req: any) {
    return this.svc.receive(id, dto, who(req));
  }

  @ApiOperation({ summary: 'İrsaliye iptal edilemez: her zaman 409 DESPATCH_CANNOT_BE_CANCELLED' })
  @Roles('admin', 'manager')
  @Post(':id/cancel')
  cancel() {
    return this.svc.cancel();
  }
}

@ApiTags('Belgeler: Fatura')
@ApiSecurity('api-key')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly svc: InvoiceService, private readonly print: DocumentPrintService) {}

  @Get()
  list(@Query('status') status?: string, @Query('orderId') orderId?: string, @Query('kind') kind?: string) {
    return this.svc.list({ status, orderId, kind });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/print')
  @Header('Content-Type', HTML)
  printView(@Param('id') id: string) {
    return this.print.invoice(id);
  }

  @ApiOperation({ summary: 'Toplu fatura: aynı alıcının onaylı irsaliyelerinden fatura taslağı' })
  @Roles('admin', 'manager')
  @Post('from-despatches')
  fromDespatches(@Body() dto: InvoiceFromDespatchesDto, @Req() req: any) {
    const { despatchIds, ...rest } = dto;
    return this.svc.createFromDespatches(despatchIds, rest as any, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.svc.update(id, dto as any);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @ApiOperation({ summary: 'Faturayı düzenle (numara verilir, belge dondurulur; 7 gün aşımı açık onay ister)' })
  @Roles('admin', 'manager')
  @Post(':id/issue')
  issue(@Param('id') id: string, @Body() dto: IssueInvoiceDto, @Req() req: any) {
    return this.svc.issue(id, dto, who(req));
  }

  @ApiOperation({ summary: 'Düzenlenmiş faturayı iptal et (gerekçe zorunlu)' })
  @Roles('admin', 'manager')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelDocumentDto, @Req() req: any) {
    return this.svc.cancel(id, dto.reason, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id/objection')
  objection(@Param('id') id: string, @Body() dto: ObjectionDto) {
    return this.svc.setObjection(id, dto.objection, dto.note);
  }
}

@ApiTags('Belgeler: Sipariş')
@ApiSecurity('api-key')
@Controller('orders')
export class OrderDocumentsController {
  constructor(
    private readonly despatches: DespatchService,
    private readonly invoices: InvoiceService,
    private readonly returns: ReturnService,
    private readonly print: DocumentPrintService,
  ) {}

  @ApiOperation({ summary: 'Siparişten irsaliye taslağı (varsayılan: kalan miktarlar)' })
  @Roles('admin', 'manager')
  @Post(':id/despatch')
  despatch(@Param('id') id: string, @Body() dto: OrderDespatchDto, @Req() req: any) {
    return this.despatches.createFromOrder(id, dto as any, who(req));
  }

  @ApiOperation({ summary: 'Siparişten fatura taslağı (irsaliye no / tarihi otomatik)' })
  @Roles('admin', 'manager')
  @Post(':id/invoice')
  invoice(@Param('id') id: string, @Body() dto: InvoiceDraftDto, @Req() req: any) {
    return this.invoices.createFromOrder(id, dto as any, who(req));
  }

  @ApiOperation({ summary: 'Sipariş belge zinciri: irsaliyeler, faturalar, iadeler' })
  @Get(':id/documents')
  async documents(@Param('id') id: string) {
    const [despatches, invoices, returns] = await Promise.all([this.despatches.list({ orderId: id }), this.invoices.list({ orderId: id }), this.returns.list({ orderId: id })]);
    return { despatches, invoices, returns };
  }

  @ApiOperation({ summary: 'Sevk / toplama listesi (mali değeri yoktur)' })
  @Get(':id/picking-list')
  @Header('Content-Type', HTML)
  pickingList(@Param('id') id: string) {
    return this.print.pickingList(id);
  }
}

@ApiTags('Belgeler: Mal kabul')
@ApiSecurity('api-key')
@Controller()
export class GoodsReceiptController {
  constructor(private readonly svc: GoodsReceiptService, private readonly print: DocumentPrintService) {}

  @Get('goods-receipts')
  list(@Query('purchaseOrderId') purchaseOrderId?: string, @Query('status') status?: string) {
    return this.svc.list({ purchaseOrderId, status });
  }

  @Get('goods-receipts/:id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get('goods-receipts/:id/print')
  @Header('Content-Type', HTML)
  printView(@Param('id') id: string) {
    return this.print.goodsReceipt(id);
  }

  @ApiOperation({ summary: 'Satın alma siparişi için mal kabul (teslim alınan, reddedilen, fark; complete=true ile stoğa al)' })
  @Roles('admin', 'manager')
  @Post('purchase-orders/:id/goods-receipts')
  create(@Param('id') id: string, @Body() dto: CreateGoodsReceiptDto, @Req() req: any) {
    return this.svc.create(id, dto as any, who(req));
  }

  @Get('purchase-orders/:id/print')
  @Header('Content-Type', HTML)
  poForm(@Param('id') id: string) {
    return this.print.purchaseOrderForm(id);
  }

  @Roles('admin', 'manager')
  @Post('goods-receipts/:id/complete')
  complete(@Param('id') id: string, @Req() req: any) {
    return this.svc.complete(id, who(req));
  }

  @Roles('admin', 'manager')
  @Put('goods-receipts/:id/supplier-invoice')
  supplierInvoice(@Param('id') id: string, @Body() dto: SupplierInvoiceDto) {
    return this.svc.setSupplierInvoice(id, dto);
  }

  @ApiOperation({ summary: 'Alıcı taşıyor: şirketin kendi irsaliyesini düzenle' })
  @Roles('admin', 'manager')
  @Post('goods-receipts/:id/own-despatch')
  ownDespatch(@Param('id') id: string, @Body() dto: OwnDespatchDto, @Req() req: any) {
    return this.svc.createOwnDespatch(id, dto, who(req));
  }

  @Roles('admin', 'manager')
  @Delete('goods-receipts/:id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

@ApiTags('Belgeler: İade')
@ApiSecurity('api-key')
@Controller('returns')
export class ReturnController {
  constructor(private readonly svc: ReturnService, private readonly print: DocumentPrintService) {}

  @Get()
  list(@Query('type') type?: string, @Query('status') status?: string, @Query('invoiceId') invoiceId?: string, @Query('orderId') orderId?: string) {
    return this.svc.list({ type, status, invoiceId, orderId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/print')
  @Header('Content-Type', HTML)
  printView(@Param('id') id: string) {
    return this.print.returnDoc(id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateReturnDto, @Req() req: any) {
    return this.svc.create(dto as any, who(req));
  }

  @ApiOperation({ summary: 'İadeyi tamamla: RETURN stok hareketleri (orijinal harekete bağlı)' })
  @Roles('admin', 'manager')
  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto: CompleteReturnDto, @Req() req: any) {
    return this.svc.complete(id, dto, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id/refund')
  refund(@Param('id') id: string, @Body() dto: ReturnRefundDto) {
    return this.svc.updateRefund(id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}

@ApiTags('Belgeler: Gider pusulası')
@ApiSecurity('api-key')
@Controller('expense-vouchers')
export class ExpenseVoucherController {
  constructor(private readonly svc: ExpenseVoucherService, private readonly print: DocumentPrintService) {}

  @Get()
  list(@Query('status') status?: string, @Query('kind') kind?: string) {
    return this.svc.list({ status, kind });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/print')
  @Header('Content-Type', HTML)
  printView(@Param('id') id: string) {
    return this.print.expenseVoucher(id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: ExpenseVoucherDto, @Req() req: any) {
    return this.svc.create(dto as any, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: ExpenseVoucherDto) {
    return this.svc.update(id, dto as any);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Roles('admin', 'manager')
  @Post(':id/issue')
  issue(@Param('id') id: string, @Body() dto: IssueVoucherDto, @Req() req: any) {
    return this.svc.issue(id, dto, who(req));
  }

  @Roles('admin', 'manager')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelDocumentDto, @Req() req: any) {
    return this.svc.cancel(id, dto.reason, who(req));
  }

  @Roles('admin', 'manager')
  @Put(':id/signed-copy')
  signed(@Param('id') id: string, @Body() dto: SignedCopyDto) {
    return this.svc.setSignedCopy(id, dto);
  }
}

@ApiTags('Belgeler: Seriler ve uyum')
@ApiSecurity('api-key')
@Controller()
export class DocumentAdminController {
  constructor(private readonly numbers: DocumentNumberService, private readonly compliance: DocumentComplianceService) {}

  @Get('document-series')
  series() {
    return this.numbers.list();
  }

  @Get('document-series/counters')
  counters() {
    return this.numbers.counters();
  }

  @Roles('admin')
  @Post('document-series')
  createSeries(@Body() dto: CreateSeriesDto) {
    return this.numbers.create(dto);
  }

  @Roles('admin')
  @Put('document-series/:id')
  updateSeries(@Param('id') id: string, @Body() dto: UpdateSeriesDto) {
    return this.numbers.update(id, dto);
  }

  @ApiOperation({ summary: 'VUK 231/5: faturalanmamış teslimatlar (5. gün uyarı, 7. gün kritik)' })
  @Get('compliance/uninvoiced-deliveries')
  uninvoiced() {
    return this.compliance.uninvoicedDeliveries();
  }

  @ApiOperation({ summary: 'Tedarikçi faturası gelmemiş mal kabuller' })
  @Get('compliance/receipts-without-invoice')
  receiptsWithoutInvoice() {
    return this.compliance.receiptsWithoutInvoice();
  }

  @ApiOperation({ summary: 'Düzenlenmesi bekleyen gider pusulaları' })
  @Get('compliance/pending-expense-vouchers')
  pendingVouchers() {
    return this.compliance.pendingExpenseVouchers();
  }

  @Get('compliance/document-summary')
  summary() {
    return this.compliance.summary();
  }
}
