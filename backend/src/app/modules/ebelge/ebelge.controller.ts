import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, RawBodyRequest, Req, Res, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { EBelgeSettingsDto, InboxMatchDto, InboxRespondDto, LegalHoldDto, ReceiptAdviceDto, SimulateIncomingDto } from '../../dto/ebelge.dto';
import { MockEDocumentProvider } from '../../shared/ebelge/provider';
import { EBelgeSettingsService } from './ebelge-settings.service';
import { RegistryService } from './registry.service';
import { EDocumentService } from './edocument.service';
import { InboxService } from './inbox.service';
import { EDocumentArchiveService } from './archive.service';
import { ProviderRegistry } from './provider-registry.service';

const who = (req: any): string | undefined => req?.user?.username;
const asciiName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

@ApiTags('e-Belge: Ayarlar')
@ApiSecurity('api-key')
@Controller('ebelge')
export class EBelgeController {
  constructor(
    private readonly settings: EBelgeSettingsService,
    private readonly registry: RegistryService,
    private readonly edocs: EDocumentService,
    private readonly archive: EDocumentArchiveService,
    private readonly inbox: InboxService,
    private readonly providers: ProviderRegistry,
  ) {}

  @Roles('admin')
  @Get('settings')
  getSettings() {
    return this.settings.view();
  }

  @ApiOperation({ summary: 'Entegratör, ortam ve kimlik bilgileri (şifreli saklanır; imza ve yasal arşiv entegratörde)' })
  @Roles('admin')
  @Put('settings')
  updateSettings(@Body() dto: EBelgeSettingsDto, @Req() req: any) {
    return this.settings.update(dto, who(req));
  }

  @ApiOperation({ summary: 'Bağlantıyı test et' })
  @Roles('admin')
  @Post('settings/test')
  @HttpCode(200)
  test(@Req() req: any) {
    return this.settings.testConnection(who(req));
  }

  @Get('providers')
  listProviders() {
    return this.providers.list();
  }

  @ApiOperation({ summary: 'Banner: entegratör kesintisi, kuyruk, MATBUDAN süresi, gelen kutusu geri sayımları' })
  @Get('status')
  status() {
    return this.archive.status();
  }

  @ApiOperation({ summary: 'GİB kayıtlı kullanıcı sorgusu (e-Fatura / e-İrsaliye)' })
  @Get('registry/:taxId')
  check(@Param('taxId') taxId: string, @Query('type') type?: string, @Query('force') force?: string) {
    if (!/^(\d{10}|\d{11})$/.test(taxId)) throw new BadRequestException(err('INVALID_VKN'));
    return this.registry.check(taxId, type === 'DESPATCH' ? 'DESPATCH' : 'INVOICE', { force: force === '1' || force === 'true' });
  }

  @ApiOperation({ summary: 'Müşteri kartı: e-Fatura / e-İrsaliye mükellefi mi? (anlık sorgu)' })
  @Roles('admin', 'manager')
  @Post('customers/:id/registry-check')
  @HttpCode(200)
  checkCustomer(@Param('id') id: string) {
    return this.registry.checkCustomer(id);
  }

  @ApiOperation({ summary: 'Gönderim kuyruğunu şimdi işle' })
  @Roles('admin')
  @Post('outbox/process')
  @HttpCode(200)
  process(@Req() _req: any) {
    return this.edocs.processOutbox(25, undefined);
  }

  @ApiOperation({ summary: 'Mock entegratör: örnek gelen belge oluştur (yalnızca MOCK)' })
  @Roles('admin')
  @Post('mock/incoming')
  @HttpCode(200)
  async simulate(@Body() dto: SimulateIncomingDto) {
    const r = await this.settings.resolve();
    if (!(r.provider instanceof MockEDocumentProvider)) throw new UnprocessableEntityException(err('EBELGE_MOCK_ONLY'));
    return this.inbox.simulateIncoming(dto.kind, r.provider);
  }

  // ------------------------------------------------------------------ inbox
  @Get('inbox')
  inboxList(@Query('documentType') documentType?: string, @Query('status') status?: string) {
    return this.inbox.list({ documentType, status });
  }

  @Get('inbox/summary')
  inboxSummary() {
    return this.inbox.summary();
  }

  @Roles('admin', 'manager')
  @Post('inbox/fetch')
  @HttpCode(200)
  fetch() {
    return this.inbox.fetch();
  }

  @Get('inbox/:id')
  inboxGet(@Param('id') id: string) {
    return this.inbox.get(id);
  }

  @Roles('admin', 'manager')
  @Put('inbox/:id/match')
  match(@Param('id') id: string, @Body() dto: InboxMatchDto) {
    return this.inbox.manualMatch(id, dto);
  }

  @ApiOperation({ summary: 'TICARIFATURA için KABUL / RED uygulama yanıtı (TTK 21/2, 8 gün)' })
  @Roles('admin', 'manager')
  @Post('inbox/:id/respond')
  @HttpCode(200)
  respond(@Param('id') id: string, @Body() dto: InboxRespondDto, @Req() req: any) {
    return this.inbox.respond(id, dto, who(req));
  }

  @ApiOperation({ summary: 'Gelen e-İrsaliyeye tam / kısmi kabul yanıtı (İrsaliye Yanıtı, 7 gün)' })
  @Roles('admin', 'manager')
  @Post('inbox/:id/receipt-advice')
  @HttpCode(200)
  receiptAdvice(@Param('id') id: string, @Body() dto: ReceiptAdviceDto, @Req() req: any) {
    return this.inbox.receiptAdvice(id, dto, who(req));
  }
}

@ApiTags('e-Belge: Arşiv')
@ApiSecurity('api-key')
@Controller('e-documents')
export class EDocumentController {
  constructor(private readonly archive: EDocumentArchiveService, private readonly edocs: EDocumentService) {}

  @Get()
  list(@Query('documentType') documentType?: string, @Query('direction') direction?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('q') q?: string) {
    return this.archive.list({ documentType, direction, from, to, q });
  }

  @ApiOperation({ summary: 'İbraz paketi (ZIP: XML, PDF/HTML, index.csv, manifest.sha256)' })
  @Roles('admin')
  @Get('archive-package')
  async pkg(@Query('from') from: string, @Query('to') to: string, @Req() req: any, @Res() res: Response) {
    const p = await this.archive.archivePackage(from, to, who(req));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName(p.fileName)}"`);
    res.setHeader('X-Integrity-Mismatches', String(p.mismatches.length));
    res.send(p.zip);
  }

  @ApiOperation({ summary: 'Arşiv bütünlük kontrolü (SHA-256)' })
  @Roles('admin')
  @Post('integrity-check')
  @HttpCode(200)
  integrity() {
    return this.archive.integrityCheck();
  }

  @Get('by-source/:type/:id')
  bySource(@Param('type') type: string, @Param('id') id: string) {
    return this.archive.bySource(type, id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.archive.detail(id);
  }

  @Get(':id/xml')
  async xml(@Param('id') id: string, @Query('signed') signed: string, @Res() res: Response) {
    const x = await this.archive.xml(id, signed === '1');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName(x.fileName)}"`);
    res.send(x.xml);
  }

  @Get(':id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  html(@Param('id') id: string) {
    return this.archive.html(id);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Query('download') download: string, @Res() res: Response) {
    const p = await this.archive.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${asciiName(p.fileName)}"`);
    res.send(p.pdf);
  }

  @ApiOperation({ summary: 'Yeniden dene (başarısız gönderim)' })
  @Roles('admin', 'manager')
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string, @Req() req: any) {
    return this.edocs.retry(id, who(req));
  }

  @ApiOperation({ summary: 'Yasal saklama kilidi (legal hold)' })
  @Roles('admin')
  @Put(':id/legal-hold')
  hold(@Param('id') id: string, @Body() dto: LegalHoldDto, @Req() req: any) {
    return this.archive.setLegalHold(id, dto.hold, dto.reason, who(req));
  }
}

/** Status callbacks of the integrator (no user session; HMAC verified by the adapter). */
@ApiTags('e-Belge: Entegratör bildirimi')
@Controller('ebelge/provider-webhook')
export class EBelgeWebhookController {
  constructor(private readonly tenant: TenantContext, private readonly settings: EBelgeSettingsService, private readonly edocs: EDocumentService) {}

  @Public()
  @Post(':companyId')
  @HttpCode(200)
  async receive(@Param('companyId') companyId: string, @Req() req: RawBodyRequest<Request>) {
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new UnauthorizedException(err('EBELGE_WEBHOOK_SIGNATURE_INVALID'));
    return this.tenant.run(companyId, async () => {
      let r;
      try {
        r = await this.settings.resolve(companyId);
      } catch {
        throw new UnauthorizedException(err('EBELGE_WEBHOOK_SIGNATURE_INVALID'));
      }
      const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
      const updates = r.provider.parseWebhook ? r.provider.parseWebhook(r.ctx, headers, raw) : null;
      if (!updates) throw new UnauthorizedException(err('EBELGE_WEBHOOK_SIGNATURE_INVALID'));
      return { applied: await this.edocs.applyWebhook(updates) };
    });
  }
}
