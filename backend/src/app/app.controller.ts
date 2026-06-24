import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, BadRequestException, Res, Query, Req } from '@nestjs/common';
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
import { Roles } from './guards/roles.decorator';

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
    const user = await this.dbService.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException('Kullanıcı adı veya şifre hatalı.');
    }
    const hashed = this.dbService.hashPassword(password);
    if (user.password !== hashed) {
      throw new BadRequestException('Kullanıcı adı veya şifre hatalı.');
    }
    const payload = { username: user.username, role: user.role, tokenVersion: user.tokenVersion };
    return {
      token: await this.jwtService.signAsync(payload),
    };
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
  @Roles('admin', 'manager')
  @Post('products/bulk')
  async bulkCreateProducts(@Body() products: any[], @Req() req: any) {
    const user = req.user?.username || 'System';
    return this.dbService.bulkCreateProducts(products, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Post('products')
  async createProduct(@Body() createProductDto: CreateProductDto, @Req() req: any): Promise<ProductEntity> {
    const user = req.user?.username || 'System';
    return this.dbService.createProduct(createProductDto, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body() updates: UpdateProductDto,
    @Req() req: any
  ): Promise<ProductEntity | null> {
    const user = req.user?.username || 'System';
    return this.dbService.updateProduct(id, updates, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.dbService.deleteProduct(id) };
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Post('products/bulk-delete')
  async bulkDeleteProducts(@Body('ids') ids: string[]): Promise<{ success: boolean }> {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Geçersiz veya boş ids listesi.');
    }
    return { success: await this.dbService.bulkDeleteProducts(ids) };
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
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
  @Roles('admin', 'manager')
  @Post('orders')
  async createOrder(@Body() order: CreateOrderDto, @Req() req: any): Promise<OrderEntity> {
    const user = req.user?.username || 'System';
    return this.dbService.createOrder({
      ...order,
      date: new Date().toISOString(),
    }, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: 'Completed' | 'Pending' | 'Cancelled',
    @Req() req: any
  ): Promise<OrderEntity | null> {
    const user = req.user?.username || 'System';
    return this.dbService.updateOrderStatus(id, status, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Delete('orders/:id')
  async deleteOrder(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.dbService.deleteOrder(id) };
  }

  // Global Search
  @UseGuards(AuthGuard)
  @Get('search')
  async globalSearch(@Query('q') query: string, @Query('limit') limit?: string) {
    if (!query) {
      return { products: [], orders: [], purchaseOrders: [], suppliers: [], warehouses: [] };
    }
    const maxLimit = limit ? parseInt(limit, 10) : 10;
    return this.dbService.globalSearch(query, maxLimit);
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
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    return this.dbService.getStockMovements(
      productId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      startDate,
      endDate,
      type
    );
  }


  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Post('stock-movements/adjust')
  async createManualAdjustment(
    @Body('productId') productId: string,
    @Body('newQuantity') newQuantity: number,
    @Body('note') note: string,
    @Req() req: any
  ) {
    if (!productId || newQuantity === undefined) {
      throw new BadRequestException('productId ve newQuantity zorunludur.');
    }
    const user = req.user?.username || 'System';
    return this.dbService.createManualAdjustment(productId, newQuantity, note, user);
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
  @Roles('admin', 'manager')
  @Post('suppliers')
  async createSupplier(@Body() dto: CreateSupplierDto): Promise<SupplierEntity> {
    return this.dbService.createSupplier(dto);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('suppliers/:id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto
  ): Promise<SupplierEntity | null> {
    return this.dbService.updateSupplier(id, dto);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
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
  @Roles('admin', 'manager')
  @Post('purchase-orders')
  async createPurchaseOrder(@Body() body: any) {
    return this.dbService.createPurchaseOrder(body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('purchase-orders/:id/status')
  async updatePurchaseOrderStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: any
  ) {
    const user = req.user?.username || 'System';
    return this.dbService.updatePurchaseOrderStatus(id, status, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('purchase-orders/:id')
  async updatePurchaseOrder(
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.dbService.updatePurchaseOrder(id, body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Delete('purchase-orders/:id')
  async deletePurchaseOrder(@Param('id') id: string) {
    return { success: await this.dbService.deletePurchaseOrder(id) };
  }

  // Settings & Profile Management
  @UseGuards(AuthGuard)
  @Get('user/profile')
  async getProfile(@Req() req: any) {
    const user = await this.dbService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    return {
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      avatar: user.avatar,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      createdAt: user.createdAt
    };
  }

  @UseGuards(AuthGuard)
  @Put('user/profile')
  async updateProfile(@Body() body: any, @Req() req: any) {
    const updatedUser = await this.dbService.updateUserProfile(req.user.username, body);
    return {
      success: true,
      message: 'Profil başarıyla güncellendi',
      data: {
        username: updatedUser.username,
        role: updatedUser.role,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        department: updatedUser.department,
        avatar: updatedUser.avatar,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionExpiresAt: updatedUser.subscriptionExpiresAt
      }
    };
  }

  @UseGuards(AuthGuard)
  @Put('user/password')
  async updatePassword(@Body() body: any, @Req() req: any) {
    const { currentPassword, newPassword } = body;
    const user = await this.dbService.getUserByUsername(req.user.username);
    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı.');
    }
    const hashed = this.dbService.hashPassword(currentPassword);
    if (user.password !== hashed) {
      throw new BadRequestException('Mevcut şifreniz yanlış.');
    }
    await this.dbService.updateUserPassword(req.user.username, newPassword);
    return { success: true, message: 'Şifreniz başarıyla güncellendi.' };
  }

  @UseGuards(AuthGuard)
  @Post('user/sessions/terminate')
  async terminateSessions(@Req() req: any) {
    await this.dbService.terminateUserSessions(req.user.username);
    return { success: true, message: 'Tüm oturumlar başarıyla sonlandırıldı.' };
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Get('user/users')
  async getAllUsers() {
    return this.dbService.getAllUsers();
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Post('user/users')
  async createUser(@Body() body: any, @Req() req: any) {
    return this.dbService.createUser(req.user.username, body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Put('user/users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.dbService.updateUser(id, body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Delete('user/users/:id')
  async deleteUser(@Param('id') id: string) {
    return { success: await this.dbService.deleteUser(id) };
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Put('user/subscription')
  async updateSubscription(@Body('plan') plan: string, @Req() req: any) {
    if (!plan) {
      throw new BadRequestException('Abonelik planı (plan) zorunludur.');
    }
    await this.dbService.updateSubscription(req.user.username, plan);
    return { success: true, message: `Abonelik planı ${plan} olarak güncellendi.` };
  }

  // Categories CRUD
  @UseGuards(AuthGuard)
  @Get('categories')
  async getCategories() {
    return this.dbService.getCategories();
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.dbService.createCategory(dto);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    return this.dbService.updateCategory(id, dto);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
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
  @Roles('admin', 'manager')
  @Post('stock-counts')
  async createStockCount(
    @Body('notes') notes?: string,
    @Body('performedBy') performedBy?: string,
    @Req() req?: any
  ) {
    const user = performedBy || req?.user?.username || 'System';
    return this.dbService.createStockCount(notes, user);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
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
  @Roles('admin', 'manager')
  @Post('stock-counts/:id/complete')
  async completeStockCount(
    @Param('id') id: string,
    @Body('performedBy') performedBy?: string,
    @Req() req?: any
  ) {
    const user = performedBy || req?.user?.username || 'System';
    return this.dbService.completeStockCount(id, user);
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
  @Roles('admin', 'manager')
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
  @Roles('admin', 'manager')
  @Post('warehouses')
  async createWarehouse(@Body() body: any) {
    return this.dbService.createWarehouse(body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Put('warehouses/:id')
  async updateWarehouse(
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.dbService.updateWarehouse(id, body);
  }

  @UseGuards(AuthGuard)
  @Roles('admin')
  @Delete('warehouses/:id')
  async deleteWarehouse(@Param('id') id: string) {
    return { success: await this.dbService.deleteWarehouse(id) };
  }

  @UseGuards(AuthGuard)
  @Roles('admin', 'manager')
  @Post('warehouses/transfer')
  async transferWarehouseStock(
    @Body('productId') productId: string,
    @Body('fromWarehouse') fromWarehouse: string,
    @Body('toWarehouse') toWarehouse: string,
    @Body('quantity') quantity: number,
    @Req() req: any
  ) {
    if (!productId || !fromWarehouse || !toWarehouse || !quantity || quantity <= 0) {
      throw new BadRequestException('productId, fromWarehouse, toWarehouse ve quantity zorunludur.');
    }
    const user = req.user?.username || 'Admin';
    const result = await this.dbService.transferWarehouseStock(
      productId, fromWarehouse, toWarehouse, quantity, user
    );
    if (!result) {
      throw new BadRequestException('Ürün bulunamadı veya transfer başarısız.');
    }
    return { success: true, product: result };
  }
}
