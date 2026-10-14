import { Controller, Get, Post, Put, Delete, Body, Param, Req, BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { Roles } from '../../guards/roles.decorator';
import { CreateWarehouseDto, UpdateWarehouseDto, TransferStockDto } from '../../dto/warehouse.dto';
import { err } from '../../shared/i18n/app-error';

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

  @Get(':id/stock')
  async getWarehouseStock(@Param('id') id: string) {
    return this.warehouseService.getWarehouseStock(id);
  }

  @Roles('admin', 'manager')
  @Post('transfer')
  async transferWarehouseStock(@Body() dto: TransferStockDto, @Req() req: any) {
    const user = req.user?.username || 'Admin';
    const from = dto.fromWarehouseId || dto.fromWarehouse;
    const to = dto.toWarehouseId || dto.toWarehouse;
    if (!from || !to) throw new BadRequestException(err('WAREHOUSE_NOT_FOUND'));
    return this.warehouseService.transferWarehouseStock(dto.productId, from, to, dto.quantity, user, dto.note);
  }
}
