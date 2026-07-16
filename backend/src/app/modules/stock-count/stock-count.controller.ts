import { Controller, Get, Post, Put, Body, Param, BadRequestException, Req } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { Roles } from '../../guards/roles.decorator';

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
    @Body('performedBy') performedBy?: string,
    @Req() req?: any
  ) {
    const user = performedBy || req?.user?.username || 'System';
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
      throw new BadRequestException('items array zorunludur.');
    }
    return this.stockCountService.updateStockCount(id, items, notes);
  }

  @Roles('admin', 'manager')
  @Post(':id/complete')
  async completeStockCount(
    @Param('id') id: string,
    @Body('performedBy') performedBy?: string,
    @Req() req?: any
  ) {
    const user = performedBy || req?.user?.username || 'System';
    return this.stockCountService.completeStockCount(id, user);
  }
}
