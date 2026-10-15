import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { RequirePermission } from '../../guards/security.decorators';
import { ApiTags, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { Roles } from '../../guards/roles.decorator';
import { CreateCustomerDto, CustomerAddressDto, UpdateCustomerDto } from '../../dto/customer.dto';

const access = (req: any) => ({ canReadPii: !!req?.user?.permissions?.includes('customers.pii.read') });

@ApiTags('Customers')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiQuery({ name: 'needsReview', required: false, description: 'true: only legacy records that need review' })
  getCustomers(@Query('needsReview') needsReview: string | undefined, @Req() req: any) {
    const flag = needsReview === 'true' || needsReview === '1' ? true : needsReview === 'false' || needsReview === '0' ? false : undefined;
    return this.customerService.getCustomers({ needsReview: flag }, access(req));
  }

  @Get(':id')
  getCustomer(@Param('id') id: string, @Req() req: any) {
    return this.customerService.getCustomerDetail(id, access(req));
  }

  /** KVKK "Göster": identity / contact data in clear text; requires customers.pii.read, logged as pii_view. */
  @RequirePermission('customers.pii.read')
  @Post(':id/reveal')
  revealCustomer(@Param('id') id: string) {
    return this.customerService.revealCustomer(id);
  }

  @Roles('admin', 'manager')
  @Post()
  createCustomer(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customerService.createCustomer(dto, access(req));
  }

  @Roles('admin', 'manager')
  @Put(':id')
  updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    return this.customerService.updateCustomer(id, dto, access(req));
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
