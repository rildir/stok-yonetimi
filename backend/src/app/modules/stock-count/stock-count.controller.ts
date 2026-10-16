import { ApiSecurity } from '@nestjs/swagger';
import { err } from '../../shared/i18n/app-error';
import { Controller, Get, Post, Put, Body, Param, BadRequestException, NotFoundException, Req, Res, HttpStatus } from '@nestjs/common';
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
    @Body() body: { notes?: string; countType?: string; countDate?: string | null; asOfDate?: string | null; warehouseIds?: string[] | null; countedBy?: string[] | null; supervisedBy?: string | null },
    @Req() req?: any
  ) {
    // The actor always comes from the authenticated request (it is hashed into the ledger).
    const user = req?.user?.username || 'System';
    const { notes, ...header } = body || {};
    return this.stockCountService.createStockCount(notes, user, header);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateStockCount(
    @Param('id') id: string,
    @Body() body: { items: any[]; notes?: string; countType?: string; countDate?: string | null; asOfDate?: string | null; countedBy?: string[] | null; supervisedBy?: string | null }
  ) {
    const { items, notes, ...header } = body || ({} as any);
    if (!items || !Array.isArray(items)) {
      throw new BadRequestException(err('STOCK_COUNT_ITEMS_REQUIRED'));
    }
    return this.stockCountService.updateStockCount(id, items, notes, header);
  }

  @Roles('admin', 'manager')
  @Post(':id/cancel')
  async cancelStockCount(@Param('id') id: string, @Body() body: { reason?: string | null }, @Req() req: any) {
    const user = req?.user?.username || 'System';
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null;
    const done = await this.stockCountService.cancelStockCount(id, user, reason);
    if (!done) throw new NotFoundException(err('STOCK_COUNT_NOT_FOUND'));
    return done;
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
