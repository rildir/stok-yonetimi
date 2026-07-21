import { Controller, Get, Post, Put, Delete, Body, Param, Req, ParseArrayPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto, BulkDeleteProductsDto, BulkUpdateProductsDto } from '../../dto/product.dto';
import { ProductEntity } from '../../entities/product.entity';
import { Roles } from '../../guards/roles.decorator';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'Tüm aktif ürünleri listele' })
  @ApiResponse({ status: 200, description: 'Ürün listesi' })
  async getProducts(): Promise<ProductEntity[]> {
    return this.productService.getProducts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile detaylı ürün sorgula' })
  @ApiResponse({ status: 200, description: 'Ürün detayı' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async getProductById(@Param('id') id: string): Promise<ProductEntity | null> {
    return this.productService.getProductById(id);
  }

  @Roles('admin', 'manager')
  @Post('bulk')
  @ApiOperation({ summary: 'Toplu ürün oluştur (Admin & Manager)' })
  @ApiResponse({ status: 201, description: 'Oluşturulan ürünler' })
  async bulkCreateProducts(
    @Body(new ParseArrayPipe({ items: CreateProductDto })) products: CreateProductDto[],
    @Req() req: any
  ): Promise<ProductEntity[]> {
    const user = req.user?.username || 'System';
    return this.productService.bulkCreateProducts(products, user);
  }

  @Roles('admin', 'manager')
  @Post()
  @ApiOperation({ summary: 'Yeni ürün oluştur (Admin & Manager)' })
  @ApiResponse({ status: 201, description: 'Oluşturulan ürün' })
  async createProduct(@Body() createProductDto: CreateProductDto, @Req() req: any): Promise<ProductEntity> {
    const user = req.user?.username || 'System';
    return this.productService.createProduct(createProductDto, user);
  }

  @Roles('admin', 'manager')
  @Put('bulk-update')
  @ApiOperation({ summary: 'Toplu ürün güncelle (Admin & Manager)' })
  @ApiResponse({ status: 200, description: 'Güncelleme sonucu' })
  async bulkUpdateProducts(@Body() dto: BulkUpdateProductsDto): Promise<{ success: boolean }> {
    return { success: await this.productService.bulkUpdateProducts(dto.ids, dto.updates) };
  }

  @Roles('admin', 'manager')
  @Put(':id')
  @ApiOperation({ summary: 'Ürün bilgilerini güncelle (Admin & Manager)' })
  @ApiResponse({ status: 200, description: 'Güncellenen ürün' })
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
  @ApiOperation({ summary: 'Toplu ürün sil (Admin)' })
  @ApiResponse({ status: 200, description: 'Silme işlemi sonucu' })
  async bulkDeleteProducts(@Body() dto: BulkDeleteProductsDto): Promise<{ success: boolean }> {
    return { success: await this.productService.bulkDeleteProducts(dto.ids) };
  }

  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Ürün sil (Admin)' })
  @ApiResponse({ status: 200, description: 'Silme işlemi sonucu' })
  async deleteProduct(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.productService.deleteProduct(id) };
  }
}
