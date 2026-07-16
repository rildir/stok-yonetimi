import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from '../../dto/product.dto';
import { ProductEntity } from '../../entities/product.entity';
import { Roles } from '../../guards/roles.decorator';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async getProducts(): Promise<ProductEntity[]> {
    return this.productService.getProducts();
  }

  @Get(':id')
  async getProductById(@Param('id') id: string): Promise<ProductEntity | null> {
    return this.productService.getProductById(id);
  }

  @Roles('admin', 'manager')
  @Post('bulk')
  async bulkCreateProducts(@Body() products: any[], @Req() req: any): Promise<ProductEntity[]> {
    const user = req.user?.username || 'System';
    return this.productService.bulkCreateProducts(products, user);
  }

  @Roles('admin', 'manager')
  @Post()
  async createProduct(@Body() createProductDto: CreateProductDto, @Req() req: any): Promise<ProductEntity> {
    const user = req.user?.username || 'System';
    return this.productService.createProduct(createProductDto, user);
  }

  @Roles('admin', 'manager')
  @Put('bulk-update')
  async bulkUpdateProducts(
    @Body('ids') ids: string[],
    @Body('updates') updates: any
  ): Promise<{ success: boolean }> {
    return { success: await this.productService.bulkUpdateProducts(ids, updates) };
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body() updates: UpdateProductDto,
    @Req() req: any
  ): Promise<ProductEntity | null> {
    const user = req.user?.username || 'System';
    return this.productService.updateProduct(id, updates, user);
  }

  @Roles('admin')
  @Post('bulk-delete')
  async bulkDeleteProducts(@Body('ids') ids: string[]): Promise<{ success: boolean }> {
    return { success: await this.productService.bulkDeleteProducts(ids) };
  }

  @Roles('admin')
  @Delete(':id')
  async deleteProduct(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.productService.deleteProduct(id) };
  }
}
