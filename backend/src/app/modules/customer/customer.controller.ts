import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { Roles } from '../../guards/roles.decorator';
import { CreateCustomerDto, UpdateCustomerDto } from '../../dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  getCustomers() {
    return this.customerService.getCustomers();
  }

  @Get(':id')
  getCustomer(@Param('id') id: string) {
    return this.customerService.getCustomer(id);
  }

  @Roles('admin', 'manager')
  @Post()
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.customerService.createCustomer(dto);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.updateCustomer(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async deleteCustomer(@Param('id') id: string) {
    return { success: await this.customerService.deleteCustomer(id) };
  }
}
