import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from '../../dto/order.dto';
import { OrderEntity } from '../../entities/order.entity';
import { Roles } from '../../guards/roles.decorator';

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
