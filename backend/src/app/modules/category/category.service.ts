import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../../entities/category.entity';
import { ProductEntity } from '../../entities/product.entity';
import { StockHelperService } from '../../shared/services/stock-helper.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class CategoryService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly stockHelper: StockHelperService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getCategories(): Promise<CategoryEntity[]> {
    return this.categoryRepo.find({ where: { companyId: this.companyId, isDeleted: false }, order: { name: 'ASC' } });
  }

  async createCategory(data: Partial<CategoryEntity>): Promise<CategoryEntity> {
    const slug = data.slug || this.stockHelper.slugify(data.name || '');
    const existing = await this.categoryRepo.findOne({ where: { companyId: this.companyId, slug, isDeleted: false } });
    if (existing) {
      throw new BadRequestException(err('CATEGORY_SLUG_TAKEN'));
    }
    const newCategory = this.categoryRepo.create({
      ...data,
      slug,
      companyId: this.companyId,
    });
    return await this.categoryRepo.save(newCategory);
  }

  async updateCategory(id: string, updates: Partial<CategoryEntity>): Promise<CategoryEntity | null> {
    const category = await this.categoryRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!category) return null;
    
    let targetSlug = updates.slug;
    if (updates.name && !targetSlug) {
      targetSlug = this.stockHelper.slugify(updates.name);
    }

    if (targetSlug && targetSlug !== category.slug) {
      const existing = await this.categoryRepo.findOne({ where: { companyId: this.companyId, slug: targetSlug, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('CATEGORY_SLUG_TAKEN'));
      }
      updates.slug = targetSlug;
    }

    Object.assign(category, updates);
    // WP6: a normal wastage rate needs its source (VUK 186 / 278 evidence).
    if (category.normalWastageRatePct !== null && category.normalWastageRatePct !== undefined && !String(category.normalWastageSource || '').trim()) {
      throw new BadRequestException(err('WASTAGE_SOURCE_REQUIRED'));
    }
    if (category.normalWastageRatePct === null) category.normalWastageSource = null;
    return await this.categoryRepo.save(category);
  }

  async deleteCategory(id: string): Promise<boolean> {
    const category = await this.categoryRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (category) {
      const productCount = await this.productRepo.count({ where: { companyId: this.companyId, category: category.slug, isDeleted: false } });
      if (productCount > 0) {
        throw new BadRequestException(err('CATEGORY_HAS_PRODUCTS'));
      }
      category.isDeleted = true;
      await this.categoryRepo.save(category);
      return true;
    }
    return false;
  }
}
