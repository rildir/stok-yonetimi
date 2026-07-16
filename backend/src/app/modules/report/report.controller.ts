import { Controller, Get, Query } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('search')
  async globalSearch(@Query('q') query: string, @Query('limit') limit?: string) {
    if (!query) {
      return { products: [], orders: [], purchaseOrders: [], suppliers: [], warehouses: [] };
    }
    const maxLimit = limit ? parseInt(limit, 10) : 10;
    return this.reportService.globalSearch(query, maxLimit);
  }

  @Get('reports/stock-summary')
  async getStockSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.reportService.getStockSummary(startDate, endDate);
  }

  @Get('reports/product-movements')
  async getProductMovementsReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.reportService.getProductMovementsReport(startDate, endDate);
  }

  @Get('reports/category-distribution')
  async getCategoryDistribution() {
    return this.reportService.getCategoryDistribution();
  }

  @Get('reports/top-selling')
  async getTopSelling(@Query('days') days?: string) {
    return this.reportService.getTopSelling(days ? parseInt(days, 10) : 30);
  }

  @Get('reports/supplier-summary')
  async getSupplierSummary() {
    return this.reportService.getSupplierSummary();
  }
}
