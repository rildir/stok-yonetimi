import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../../dto/category.dto';
import { CategoryEntity } from '../../entities/category.entity';
import { Roles } from '../../guards/roles.decorator';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  async getCategories(): Promise<CategoryEntity[]> {
    return this.categoryService.getCategories();
  }

  @Roles('admin', 'manager')
  @Post()
  async createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryEntity> {
    return this.categoryService.createCategory(dto);
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ): Promise<CategoryEntity | null> {
    return this.categoryService.updateCategory(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async deleteCategory(@Param('id') id: string): Promise<{ success: boolean }> {
    return { success: await this.categoryService.deleteCategory(id) };
  }
}
