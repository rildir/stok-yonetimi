import { ApiSecurity } from '@nestjs/swagger';
import { err } from '../../shared/i18n/app-error';
import { Controller, Get, Post, Put, Body, Param, BadRequestException, Req } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { Roles } from '../../guards/roles.decorator';

@ApiSecurity('api-key')
@Controller('stock-counts')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Get()
  async getStockCounts() {
    return this.stockCountService.getStockCounts();
  }

  @Roles('admin', 'manager')
  @Post()
  async createStockCount(
    @Body('notes') notes?: string,
    @Req() req?: any
  ) {
    // The actor always comes from the authenticated request (it is hashed into the ledger).
    const user = req?.user?.username || 'System';
    return this.stockCountService.createStockCount(notes, user);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateStockCount(
    @Param('id') id: string,
    @Body('items') items: any[],
    @Body('notes') notes?: string
  ) {
    if (!items || !Array.isArray(items)) {
      throw new BadRequestException(err('STOCK_COUNT_ITEMS_REQUIRED'));
    }
    return this.stockCountService.updateStockCount(id, items, notes);
  }

  @Roles('admin', 'manager')
  @Post(':id/complete')
  async completeStockCount(
    @Param('id') id: string,
    @Req() req?: any
  ) {
    const user = req?.user?.username || 'System';
    return this.stockCountService.completeStockCount(id, user);
  }
}
