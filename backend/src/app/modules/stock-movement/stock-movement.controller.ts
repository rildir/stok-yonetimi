import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { Roles } from '../../guards/roles.decorator';

@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  async getStockMovements(
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    return this.stockMovementService.getStockMovements(
      productId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      startDate,
      endDate,
      type
    );
  }

  @Roles('admin', 'manager')
  @Post('adjust')
  async createManualAdjustment(
    @Body('productId') productId: string,
    @Body('newQuantity') newQuantity: number,
    @Body('note') note: string,
    @Req() req: any
  ) {
    const user = req.user?.username || 'System';
    return this.stockMovementService.createManualAdjustment(productId, newQuantity, note, user);
  }
}
