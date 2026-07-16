import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { Roles } from '../../guards/roles.decorator';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../../dto/warehouse.dto';

@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  async getWarehouses(): Promise<any[]> {
    return this.warehouseService.getWarehouses();
  }

  @Roles('admin', 'manager')
  @Post()
  async createWarehouse(@Body() dto: CreateWarehouseDto): Promise<WarehouseEntity> {
    return this.warehouseService.createWarehouse(dto);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto
  ): Promise<WarehouseEntity | null> {
    return this.warehouseService.updateWarehouse(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async deleteWarehouse(@Param('id') id: string) {
    return { success: await this.warehouseService.deleteWarehouse(id) };
  }

  @Roles('admin', 'manager')
  @Post('transfer')
  async transferWarehouseStock(
    @Body('productId') productId: string,
    @Body('fromWarehouse') fromWarehouse: string,
    @Body('toWarehouse') toWarehouse: string,
    @Body('quantity') quantity: number,
    @Req() req: any
  ) {
    const user = req.user?.username || 'Admin';
    return this.warehouseService.transferWarehouseStock(productId, fromWarehouse, toWarehouse, quantity, user);
  }
}
