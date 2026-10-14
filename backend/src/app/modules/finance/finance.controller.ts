import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../guards/roles.decorator';
import { err } from '../../shared/i18n/app-error';
import { FinanceSettingsService } from './finance-settings.service';
import { CreateExchangeRateDto, CreateTaxRateDto, UpdateExchangeRateDto, UpdateTaxRateDto } from '../../dto/finance.dto';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller()
export class FinanceController {
  constructor(private readonly svc: FinanceSettingsService) {}

  // Tax rates (read: everyone, write: admin)
  @Get('tax-rates')
  listTaxRates() {
    return this.svc.listTaxRates();
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
