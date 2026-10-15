import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RefdataService } from '../../shared/services/refdata.service';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { SuperAdmin } from '../../guards/security.decorators';
import { CreateLegalParameterDto } from '../../dto/company.dto';
import { REFDATA_SOURCES, REFDATA_VERSION } from '../../shared/refdata/tr-refdata';

/** Global, read-only Turkish reference data (any signed-in user). */
@ApiTags('Reference data')
@ApiBearerAuth()
@Controller('refdata')
export class RefdataController {
  constructor(private readonly refdata: RefdataService) {}

  @Get('provinces')
  @ApiOperation({ summary: '81 il (plaka kodu, ad)' })
  provinces() {
    return this.refdata.listProvinces();
  }

  @Get('districts')
  @ApiQuery({ name: 'provinceCode', required: true, example: '34' })
  @ApiOperation({ summary: 'İlçeler (ile göre)' })
  districts(@Query('provinceCode') provinceCode: string) {
    return this.refdata.listDistricts(provinceCode || '__');
  }

  @Get('tax-offices')
  @ApiQuery({ name: 'provinceCode', required: false, example: '34' })
  @ApiQuery({ name: 'q', required: false, example: 'kadıköy' })
  @ApiOperation({ summary: 'Vergi daireleri (GİB muhasebe birim kodu)' })
  taxOffices(@Query('provinceCode') provinceCode?: string, @Query('q') q?: string) {
    return this.refdata.listTaxOffices(provinceCode || null, q || null);
  }

  @Get('version')
  version() {
    return { version: REFDATA_VERSION, sources: REFDATA_SOURCES };
  }
}

/** Versioned legal thresholds (global). Platform super administrator only. */
@ApiTags('Admin')
@ApiBearerAuth()
@SuperAdmin()
@Controller('admin/legal-parameters')
export class LegalParameterController {
  constructor(private readonly params: LegalParameterService) {}

  @Get()
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'key', required: false })
  list(@Query('country') country?: string, @Query('key') key?: string) {
    return this.params.list(country, key);
  }

  @Post()
  @ApiOperation({ summary: 'Yeni yasal parametre sürümü ekle (önceki açık sürüm bir gün öncesinde kapanır)' })
  create(@Body() dto: CreateLegalParameterDto, @Req() req: any) {
    return this.params.create(dto, req.user?.username);
  }
}
