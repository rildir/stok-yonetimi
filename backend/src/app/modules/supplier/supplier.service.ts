import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { AppGateway } from '../../app.gateway';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    private readonly appGateway: AppGateway,
    private readonly dataSource: DataSource,
  ) {}

  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.supplierRepo.find({ where: { isDeleted: false }, order: { name: 'ASC' } });
  }

  async getSupplierById(id: string): Promise<SupplierEntity | null> {
    return this.supplierRepo.findOne({ where: { id, isDeleted: false } });
  }

  async createSupplier(data: Partial<SupplierEntity>): Promise<SupplierEntity> {
    if (data.name) {
      const existing = await this.supplierRepo.findOne({ where: { name: data.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir tedarikçi zaten mevcut: ${data.name}`);
      }
    }
    if (data.email) {
      const existing = await this.supplierRepo.findOne({ where: { email: data.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu e-posta adresine sahip bir tedarikçi zaten mevcut: ${data.email}`);
      }
    }
    const newSupplier = this.supplierRepo.create(data);
    const saved = await this.supplierRepo.save(newSupplier);
    this.appGateway.server.emit('supplier_mutated', { type: 'create', supplier: saved });
    return saved;
  }

  async updateSupplier(id: string, updates: Partial<SupplierEntity>): Promise<SupplierEntity | null> {
    const supplier = await this.getSupplierById(id);
    if (!supplier) return null;

    if (updates.name && updates.name !== supplier.name) {
      const existing = await this.supplierRepo.findOne({ where: { name: updates.name, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu isimde bir tedarikçi zaten mevcut: ${updates.name}`);
      }
    }
    if (updates.email && updates.email !== supplier.email) {
      const existing = await this.supplierRepo.findOne({ where: { email: updates.email, isDeleted: false } });
      if (existing) {
        throw new BadRequestException(`Bu e-posta adresine sahip bir tedarikçi zaten mevcut: ${updates.email}`);
      }
    }
    
    Object.assign(supplier, updates);
    const saved = await this.supplierRepo.save(supplier);
    this.appGateway.server.emit('supplier_mutated', { type: 'update', supplier: saved });
    return saved;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const supplier = await this.getSupplierById(id);
    if (supplier) {
      const activePoCount = await this.poRepo.count({
        where: [
          { supplierId: id, status: 'Draft' },
          { supplierId: id, status: 'Sent' }
        ]
      });
      if (activePoCount > 0) {
        throw new BadRequestException('Bu tedarikçiye ait aktif satın alma siparişi bulunduğundan silinemez.');
      }

      await this.dataSource.transaction(async manager => {
        // Set linked products' supplierId to null
        await manager.update(ProductEntity, { supplierId: id }, { supplierId: null as any });

        supplier.isDeleted = true;
        await manager.save(SupplierEntity, supplier);
      });

      this.appGateway.server.emit('supplier_mutated', { type: 'delete', supplierId: id });
      return true;
    }
    return false;
  }
}
