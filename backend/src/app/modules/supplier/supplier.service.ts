import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class SupplierService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.supplierRepo.find({ where: { companyId: this.companyId, isDeleted: false }, order: { name: 'ASC' } });
  }

  async getSupplierById(id: string): Promise<SupplierEntity | null> {
    return this.supplierRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
  }

  async createSupplier(data: Partial<SupplierEntity>): Promise<SupplierEntity> {
    if (data.name) {
      const existing = await this.supplierRepo.findOne({ where: { companyId: this.companyId, name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('SUPPLIER_NAME_TAKEN', { name: data.name }));
      }
    }
    if (data.email) {
      const existing = await this.supplierRepo.findOne({ where: { companyId: this.companyId, email: data.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('SUPPLIER_EMAIL_TAKEN', { email: data.email }));
      }
    }
    const newSupplier = this.supplierRepo.create({ ...data, companyId: this.companyId });
    const saved = await this.supplierRepo.save(newSupplier);
    this.appGateway.emitToCompany(this.companyId, 'supplier_mutated', { type: 'create', supplier: saved });
    return saved;
  }

  async updateSupplier(id: string, updates: Partial<SupplierEntity>): Promise<SupplierEntity | null> {
    const supplier = await this.getSupplierById(id);
    if (!supplier) return null;

    if (updates.name && updates.name !== supplier.name) {
      const existing = await this.supplierRepo.findOne({ where: { companyId: this.companyId, name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('SUPPLIER_NAME_TAKEN', { name: updates.name }));
      }
    }
    if (updates.email && updates.email !== supplier.email) {
      const existing = await this.supplierRepo.findOne({ where: { companyId: this.companyId, email: updates.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(err('SUPPLIER_EMAIL_TAKEN', { email: updates.email }));
      }
    }
    
    Object.assign(supplier, updates);
    const saved = await this.supplierRepo.save(supplier);
    this.appGateway.emitToCompany(this.companyId, 'supplier_mutated', { type: 'update', supplier: saved });
    return saved;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const supplier = await this.getSupplierById(id);
    if (supplier) {
      const activePoCount = await this.poRepo.count({
        where: [
          { companyId: this.companyId, supplierId: id, status: 'Draft' },
          { companyId: this.companyId, supplierId: id, status: 'Sent' }
        ]
      });
      if (activePoCount > 0) {
        throw new BadRequestException(err('SUPPLIER_HAS_ACTIVE_PO'));
      }

      await this.dataSource.transaction(async manager => {
        // Set linked products' supplierId to null
        await manager.update(ProductEntity, { companyId: this.companyId, supplierId: id }, { supplierId: null as any });

        supplier.isDeleted = true;
        await manager.save(SupplierEntity, supplier);
      });

      this.appGateway.emitToCompany(this.companyId, 'supplier_mutated', { type: 'delete', supplierId: id });
      return true;
    }
    return false;
  }
}
