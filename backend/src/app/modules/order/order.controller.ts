import { ApiSecurity } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, QuoteOrderDto } from '../../dto/order.dto';
import { TaxPointDto } from '../../dto/tax.dto';
import { OrderEntity } from '../../entities/order.entity';
import { Roles } from '../../guards/roles.decorator';

@ApiSecurity('api-key')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  async getOrders(): Promise<OrderEntity[]> {
    return this.orderService.getOrders();
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string): Promise<OrderEntity | null> {
    return this.orderService.getOrderById(id);
  }

  /** Prices an order without saving it (no stock moves): totals, withholding, TRY equivalents, warnings */
  @Roles('admin', 'manager')
  @Post('quote')
  async quote(@Body() dto: QuoteOrderDto) {
    return this.orderService.quote(dto);
  }

  /** Shipment time / tax point of a pending order (409 DOCUMENT_TAX_FROZEN when completed) */
  @Roles('admin', 'manager')
  @Put(':id/tax-point')
  async setTaxPoint(@Param('id') id: string, @Body() dto: TaxPointDto): Promise<OrderEntity> {
    return this.orderService.setTaxPoint(id, dto);
  }

  @Roles('admin', 'manager')
  @Post()
  async createOrder(@Body() order: CreateOrderDto, @Req() req: any): Promise<OrderEntity> {
    const user = req.user?.username || 'System';
    return this.orderService.createOrder(order, user);
  }

  @Roles('admin', 'manager')
  @Put(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: 'Completed' | 'Pending' | 'Cancelled',
    @Req() req: any
  ): Promise<OrderEntity | null> {
    const user = req.user?.username || 'System';
    return this.orderService.updateOrderStatus(id, status, user);
  }

  @Roles('admin')
  @Delete(':id')
  async deleteOrder(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.orderService.deleteOrder(id) };
  }
}
