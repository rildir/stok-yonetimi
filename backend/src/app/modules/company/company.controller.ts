import { Controller, Get, Put, Post, Patch, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { CompanyService } from './company.service';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { RegisterCompanyDto, UpdateCompanyDto, UpdateFiscalDto, EBelgeProfileDto } from '../../dto/company.dto';
import { ComplianceService } from './compliance.service';
import { fiscalStatus } from './fiscal';

@ApiTags('Company')
@Controller()
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly jwtService: JwtService,
    private readonly compliance: ComplianceService,
  ) {}

  @Public()
  @Post('auth/register')
  @ApiOperation({ summary: 'Yeni şirket ve yönetici hesabı oluştur (Kayıt ol)' })
  @ApiResponse({ status: 201, description: 'Şirket oluşturuldu, JWT token döner' })
  async register(@Body() dto: RegisterCompanyDto) {
    const { company, admin } = await this.companyService.registerCompany(dto);
    return {
      token: await this.jwtService.signAsync(buildJwtPayload(admin)),
      company,
    };
  }

  @ApiBearerAuth()
  @Get('company')
  @ApiOperation({ summary: 'Mevcut şirket bilgileri (mali kimlik dahil)' })
  async getCompany() {
    const company = await this.companyService.getCurrentCompany();
    return { ...company, fiscalStatus: fiscalStatus(company) };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Patch('company/fiscal')
  @ApiOperation({ summary: 'Mali kimlik bilgilerini güncelle (unvan, VKN/TCKN, vergi dairesi, MERSİS, KEP, adres, defter usulü)' })
  async updateFiscal(@Body() dto: UpdateFiscalDto) {
    const company = await this.compliance.updateFiscal(dto);
    return { ...company, fiscalStatus: fiscalStatus(company) };
  }

  @ApiBearerAuth()
  @Get('company/ebelge/profile')
  @ApiOperation({ summary: 'e-Belge mükellefiyet profili' })
  async getEBelgeProfile() {
    return this.compliance.getProfile();
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('company/ebelge/profile')
  @ApiOperation({ summary: 'e-Belge mükellefiyet profilini kaydet (hasılat, sektör bayrakları, geçiş tarihleri)' })
  async saveEBelgeProfile(@Body() dto: EBelgeProfileDto) {
    return this.compliance.saveProfile(dto);
  }

  @ApiBearerAuth()
  @Get('company/ebelge/obligations')
  @ApiQuery({ name: 'asOf', required: false, example: '2026-10-15' })
  @ApiOperation({ summary: 'e-Fatura / e-Arşiv / e-İrsaliye zorunluluk tarihleri ve kâğıt fatura izni' })
  async getObligations(@Query('asOf') asOf?: string) {
    return this.compliance.obligations(asOf);
  }

  @ApiBearerAuth()
  @Get('company/compliance')
  @ApiQuery({ name: 'asOf', required: false, example: '2027-01-01' })
  @ApiOperation({ summary: 'Uyum paneli: eksik mali bilgiler, e-belge tarihleri, eksik yasal parametreler' })
  async getCompliance(@Query('asOf') asOf: string | undefined, @Req() req: any) {
    return this.compliance.compliance(asOf, req.user?.role === 'admin');
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('company')
  @ApiOperation({ summary: 'Şirket ayarlarını güncelle (Admin)' })
  async updateCompany(@Body() dto: UpdateCompanyDto) {
    return this.companyService.updateCurrentCompany(dto);
  }
}
