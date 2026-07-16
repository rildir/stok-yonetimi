import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../../dto/supplier.dto';
import { SupplierEntity } from '../../entities/supplier.entity';
import { Roles } from '../../guards/roles.decorator';

@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.supplierService.getSuppliers();
  }

  @Get(':id')
  async getSupplierById(@Param('id') id: string): Promise<SupplierEntity | null> {
    return this.supplierService.getSupplierById(id);
  }

  @Roles('admin', 'manager')
  @Post()
  async createSupplier(@Body() dto: CreateSupplierDto): Promise<SupplierEntity> {
    return this.supplierService.createSupplier(dto);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto
  ): Promise<SupplierEntity | null> {
    return this.supplierService.updateSupplier(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async deleteSupplier(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.supplierService.deleteSupplier(id) };
  }
}
