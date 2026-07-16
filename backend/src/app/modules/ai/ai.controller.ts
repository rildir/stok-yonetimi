import { Controller, Get, Post, Param, Body, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { AiService, AiResponseCard } from './ai.service';
import { ProductService } from '../product/product.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly productService: ProductService,
  ) {}

  @Post('query')
  async processAiQuery(@Body('prompt') prompt: string): Promise<AiResponseCard> {
    return this.aiService.processQuery(prompt);
  }

  @Post('query/stream')
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

  @Get('forecast/:productId')
  async getAiForecast(@Param('productId') productId: string) {
    const data = await this.productService.getProductForecastData(productId);
    if (!data) {
      throw new BadRequestException('Ürün bulunamadı.');
    }
    return this.aiService.generateProductForecast(data.product, data.movements);
  }
}
