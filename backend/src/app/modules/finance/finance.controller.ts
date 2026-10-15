import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../guards/roles.decorator';
import { SuperAdmin } from '../../guards/security.decorators';
import { err } from '../../shared/i18n/app-error';
import { FinanceSettingsService } from './finance-settings.service';
import { TaxCodeKind, TaxCodeService } from '../../shared/services/tax-code.service';
import { CreateExchangeRateDto, CreateTaxRateDto, FetchTcmbDto, UpdateExchangeRateDto, UpdateTaxRateDto } from '../../dto/finance.dto';
import { AddTaxCodeDto } from '../../dto/tax.dto';

const KINDS: TaxCodeKind[] = ['exemptions', 'withholdings', 'otv'];
const kindOf = (k: string): TaxCodeKind => {
  if (!KINDS.includes(k as TaxCodeKind)) throw new BadRequestException(err('VALIDATION_FAILED'));
  return k as TaxCodeKind;
};

@ApiTags('Finance')
@ApiBearerAuth()
@Controller()
export class FinanceController {
  constructor(
    private readonly svc: FinanceSettingsService,
    private readonly taxCodes: TaxCodeService,
  ) {}

  // Tax rates (read: everyone, write: admin)
  @Get('tax-rates')
  listTaxRates(@Query('history') history?: string) {
    return this.svc.listTaxRates(history === 'true' || history === '1');
  }

  /** Legal KDV rates of the company's country on `date` (TR: locked catalog) */
  @Get('tax-rates/catalog')
  catalog(@Query('date') date?: string) {
    return this.svc.catalog(date);
  }

  @Roles('admin')
  @Post('tax-rates')
  createTaxRate(@Body() dto: CreateTaxRateDto) {
    return this.svc.createTaxRate(dto);
  }

  @Roles('admin')
  @Put('tax-rates/:id')
  updateTaxRate(@Param('id') id: string, @Body() dto: UpdateTaxRateDto) {
    return this.svc.updateTaxRate(id, dto);
  }

  @Roles('admin')
  @Delete('tax-rates/:id')
  async deleteTaxRate(@Param('id') id: string) {
    return { success: await this.svc.deleteTaxRate(id) };
  }

  // Global UBL-TR code lists (read-only for tenants)
  @Get('tax-codes/:kind')
  listTaxCodes(@Param('kind') kind: string, @Query('date') date?: string, @Query('history') history?: string) {
    return this.taxCodes.list(kindOf(kind), date, history === 'true' || history === '1');
  }

  /** New version of a code (platform super administrator only) */
  @SuperAdmin()
  @Post('admin/tax-codes/:kind')
  addTaxCode(@Param('kind') kind: string, @Body() dto: AddTaxCodeDto) {
    return this.taxCodes.addVersion(kindOf(kind), dto as unknown as Record<string, unknown>);
  }

  // Exchange rates
  @Get('exchange-rates')
  listExchangeRates() {
    return this.svc.listExchangeRates();
  }

  @Get('exchange-rates/convert')
  convert(@Query('amount') amount: string, @Query('from') from: string, @Query('to') to?: string, @Query('date') date?: string) {
    const n = Number(amount);
    if (!from || !isFinite(n)) throw new BadRequestException(err('VALIDATION_FAILED'));
    return this.svc.convert(n, from, to, date);
  }

  /** Rate the tax engine uses for `currency` at `taxPointDate` (TCMB forex buying) */
  @Get('exchange-rates/tax-rate')
  taxRate(@Query('currency') currency: string, @Query('taxPointDate') taxPointDate?: string) {
    if (!currency || !/^[A-Za-z]{3}$/.test(currency)) throw new BadRequestException(err('VALIDATION_CURRENCY_CODE'));
    return this.svc.taxRateFor(currency, taxPointDate);
  }

  @Roles('admin')
  @Post('exchange-rates/tcmb/fetch')
  fetchTcmb(@Body() dto: FetchTcmbDto) {
    return this.svc.fetchTcmb(dto?.date);
  }

  @Roles('admin')
  @Post('exchange-rates')
  createExchangeRate(@Body() dto: CreateExchangeRateDto) {
    return this.svc.createExchangeRate(dto);
  }

  @Roles('admin')
  @Put('exchange-rates/:id')
  updateExchangeRate(@Param('id') id: string, @Body() dto: UpdateExchangeRateDto) {
    return this.svc.updateExchangeRate(id, dto);
  }

  @Roles('admin')
  @Delete('exchange-rates/:id')
  async deleteExchangeRate(@Param('id') id: string) {
    return { success: await this.svc.deleteExchangeRate(id) };
  }
}
