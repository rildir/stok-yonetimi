import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../../entities/category.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
  ) {}

  async getCategories(): Promise<CategoryEntity[]> {
    return this.categoryRepo.find({ where: { isDeleted: false }, order: { name: 'ASC' } });
  }

  async createCategory(data: Partial<CategoryEntity>): Promise<CategoryEntity> {
    const slug = data.slug || this.stockHelper.slugify(data.name || '');
    const existing = await this.categoryRepo.findOne({ where: { slug, isDeleted: false } });
    if (existing) {
      throw new BadRequestException('Bu kategori slug bilgisi zaten kullanımda.');
    }
    const newCategory = this.categoryRepo.create({
      ...data,
      slug
    });
    return await this.categoryRepo.save(newCategory);
  }

  async updateCategory(id: string, updates: Partial<CategoryEntity>): Promise<CategoryEntity | null> {
    const category = await this.categoryRepo.findOne({ where: { id, isDeleted: false } });
    if (!category) return null;
    
    let targetSlug = updates.slug;
    if (updates.name && !targetSlug) {
      targetSlug = this.stockHelper.slugify(updates.name);
    }

    if (targetSlug && targetSlug !== category.slug) {
      const existing = await this.categoryRepo.findOne({ where: { slug: targetSlug, isDeleted: false } });
      if (existing) {
        throw new BadRequestException('Bu kategori slug bilgisi zaten kullanımda.');
      }
      updates.slug = targetSlug;
    }

    Object.assign(category, updates);
    return await this.categoryRepo.save(category);
  }

  async deleteCategory(id: string): Promise<boolean> {
    const category = await this.categoryRepo.findOne({ where: { id, isDeleted: false } });
    if (category) {
      const productCount = await this.productRepo.count({ where: { category: category.slug, isDeleted: false } });
      if (productCount > 0) {
        throw new BadRequestException('Bu kategoriye ait aktif ürünler bulunduğundan silinemez.');
      }
      category.isDeleted = true;
      await this.categoryRepo.save(category);
      return true;
    }
    return false;
  }
}
