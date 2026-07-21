import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../guards/public.decorator';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Sistem sağlık kontrolü' })
  @ApiResponse({ status: 200, description: 'Sistem ve veritabanı durumu' })
  async check() {
    const isDbConnected = this.dataSource.isInitialized;
    return {
      status: isDbConnected ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }
}
