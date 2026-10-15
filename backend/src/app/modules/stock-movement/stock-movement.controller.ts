import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Post, Body, Query, Req, Res, Param, HttpStatus, ForbiddenException } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { Roles } from '../../guards/roles.decorator';
import { AdjustStockDto, DecideAdjustmentDto, ReverseMovementDto } from '../../dto/stock-movement.dto';
import { err } from '../../shared/i18n/app-error';
import { resolveLang, translate } from '../../shared/i18n/messages';

const actorName = (req: any) => req.user?.username || 'System';

@ApiTags('Stock movements')
@ApiSecurity('api-key')
@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  async getStockMovements(
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('reasonCode') reasonCode?: string,
    @Query('dateField') dateField?: string,
  ) {
    return this.stockMovementService.getStockMovements({
      productId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      startDate,
      endDate,
      type,
      warehouseId,
      reasonCode,
      dateField: dateField === 'createdAt' ? 'createdAt' : 'transactionDate',
    });
  }

  /**
   * Manual adjustment: reason code mandatory, optional document reference and attachment.
   * Above the company approval threshold the adjustment is not booked: 202 + pending request.
   */
  @Roles('admin', 'manager')
  @Post('adjust')
  async createManualAdjustment(@Body() dto: AdjustStockDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const result = await this.stockMovementService.createManualAdjustment(dto, actorName(req));
    if (result.pending) {
      res.status(HttpStatus.ACCEPTED);
      const lang = resolveLang(req.headers?.['accept-language']);
      return { ...result.body, message: translate(result.body.code, lang, result.body.params) };
    }
    return result.body;
  }

  @Roles('admin', 'manager')
  @Get('adjustment-requests')
  listAdjustmentRequests(@Query('status') status?: string) {
    return this.stockMovementService.listAdjustmentRequests(status);
  }

  /** Second approver (maker-checker): an administrator other than the requester; not via API key. */
  @Roles('admin')
  @Post('adjustment-requests/:id/approve')
  approve(@Param('id') id: string, @Body() dto: DecideAdjustmentDto, @Req() req: any) {
    if (req.user?.isApiKey) throw new ForbiddenException(err('AUTH_FORBIDDEN'));
    return this.stockMovementService.decideAdjustmentRequest(id, true, actorName(req), dto?.note);
  }

  @Roles('admin')
  @Post('adjustment-requests/:id/reject')
  reject(@Param('id') id: string, @Body() dto: DecideAdjustmentDto, @Req() req: any) {
    if (req.user?.isApiKey) throw new ForbiddenException(err('AUTH_FORBIDDEN'));
    return this.stockMovementService.decideAdjustmentRequest(id, false, actorName(req), dto?.note);
  }

  /** Correction of a movement: a REVERSAL row with the opposite quantity (the original stays). */
  @Roles('admin', 'manager')
  @Post(':id/reverse')
  reverse(@Param('id') id: string, @Body() dto: ReverseMovementDto, @Req() req: any) {
    return this.stockMovementService.reverseMovement(id, dto, actorName(req));
  }

  @Get(':id/attachments')
  listAttachments(@Param('id') id: string) {
    return this.stockMovementService.listAttachments(id);
  }

  @Get('attachments/:attachmentId/download')
  async download(@Param('attachmentId') attachmentId: string, @Res() res: any) {
    const a = await this.stockMovementService.getAttachment(attachmentId);
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.fileName)}`);
    res.setHeader('X-Content-SHA256', a.sha256);
    res.send(a.content);
  }
}

@ApiTags('Integrity')
@ApiSecurity('api-key')
@Controller('integrity')
export class IntegrityController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  /** Recomputes the company's stock movement hash chain (TTK 65/3; VUK 217). */
  @Roles('admin')
  @Get('stock-movements/verify')
  verify() {
    return this.stockMovementService.verifyIntegrity();
  }
}
