import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { DbService, Product, Order } from './db.service';
import { AiService, AiResponseCard } from './ai.service';

@Controller()
export class AppController {
  constructor(
    private readonly dbService: DbService,
    private readonly aiService: AiService
  ) {}

  // Products CRUD
  @Get('products')
  getProducts(): Product[] {
    return this.dbService.getProducts();
  }

  @Get('products/:id')
  getProductById(@Param('id') id: string): Product | undefined {
    return this.dbService.getProductById(id);
  }

  @Post('products')
  createProduct(@Body() prod: Omit<Product, 'id' | 'status'>): Product {
    return this.dbService.createProduct(prod);
  }

  @Put('products/:id')
  updateProduct(
    @Param('id') id: string,
    @Body() updates: Partial<Omit<Product, 'id' | 'status'>>
  ): Product | undefined {
    return this.dbService.updateProduct(id, updates);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string): { success: boolean } {
    return { success: this.dbService.deleteProduct(id) };
  }

  // Orders CRUD
  @Get('orders')
  getOrders(): Order[] {
    return this.dbService.getOrders();
  }

  @Get('orders/:id')
  getOrderById(@Param('id') id: string): Order | undefined {
    return this.dbService.getOrderById(id);
  }

  @Post('orders')
  createOrder(@Body() order: Omit<Order, 'id' | 'orderNumber' | 'totalAmount'>): Order {
    return this.dbService.createOrder(order);
  }

  @Put('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: 'Completed' | 'Pending' | 'Cancelled'
  ): Order | undefined {
    return this.dbService.updateOrderStatus(id, status);
  }

  // AI Query
  @Post('ai/query')
  processAiQuery(@Body('prompt') prompt: string): AiResponseCard {
    return this.aiService.processQuery(prompt);
  }
}

