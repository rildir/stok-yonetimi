import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { AllowTotpSetup, RequirePermission, SelfService } from '../../guards/security.decorators';
import { resolveLang } from '../../shared/i18n/messages';
import {
  AcceptNoticesDto, CloseTenantDto, ConfirmIncidentDto, ConsentDto, CreateDsrDto, CreateNoticeDto, DismissIncidentDto, IncidentDto, KvkkSettingsDto, NoticeDraftDto,
  RejectRunDto, RespondDsrDto, RetentionOverrideDto, SubprocessorDto, UpdateNoticeDto, VerifyIdentityDto, WithdrawConsentDto,
} from '../../dto/kvkk.dto';
import { NoticeService } from './notice.service';
import { ConsentService } from './consent.service';
import { RetentionService } from './retention.service';
import { DsrService } from './dsr.service';
import { SubjectReportService } from './subject-report.service';
import { IncidentService } from './incident.service';
import { GovernanceService } from './governance.service';
import { TenantClosureService } from './tenant-closure.service';
import { AuditChainService } from './audit-chain.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

const HTML = 'text/html; charset=utf-8';
const who = (req: any) => req?.user?.username || 'system';
const lang = (al?: string) => resolveLang(al);

/** Public: the operator's privacy notice / terms on the login screen. */
@ApiTags('KVKK')
@Controller('kvkk/public')
export class KvkkPublicController {
  constructor(private readonly notices: NoticeService) {}

  @Public()
  @Get('notices/current')
  @ApiOperation({ summary: 'Giriş ekranı: platform aydınlatma metni / kullanım koşulları (oturumsuz)' })
  current(@Query('docType') docType = 'PRIVACY', @Query('lang') l?: string, @Headers('accept-language') al?: string) {
    return this.notices.platformCurrent(['PRIVACY', 'TOS', 'DPA'].includes(docType) ? docType : 'PRIVACY', 'USER', l || lang(al));
  }
}

/**
 * KVKK tools (WP7). Reads: administrators (and the read-only auditor); changes: administrators
 * with kvkk.manage. Consents can be recorded by managers too (customer-facing work).
 */
@ApiTags('KVKK')
@ApiBearerAuth()
@Controller('kvkk')
export class KvkkController {
  constructor(
    private readonly notices: NoticeService,
    private readonly consents: ConsentService,
    private readonly retention: RetentionService,
    private readonly dsr: DsrService,
    private readonly reports: SubjectReportService,
    private readonly incidents: IncidentService,
    private readonly governance: GovernanceService,
    private readonly closure: TenantClosureService,
    private readonly chain: AuditChainService,
    private readonly tenant: TenantContext,
  ) {}

  // ---------------------------------------------------------------- status
  @Roles('admin')
  @Get('status')
  @AllowTotpSetup()
  @ApiOperation({ summary: 'KVKK durumu: başvuru süreleri, ihlal geri sayımı, imha takvimi, VERBİS, 2FA' })
  status(@Req() req: any) {
    return this.governance.status(req.user);
  }

  // ---------------------------------------------------------------- notices and acceptances
  @Get('notices/current')
  @AllowTotpSetup()
  @ApiOperation({ summary: 'Geçerli aydınlatma metni (şirketin yayımladığı, yoksa platformun)' })
  currentNotice(@Query('audience') audience = 'EMPLOYEE', @Query('lang') l: string | undefined, @Headers('accept-language') al?: string) {
    return this.notices.current(audience, l || lang(al));
  }

  @Get('acceptances/pending')
  @AllowTotpSetup()
  @ApiOperation({ summary: 'İlk girişte kabul / onay bekleyen metinler' })
  pending(@Req() req: any, @Query('lang') l: string | undefined, @Headers('accept-language') al?: string) {
    return this.notices.pending(req.user, l || lang(al));
  }

  @Post('acceptances')
  @SelfService()
  @AllowTotpSetup()
  @HttpCode(200)
  @ApiOperation({ summary: 'Metinleri kabul et (sürüm, IP, tarih kaydedilir)' })
  accept(@Body() dto: AcceptNoticesDto, @Req() req: any) {
    return this.notices.accept(dto.noticeIds, req.user, req);
  }

  @Roles('admin')
  @Get('acceptances')
  acceptances() {
    return this.notices.acceptances();
  }

  @Roles('admin')
  @Get('notices')
  listNotices() {
    return this.notices.list();
  }

  @Roles('admin')
  @Get('notices/:id')
  getNotice(@Param('id') id: string) {
    return this.notices.get(id);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('notices/generate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Şirket bilgileri, alt işleyenler ve aktarımlardan varsayılan metin üret (taslak, kaydetmez)' })
  generate(@Body() dto: NoticeDraftDto) {
    return this.notices.generate(dto.audience, dto.language || 'tr');
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('notices')
  createNotice(@Body() dto: CreateNoticeDto, @Req() req: any) {
    return this.notices.create(dto, who(req));
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Put('notices/:id')
  updateNotice(@Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.notices.update(id, dto);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('notices/:id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @Req() req: any) {
    return this.notices.publish(id, who(req));
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('notices/:id/retire')
  @HttpCode(200)
  retire(@Param('id') id: string) {
    return this.notices.retire(id);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Delete('notices/:id')
  deleteNotice(@Param('id') id: string) {
    return this.notices.deleteDraft(id);
  }

  // ---------------------------------------------------------------- consents
  @Get('consents/purposes')
  purposes() {
    return this.consents.purposes();
  }

  @Roles('admin', 'manager')
  @Get('consents')
  listConsents(@Query('subjectType') subjectType?: string, @Query('subjectId') subjectId?: string) {
    return this.consents.list(subjectType, subjectId);
  }

  @Roles('admin', 'manager')
  @Post('consents')
  give(@Body() dto: ConsentDto, @Req() req: any) {
    return this.consents.give(dto, who(req));
  }

  @Roles('admin', 'manager')
  @Post('consents/:id/withdraw')
  @HttpCode(200)
  withdraw(@Param('id') id: string, @Body() dto: WithdrawConsentDto) {
    return this.consents.withdraw(id, dto.channel);
  }

  // ---------------------------------------------------------------- retention and destruction
  @Roles('admin')
  @Get('retention-policies')
  policies() {
    return this.retention.policies();
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Put('retention-policies/:category')
  setPolicy(@Param('category') category: string, @Body() dto: RetentionOverrideDto) {
    return this.retention.setOverride(category, dto);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('retention-policies/:category/approve')
  @HttpCode(200)
  approvePolicy(@Param('category') category: string, @Req() req: any) {
    return this.retention.approvePolicy(category, who(req));
  }

  @Roles('admin')
  @Get('destruction/schedule')
  schedule() {
    return this.retention.schedule();
  }

  @Roles('admin')
  @Get('destruction/runs')
  runs() {
    return this.retention.runs();
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('destruction/runs')
  @ApiOperation({ summary: 'İmha aday listesi oluştur (onay bekler)' })
  createRun(@Req() req: any) {
    return this.retention.createRun('MANUAL', who(req));
  }

  @Roles('admin')
  @Get('destruction/runs/:id')
  run(@Param('id') id: string) {
    return this.retention.run(id);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('destruction/runs/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'İmha listesini onayla ve uygula (imha kayıtları yazılır)' })
  approveRun(@Param('id') id: string, @Req() req: any) {
    return this.retention.approve(id, who(req), req.user?.sub ?? null);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('destruction/runs/:id/reject')
  @HttpCode(200)
  rejectRun(@Param('id') id: string, @Body() dto: RejectRunDto, @Req() req: any) {
    return this.retention.reject(id, dto.reason || '', who(req), req.user?.sub ?? null);
  }

  @Roles('admin')
  @Get('destruction/logs')
  @ApiOperation({ summary: 'İmha kayıtları (en az 3 yıl saklanır; denetimde gösterilir)' })
  logs(@Query('from') from?: string, @Query('to') to?: string, @Query('category') category?: string) {
    return this.retention.logs({ from, to, category });
  }

  // ---------------------------------------------------------------- data-subject requests
  @Roles('admin')
  @Get('dsr')
  listDsr(@Query('status') status?: string) {
    return this.dsr.list(status);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('dsr')
  createDsr(@Body() dto: CreateDsrDto, @Req() req: any) {
    return this.dsr.create(dto, who(req));
  }

  @Roles('admin')
  @Get('dsr/:id')
  getDsr(@Param('id') id: string) {
    return this.dsr.get(id);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('dsr/:id/verify-identity')
  @HttpCode(200)
  verify(@Param('id') id: string, @Body() dto: VerifyIdentityDto, @Req() req: any) {
    return this.dsr.verifyIdentity(id, dto.method, who(req));
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('dsr/:id/erase')
  @HttpCode(200)
  @ApiOperation({ summary: 'Silme talebini uygula (yasal saklama kapsamındakiler kısıtlanır; gerekçeli yanıt üretilir)' })
  erase(@Param('id') id: string, @Req() req: any, @Headers('accept-language') al?: string) {
    return this.dsr.erase(id, who(req), req.user?.sub ?? null, lang(al));
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Get('dsr/:id/export')
  @ApiOperation({ summary: 'Başvuru sahibinin "tüm verilerim" raporu (kimlik doğrulanmış olmalı)' })
  async dsrExport(@Param('id') id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: any) {
    const r = await this.dsr.assertCanExport(id);
    const type = r.subjectType.toLowerCase();
    if (format === 'html') {
      res.setHeader('Content-Type', HTML);
      return this.reports.html(type, r.subjectId as string);
    }
    return this.reports.build(type, r.subjectId as string);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('dsr/:id/respond')
  @HttpCode(200)
  respond(@Param('id') id: string, @Body() dto: RespondDsrDto, @Req() req: any) {
    return this.dsr.respond(id, dto.status, dto.responseText, who(req));
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Get('subjects/:type/:id/export')
  @ApiOperation({ summary: 'İlgili kişi veri raporu (JSON veya ?format=html: yazdırılabilir / PDF)' })
  async subjectExport(@Param('type') type: string, @Param('id') id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: any) {
    if (format === 'html') {
      res.setHeader('Content-Type', HTML);
      return this.reports.html(type, id);
    }
    return this.reports.build(type, id);
  }

  // ---------------------------------------------------------------- incidents
  @Roles('admin')
  @Get('incidents')
  listIncidents() {
    return this.incidents.list();
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('incidents')
  createIncident(@Body() dto: IncidentDto, @Req() req: any) {
    return this.incidents.create(dto, who(req));
  }

  @Roles('admin')
  @Get('incidents/:id')
  getIncident(@Param('id') id: string) {
    return this.incidents.get(id);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Put('incidents/:id')
  updateIncident(@Param('id') id: string, @Body() dto: IncidentDto) {
    return this.incidents.update(id, dto);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('incidents/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string, @Body() dto: ConfirmIncidentDto) {
    return this.incidents.confirm(id, dto.awareAt);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('incidents/:id/dismiss')
  @HttpCode(200)
  dismiss(@Param('id') id: string, @Body() dto: DismissIncidentDto) {
    return this.incidents.dismiss(id, dto.reason || '');
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('incidents/:id/close')
  @HttpCode(200)
  close(@Param('id') id: string) {
    return this.incidents.close(id);
  }

  @Roles('admin')
  @Get('incidents/:id/affected')
  @ApiOperation({ summary: 'Etkilenen kişiler (maskeli örnek + sayılar)' })
  affected(@Param('id') id: string) {
    return this.incidents.affected(id);
  }

  // ---------------------------------------------------------------- sub-processors, inventory, settings
  @Roles('admin')
  @Get('subprocessors')
  subprocessors() {
    return this.governance.subprocessors();
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('subprocessors')
  createSub(@Body() dto: SubprocessorDto) {
    return this.governance.createSubprocessor(dto);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Put('subprocessors/:id')
  updateSub(@Param('id') id: string, @Body() dto: SubprocessorDto) {
    return this.governance.updateSubprocessor(id, dto);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Delete('subprocessors/:id')
  deleteSub(@Param('id') id: string) {
    return this.governance.deleteSubprocessor(id);
  }

  @Roles('admin')
  @Get('verbis/status')
  verbis() {
    return this.governance.verbisStatus();
  }

  @Roles('admin')
  @Get('verbis/inventory')
  inventory(@Headers('accept-language') al?: string) {
    return this.governance.inventory(lang(al));
  }

  @Roles('admin')
  @Get('verbis/inventory.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="kisisel-veri-envanteri.csv"')
  inventoryCsv(@Query('locale') locale?: string) {
    return this.governance.inventoryCsv(locale === 'en' ? 'en' : 'tr');
  }

  @Roles('admin')
  @Get('verbis/inventory/print')
  @Header('Content-Type', HTML)
  inventoryPrint() {
    return this.governance.inventoryHtml();
  }

  @Roles('admin')
  @Get('settings')
  settings() {
    return this.governance.settings();
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Put('settings')
  updateSettings(@Body() dto: KvkkSettingsDto) {
    return this.governance.updateSettings(dto);
  }

  // ---------------------------------------------------------------- audit chain, tenant closure
  @Roles('admin')
  @Get('audit-chain/verify')
  @ApiOperation({ summary: 'Denetim kaydı hash zinciri ve içerik bütünlüğü doğrulaması' })
  verifyChain() {
    return this.chain.verify(this.tenant.companyId);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Get('tenant/export')
  @ApiOperation({ summary: 'Tam dışa aktarım (ZIP, tablo başına JSON) - kapatmadan önce zorunlu' })
  async exportAll(@Res() res: any) {
    const out = await this.closure.exportAll();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  }

  @Roles('admin')
  @RequirePermission('kvkk.manage')
  @Post('tenant/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Şirket hesabını kapat: saklama gerektirmeyen veriler silinir, kalan veriler salt okunur dondurulur' })
  closeTenant(@Body() dto: CloseTenantDto, @Req() req: any) {
    return this.closure.close(dto, req.user);
  }
}
