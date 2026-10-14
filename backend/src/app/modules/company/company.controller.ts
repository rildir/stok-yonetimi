import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { CompanyService } from './company.service';
import { Roles } from '../../guards/roles.decorator';
import { Public } from '../../guards/public.decorator';
import { buildJwtPayload } from '../../guards/jwt-payload';
import { RegisterCompanyDto, UpdateCompanyDto } from '../../dto/company.dto';

@ApiTags('Company')
@Controller()
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly jwtService: JwtService,
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
  @ApiOperation({ summary: 'Mevcut şirket bilgileri' })
  async getCompany() {
    return this.companyService.getCurrentCompany();
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('company')
  @ApiOperation({ summary: 'Şirket ayarlarını güncelle (Admin)' })
  async updateCompany(@Body() dto: UpdateCompanyDto) {
    return this.companyService.updateCurrentCompany(dto);
  }
}
