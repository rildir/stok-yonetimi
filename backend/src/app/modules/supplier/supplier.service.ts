import { err } from '../../shared/i18n/app-error';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplierEntity } from '../../entities/supplier.entity';
import { ProductEntity } from '../../entities/product.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { AppGateway } from '../../app.gateway';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { RefdataService } from '../../shared/services/refdata.service';
import { FinanceService } from '../../shared/services/finance.service';
import { resolvePartyIdentity, touchesIdentity } from '../../shared/identity/party-identity';
import { CreateSupplierDto, SupplierFieldsDto, UpdateSupplierDto } from '../../dto/supplier.dto';

const SIMPLE_FIELDS = ['name', 'type', 'contactPerson', 'email', 'phone', 'notes', 'rating', 'leadTimeDays', 'isTaxpayer', 'isRealTaxationFarmer', 'isForeign', 'isVatTaxpayer'] as const;

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
    private readonly refdata: RefdataService,
    private readonly finance: FinanceService,
  ) {}

  /**
   * Identity rules: companies and farmers (müstahsil) need a VKN or TCKN unless foreign;
   * foreign suppliers use FOREIGN (free-form id); individuals may omit it. ANONYMOUS is not allowed.
   */
  private async apply(sup: SupplierEntity, dto: SupplierFieldsDto, isCreate: boolean): Promise<void> {
    for (const k of SIMPLE_FIELDS) {
      const v = (dto as Record<string, unknown>)[k];
      if (v !== undefined) (sup as unknown as Record<string, unknown>)[k] = v === '' ? null : v;
    }
    if (!sup.type) sup.type = 'company';
    if (isCreate || touchesIdentity(dto) || !sup.needsReview) {
      if ((dto.identityType ?? sup.identityType) === 'ANONYMOUS') throw new BadRequestException(err('INVALID_IDENTITY_TYPE'));
      const partyType = sup.isForeign ? null : sup.type === 'individual' ? 'individual' : 'company';
      const id = resolvePartyIdentity({ identityType: sup.identityType ?? null, identityNumber: sup.identityNumber ?? null }, dto, partyType);
      sup.identityType = id.identityType;
      sup.identityNumber = id.identityNumber;
      sup.needsReview = false;
    }
    if (dto.taxOfficeCode !== undefined || dto.taxOfficeName !== undefined) {
      const office = await this.refdata.resolveTaxOffice(
        dto.taxOfficeCode !== undefined ? dto.taxOfficeCode : sup.taxOfficeCode,
        dto.taxOfficeName !== undefined ? dto.taxOfficeName : sup.taxOfficeName,
      );
      sup.taxOfficeCode = office.code;
      sup.taxOfficeName = office.name;
    }
    if (dto.address !== undefined || isCreate) {
      const country = (await this.finance.getCompany()).country || 'TR';
      sup.address = await this.refdata.normalizeAddress(dto.address || {}, sup.isForeign ? null : country);
    }
  }

  private get companyId(): string {
    return this.tenant.companyId;
  }

  async getSuppliers(): Promise<SupplierEntity[]> {
    return this.supplierRepo.find({ where: { companyId: this.companyId, isDeleted: false }, order: { name: 'ASC' } });
  }

  async getSupplierById(id: string): Promise<SupplierEntity | null> {
    return this.supplierRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
  }

  async createSupplier(data: CreateSupplierDto): Promise<SupplierEntity> {
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
    const newSupplier = this.supplierRepo.create({ companyId: this.companyId, type: 'company', isTaxpayer: true, isVatTaxpayer: true, isForeign: false, isRealTaxationFarmer: false, needsReview: false });
    await this.apply(newSupplier, data, true);
    newSupplier.companyId = this.companyId;
    const saved = await this.supplierRepo.save(newSupplier);
    this.appGateway.emitToCompany(this.companyId, 'supplier_mutated', { type: 'create', supplier: saved });
    return saved;
  }

  async updateSupplier(id: string, updates: UpdateSupplierDto): Promise<SupplierEntity | null> {
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
    
    await this.apply(supplier, updates, false);
    supplier.companyId = this.companyId;
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
