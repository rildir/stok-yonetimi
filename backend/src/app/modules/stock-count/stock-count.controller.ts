import { ApiSecurity } from '@nestjs/swagger';
import { err } from '../../shared/i18n/app-error';
import { Controller, Get, Post, Put, Body, Param, BadRequestException, Req, Res, HttpStatus } from '@nestjs/common';
import { resolveLang, translate } from '../../shared/i18n/messages';
import { StockCountService } from './stock-count.service';
import { Roles } from '../../guards/roles.decorator';

@ApiSecurity('api-key')
@Controller('stock-counts')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Get()
  async getStockCounts() {
    return this.stockCountService.getStockCounts();
  }

  @Roles('admin', 'manager')
  @Post()
  async createStockCount(
    @Body('notes') notes?: string,
    @Req() req?: any
  ) {
    // The actor always comes from the authenticated request (it is hashed into the ledger).
    const user = req?.user?.username || 'System';
    return this.stockCountService.createStockCount(notes, user);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateStockCount(
    @Param('id') id: string,
    @Body('items') items: any[],
    @Body('notes') notes?: string
  ) {
    if (!items || !Array.isArray(items)) {
      throw new BadRequestException(err('STOCK_COUNT_ITEMS_REQUIRED'));
    }
    return this.stockCountService.updateStockCount(id, items, notes);
  }

  @Roles('admin', 'manager')
  @Post(':id/complete')
  async completeStockCount(
    @Param('id') id: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any
  ) {
    const user = req?.user?.username || 'System';
    const done = await this.stockCountService.completeStockCount(id, user);
    // Lines above the approval threshold were not booked: 202 + the pending requests.
    if (done?.pendingApprovals?.length) {
      res.status(HttpStatus.ACCEPTED);
      const lang = resolveLang(req.headers?.['accept-language']);
      const params = { count: done.pendingApprovals.length };
      return { ...done, code: 'COUNT_LINES_PENDING_APPROVAL', params, message: translate('COUNT_LINES_PENDING_APPROVAL', lang, params) };
    }
    return done;
  }
}
