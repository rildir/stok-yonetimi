import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { Roles } from '../../guards/roles.decorator';
import { CreateCustomerDto, CustomerAddressDto, UpdateCustomerDto } from '../../dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiQuery({ name: 'needsReview', required: false, description: 'true: only legacy records that need review' })
  getCustomers(@Query('needsReview') needsReview?: string) {
    const flag = needsReview === 'true' || needsReview === '1' ? true : needsReview === 'false' || needsReview === '0' ? false : undefined;
    return this.customerService.getCustomers({ needsReview: flag });
  }

  @Get(':id')
  getCustomer(@Param('id') id: string) {
    return this.customerService.getCustomerDetail(id);
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

  // Billing / delivery addresses
  @Get(':id/addresses')
  listAddresses(@Param('id') id: string) {
    return this.customerService.getCustomer(id).then(() => this.customerService.listAddresses(id));
  }

  @Roles('admin', 'manager')
  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: CustomerAddressDto) {
    return this.customerService.addAddress(id, dto);
  }

  @Roles('admin', 'manager')
  @Put(':id/addresses/:addressId')
  updateAddress(@Param('id') id: string, @Param('addressId') addressId: string, @Body() dto: CustomerAddressDto) {
    return this.customerService.updateAddress(id, addressId, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id/addresses/:addressId')
  async deleteAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return { success: await this.customerService.deleteAddress(id, addressId) };
  }
}
