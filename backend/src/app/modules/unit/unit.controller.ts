import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../guards/roles.decorator';
import { UnitService } from '../../shared/services/unit.service';
import { CreateUnitDto, UpdateUnitDto } from '../../dto/unit.dto';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Get()
  list() {
    return this.unitService.list();
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateUnitDto) {
    return this.unitService.create(dto);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitService.update(id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { success: await this.unitService.remove(id) };
  }
}
