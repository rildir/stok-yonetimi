import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, BadRequestException, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DbService, Product, Order } from './db.service';
import { AiService, AiResponseCard } from './ai.service';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
import { AuthGuard } from './guards/auth.guard';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateOrderDto } from './dto/order.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SupplierEntity } from './entities/supplier.entity';
import { CategoryEntity } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller()
export class AppController {
  constructor(
    private readonly dbService: DbService,
    private readonly aiService: AiService,
    private readonly jwtService: JwtService
  ) {}

  @Post('auth/login')
  async login(@Body() body: any) {
    const { username, password } = body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin';

    if (username === adminUser && password === adminPass) {
      const payload = { username: adminUser, role: 'admin' };
      return {
        token: await this.jwtService.signAsync(payload),
      };
    }
    throw new BadRequestException('Kullanıcı adı veya şifre hatalı.');
  }

  // Products CRUD
  @UseGuards(AuthGuard)
  @Get('products')
  async getProducts(): Promise<ProductEntity[]> {
    return this.dbService.getProducts();
  }

  @UseGuards(AuthGuard)
  @Get('products/:id')
  async getProductById(@Param('id') id: string): Promise<ProductEntity | null> {
    return this.dbService.getProductById(id);
  }

  @UseGuards(AuthGuard)
  @Post('products/bulk')
  async bulkCreateProducts(@Body() products: any[]) {
    return this.dbService.bulkCreateProducts(products);
  }

  @UseGuards(AuthGuard)
  @Post('products')
  async createProduct(@Body() createProductDto: CreateProductDto): Promise<ProductEntity> {
    return this.dbService.createProduct(createProductDto);
  }

  @UseGuards(AuthGuard)
  @Put('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body() updates: UpdateProductDto
  ): Promise<ProductEntity | null> {
    return this.dbService.updateProduct(id, updates);
  }

  @UseGuards(AuthGuard)
  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.dbService.deleteProduct(id) };
  }

  @UseGuards(AuthGuard)
  @Post('products/bulk-delete')
  async bulkDeleteProducts(@Body('ids') ids: string[]): Promise<{ success: boolean }> {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Geçersiz veya boş ids listesi.');
    }
    return { success: await this.dbService.bulkDeleteProducts(ids) };
  }

  @UseGuards(AuthGuard)
  @Put('products/bulk-update')
  async bulkUpdateProducts(
    @Body('ids') ids: string[],
    @Body('updates') updates: any
  ): Promise<{ success: boolean }> {
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !updates) {
      throw new BadRequestException('Geçersiz ids listesi veya güncellemeler.');
    }
    return { success: await this.dbService.bulkUpdateProducts(ids, updates) };
  }

  // Orders CRUD
  @UseGuards(AuthGuard)
  @Get('orders')
  async getOrders(): Promise<OrderEntity[]> {
    return this.dbService.getOrders();
  }

  @UseGuards(AuthGuard)
  @Get('orders/:id')
  async getOrderById(@Param('id') id: string): Promise<OrderEntity | null> {
    return this.dbService.getOrderById(id);
  }

  @UseGuards(AuthGuard)
  @Post('orders')
  async createOrder(@Body() order: CreateOrderDto): Promise<OrderEntity> {
    return this.dbService.createOrder({
      ...order,
      date: new Date().toISOString(),
    });
  }

  @UseGuards(AuthGuard)
  @Put('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: 'Completed' | 'Pending' | 'Cancelled'
  ): Promise<OrderEntity | null> {
    return this.dbService.updateOrderStatus(id, status);
  }

  // AI Query
  @UseGuards(AuthGuard)
  @Post('ai/query')
  async processAiQuery(@Body('prompt') prompt: string): Promise<AiResponseCard> {
    return this.aiService.processQuery(prompt);
  }

  @UseGuards(AuthGuard)
  @Post('ai/query/stream')
  async processAiQueryStream(@Body('prompt') prompt: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const finalCard = await this.aiService.processQueryStream(prompt, (partialJson) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: partialJson })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ type: 'complete', card: finalCard })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    }
  }

  // Stock Movements
  @UseGuards(AuthGuard)
  @Get('stock-movements')
  async getStockMovements(
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.dbService.getStockMovements(
      productId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search
    );
  }

  @UseGuards(AuthGuard)
  @Post('stock-movements/adjust')
  async createManualAdjustment(
    @Body('productId') productId: string,
    @Body('newQuantity') newQuantity: number,
    @Body('note') note: string,
  ) {
    if (!productId || newQuantity === undefined) {
      throw new BadRequestException('productId ve newQuantity zorunludur.');
    }
    // Hardcoded user for Phase 0
    return this.dbService.createManualAdjustment(productId, newQuantity, note, 'Admin User');
  }

  // Suppliers
  @UseGuards(AuthGuard)
  @Get('suppliers')
  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.dbService.getSuppliers();
  }

  @UseGuards(AuthGuard)
  @Get('suppliers/:id')
  async getSupplierById(@Param('id') id: string): Promise<SupplierEntity | null> {
    return this.dbService.getSupplierById(id);
  }

  @UseGuards(AuthGuard)
  @Post('suppliers')
  async createSupplier(@Body() dto: CreateSupplierDto): Promise<SupplierEntity> {
    return this.dbService.createSupplier(dto);
  }

  @UseGuards(AuthGuard)
  @Put('suppliers/:id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto
  ): Promise<SupplierEntity | null> {
    return this.dbService.updateSupplier(id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete('suppliers/:id')
  async deleteSupplier(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.dbService.deleteSupplier(id) };
  }

  // Purchase Orders
  @UseGuards(AuthGuard)
  @Get('purchase-orders')
  async getPurchaseOrders() {
    return this.dbService.getPurchaseOrders();
  }

  @UseGuards(AuthGuard)
  @Get('purchase-orders/:id')
  async getPurchaseOrderById(@Param('id') id: string) {
    return this.dbService.getPurchaseOrderById(id);
  }

  @UseGuards(AuthGuard)
  @Post('purchase-orders')
  async createPurchaseOrder(@Body() body: any) {
    return this.dbService.createPurchaseOrder(body);
  }

  @UseGuards(AuthGuard)
  @Put('purchase-orders/:id/status')
  async updatePurchaseOrderStatus(
    @Param('id') id: string,
    @Body('status') status: string
  ) {
    return this.dbService.updatePurchaseOrderStatus(id, status);
  }

  // Settings
  @UseGuards(AuthGuard)
  @Put('user/profile')
  async updateProfile(@Body() body: any) {
    // Phase 0 mock for now until Phase 2 RBAC
    return { success: true, message: 'Profil başarıyla güncellendi', data: body };
  }

  @UseGuards(AuthGuard)
  @Put('user/password')
  async updatePassword(@Body() body: any) {
    // Phase 0 mock for now until Phase 2 RBAC
    const { currentPassword, newPassword } = body;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (currentPassword !== adminPass) {
      throw new BadRequestException('Mevcut şifreniz yanlış.');
    }
    
    // In Phase 0, we do not persist the new password to .env. We just simulate success.
    return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
  }

  // Categories CRUD
  @UseGuards(AuthGuard)
  @Get('categories')
  async getCategories() {
    return this.dbService.getCategories();
  }

  @UseGuards(AuthGuard)
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.dbService.createCategory(dto);
  }

  @UseGuards(AuthGuard)
  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    return this.dbService.updateCategory(id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return { success: await this.dbService.deleteCategory(id) };
  }

  // Stock Counts CRUD
  @UseGuards(AuthGuard)
  @Get('stock-counts')
  async getStockCounts() {
    return this.dbService.getStockCounts();
  }

  @UseGuards(AuthGuard)
  @Post('stock-counts')
  async createStockCount(
    @Body('notes') notes?: string,
    @Body('performedBy') performedBy?: string
  ) {
    return this.dbService.createStockCount(notes, performedBy || 'Admin');
  }

  @UseGuards(AuthGuard)
  @Put('stock-counts/:id')
  async updateStockCount(
    @Param('id') id: string,
    @Body('items') items: any[],
    @Body('notes') notes?: string
  ) {
    if (!items || !Array.isArray(items)) {
      throw new BadRequestException('items array zorunludur.');
    }
    return this.dbService.updateStockCount(id, items, notes);
  }

  @UseGuards(AuthGuard)
  @Post('stock-counts/:id/complete')
  async completeStockCount(
    @Param('id') id: string,
    @Body('performedBy') performedBy?: string
  ) {
    return this.dbService.completeStockCount(id, performedBy || 'Admin');
  }

  // Reports
  @UseGuards(AuthGuard)
  @Get('reports/stock-summary')
  async getStockSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dbService.getStockSummary(startDate, endDate);
  }

  @UseGuards(AuthGuard)
  @Get('reports/product-movements')
  async getProductMovementsReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dbService.getProductMovementsReport(startDate, endDate);
  }

  @UseGuards(AuthGuard)
  @Get('reports/category-distribution')
  async getCategoryDistribution() {
    return this.dbService.getCategoryDistribution();
  }

  @UseGuards(AuthGuard)
  @Get('reports/top-selling')
  async getTopSelling(@Query('days') days?: string) {
    return this.dbService.getTopSelling(days ? parseInt(days, 10) : 30);
  }

  @UseGuards(AuthGuard)
  @Get('reports/supplier-summary')
  async getSupplierSummary() {
    return this.dbService.getSupplierSummary();
  }

  // AI Demand Forecasting
  @UseGuards(AuthGuard)
  @Get('ai/forecast/:productId')
  async getAiForecast(@Param('productId') productId: string) {
    const data = await this.dbService.getProductForecastData(productId);
    if (!data) {
      throw new BadRequestException('Ürün bulunamadı.');
    }
    return this.aiService.generateProductForecast(data.product, data.movements);
  }

  // Auto Draft Purchase Orders
  @UseGuards(AuthGuard)
  @Post('purchase-orders/auto-draft')
  async autoDraftPurchaseOrders() {
    const created = await this.dbService.autoDraftPurchaseOrders();
    return { success: true, count: created.length, orders: created };
  }

  // Warehouse Management
  @UseGuards(AuthGuard)
  @Get('warehouses')
  async getWarehouses() {
    return this.dbService.getWarehouses();
  }

  @UseGuards(AuthGuard)
  @Post('warehouses/transfer')
  async transferWarehouseStock(
    @Body('productId') productId: string,
    @Body('fromWarehouse') fromWarehouse: string,
    @Body('toWarehouse') toWarehouse: string,
    @Body('quantity') quantity: number,
  ) {
    if (!productId || !fromWarehouse || !toWarehouse || !quantity || quantity <= 0) {
      throw new BadRequestException('productId, fromWarehouse, toWarehouse ve quantity zorunludur.');
    }
    const result = await this.dbService.transferWarehouseStock(
      productId, fromWarehouse, toWarehouse, quantity
    );
    if (!result) {
      throw new BadRequestException('Ürün bulunamadı veya transfer başarısız.');
    }
    return { success: true, product: result };
  }
}
