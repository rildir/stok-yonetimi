import { Body, Controller, Delete, Get, Header, Headers, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../guards/roles.decorator';
import { resolveLang } from '../../shared/i18n/messages';
import { API_KEY_RESOURCES } from '../../shared/integrations/api-key';
import { WEBHOOK_EVENTS } from '../../shared/integrations/webhook-signature';
import { CreateApiKeyDto, CreateWebhookDto, CsvImportDto, UpdateWebhookDto } from '../../dto/integrations.dto';
import { AuditService } from './audit.service';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from './webhook.service';
import { ImportExportService } from './import-export.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@Roles('admin')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Denetim kaydı (Admin) — filtre + sayfalama' })
  list(
    @Query('username') username?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.list({ username, entityType, entityId, action, from, to, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get('meta')
  @ApiOperation({ summary: 'Filtre seçenekleri (varlık türleri, eylemler, kullanıcılar)' })
  meta() {
    return this.audit.meta();
  }
}

@ApiTags('API Keys')
@ApiBearerAuth()
@Roles('admin')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get('resources')
  resources() {
    return API_KEY_RESOURCES;
  }

  @Get()
  list() {
    return this.keys.list();
  }

  @Post()
  @ApiOperation({ summary: 'API anahtarı oluştur — gizli anahtar yalnızca bu yanıtta döner' })
  create(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    return this.keys.create(dto, req.user?.username ?? null);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.keys.revoke(id);
  }
}

@ApiTags('Webhooks')
@ApiBearerAuth()
@Roles('admin')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get('events')
  events() {
    return WEBHOOK_EVENTS;
  }

  @Get('deliveries')
  deliveries(
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: string,
    @Query('event') event?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.webhooks.listDeliveries({ endpointId, status, event, page: Number(page), pageSize: Number(pageSize) });
  }

  @Post('deliveries/:id/resend')
  resend(@Param('id') id: string) {
    return this.webhooks.resend(id);
  }

  @Get()
  list() {
    return this.webhooks.listEndpoints();
  }

  @Post()
  @ApiOperation({
    summary: 'Webhook uç noktası ekle — imza sırrı yalnızca bu yanıtta döner',
    description: 'Deliveries are POSTed as JSON with header X-Webhook-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>.',
  })
  create(@Body() dto: CreateWebhookDto) {
    return this.webhooks.createEndpoint(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.updateEndpoint(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.webhooks.deleteEndpoint(id);
  }

  @Post(':id/rotate-secret')
  rotate(@Param('id') id: string) {
    return this.webhooks.rotateSecret(id);
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.webhooks.sendTest(id);
  }
}

@ApiTags('Import / Export')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller()
export class ImportExportController {
  constructor(private readonly svc: ImportExportService) {}

  @Get('export/products.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="products.csv"')
  products(@Query('locale') locale?: string) {
    return this.svc.exportProducts(locale === 'tr' ? 'tr' : 'en');
  }

  @Get('export/customers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  customers(@Query('locale') locale: string | undefined, @Req() req: any) {
    return this.svc.exportCustomers(locale === 'tr' ? 'tr' : 'en', req.user);
  }

  @Get('export/suppliers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="suppliers.csv"')
  suppliers(@Query('locale') locale: string | undefined, @Req() req: any) {
    return this.svc.exportSuppliers(locale === 'tr' ? 'tr' : 'en', req.user);
  }

  @Get('export/orders.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders.csv"')
  orders(@Query('locale') locale: string | undefined, @Req() req: any) {
    return this.svc.exportOrders(locale === 'tr' ? 'tr' : 'en', req.user);
  }

  @Get('export/stock.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="stock.csv"')
  stock(@Query('locale') locale?: string) {
    return this.svc.exportStock(locale === 'tr' ? 'tr' : 'en');
  }

  @Roles('admin', 'manager')
  @Post('import/products')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiOperation({ summary: 'CSV ürün içe aktarma (SKU ile ekle/güncelle); dryRun=true yalnızca doğrular' })
  importProducts(@Body() dto: CsvImportDto, @Query('dryRun') dryRun: string, @Headers('accept-language') al: string, @Req() req: any) {
    return this.svc.importProducts(dto.csv, dryRun !== 'false', resolveLang(al), req.user?.username || 'System');
  }

  @Roles('admin', 'manager')
  @Post('import/customers')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiOperation({ summary: 'CSV müşteri içe aktarma (e-posta ile eşleşir); dryRun=true yalnızca doğrular' })
  importCustomers(@Body() dto: CsvImportDto, @Query('dryRun') dryRun: string, @Headers('accept-language') al: string) {
    return this.svc.importCustomers(dto.csv, dryRun !== 'false', resolveLang(al));
  }

  @Roles('admin', 'manager')
  @Post('import/suppliers')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiOperation({ summary: 'CSV tedarikçi içe aktarma (ad ile eşleşir); dryRun=true yalnızca doğrular' })
  importSuppliers(@Body() dto: CsvImportDto, @Query('dryRun') dryRun: string, @Headers('accept-language') al: string) {
    return this.svc.importSuppliers(dto.csv, dryRun !== 'false', resolveLang(al));
  }
}
