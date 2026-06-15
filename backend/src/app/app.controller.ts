import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DbService, Product, Order } from './db.service';
import { AiService, AiResponseCard } from './ai.service';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
import { AuthGuard } from './guards/auth.guard';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateOrderDto } from './dto/order.dto';

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
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    
    if (!adminUser || !adminPass) {
      throw new BadRequestException('Sunucu yapılandırma hatası: Admin bilgileri eksik.');
    }

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
  @Post('products')
  async createProduct(@Body() prod: CreateProductDto): Promise<ProductEntity> {
    return this.dbService.createProduct(prod);
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
}
