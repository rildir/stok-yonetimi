import { ApiSecurity } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { Roles } from '../../guards/roles.decorator';
import { CreatePurchaseOrderDto, QuotePurchaseOrderDto, UpdatePurchaseOrderDto, UpdatePurchaseOrderStatusDto } from '../../dto/purchase-order.dto';

@ApiSecurity('api-key')
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

  /** Prices a purchase order without saving it */
  @Roles('admin', 'manager')
  @Post('quote')
  async quote(@Body() dto: QuotePurchaseOrderDto) {
    return this.poService.quote(dto);
  }

  @Roles('admin', 'manager')
  @Post('auto-draft')
  async autoDraftPurchaseOrders() {
    const created = await this.poService.autoDraftPurchaseOrders();
    return { success: true, count: created.length, orders: created };
  }

  @Roles('admin', 'manager')
  @Put(':id/status')
  async updatePurchaseOrderStatus(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderStatusDto): Promise<PurchaseOrderEntity | null> {
    return this.poService.updatePurchaseOrderStatus(id, dto.status);
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
