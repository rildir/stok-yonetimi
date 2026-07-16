import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { Roles } from '../../guards/roles.decorator';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from '../../dto/purchase-order.dto';

@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly poService: PurchaseOrderService) {}

  @Get()
  async getPurchaseOrders(): Promise<PurchaseOrderEntity[]> {
    return this.poService.getPurchaseOrders();
  }

  @Get(':id')
  async getPurchaseOrderById(@Param('id') id: string): Promise<PurchaseOrderEntity | null> {
    return this.poService.getPurchaseOrderById(id);
  }

  @Roles('admin', 'manager')
  @Post()
  async createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderEntity> {
    return this.poService.createPurchaseOrder(dto);
  }

  @Roles('admin', 'manager')
  @Post('auto-draft')
  async autoDraftPurchaseOrders() {
    const created = await this.poService.autoDraftPurchaseOrders();
    return { success: true, count: created.length, orders: created };
  }

  @Roles('admin', 'manager')
  @Put(':id/status')
  async updatePurchaseOrderStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: any
  ): Promise<PurchaseOrderEntity | null> {
    const user = req.user?.username || 'System';
    return this.poService.updatePurchaseOrderStatus(id, status, user);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updatePurchaseOrder(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto
  ): Promise<PurchaseOrderEntity | null> {
    return this.poService.updatePurchaseOrder(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async deletePurchaseOrder(@Param('id') id: string) {
    return { success: await this.poService.deletePurchaseOrder(id) };
  }
}
