import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { CustomerEntity } from '../../entities/customer.entity';
import { CustomerAddressEntity } from '../../entities/customer-address.entity';
import { OrderEntity } from '../../entities/order.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { CreateCustomerDto, CustomerAddressDto, CustomerFieldsDto, UpdateCustomerDto } from '../../dto/customer.dto';
import { RefdataService } from '../../shared/services/refdata.service';
import { FinanceService } from '../../shared/services/finance.service';
import { resolvePartyIdentity, touchesIdentity } from '../../shared/identity/party-identity';

/** Plain columns copied from the DTO as-is ('' -> null). Identity, tax office and address are handled separately. */
const SIMPLE_FIELDS = [
  'name',
  'type',
  'email',
  'phone',
  'currency',
  'notes',
  'isVatTaxpayer',
  'isDesignatedBuyer',
  'passportNo',
  'nationality',
  'foreignTaxId',
  'preferredProfile',
] as const;

export interface CustomerFilter {
  needsReview?: boolean;
}

@Injectable()
export class CustomerService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly appGateway: AppGateway,
    private readonly refdata: RefdataService,
    private readonly finance: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** Customers with order count / last order date; `needsReview` lists legacy records to fix. */
  async getCustomers(filter: CustomerFilter = {}): Promise<(CustomerEntity & { orderCount: number; lastOrderDate: string | null })[]> {
    const customers = await this.customerRepo.find({
      where: { companyId: this.companyId, isDeleted: false, ...(filter.needsReview !== undefined ? { needsReview: filter.needsReview } : {}) },
      order: { name: 'ASC' },
    });
    const stats = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.customerId', 'customerId')
      .addSelect('COUNT(o.id)', 'orderCount')
      .addSelect('MAX(o.date)', 'lastOrderDate')
      .where('o.companyId = :companyId', { companyId: this.companyId })
      .andWhere('o.customerId IS NOT NULL')
      .groupBy('o.customerId')
      .getRawMany();
    const byId = new Map(stats.map((s) => [s.customerId, s]));
    return customers.map((c) => ({
      ...c,
      orderCount: Number(byId.get(c.id)?.orderCount || 0),
      lastOrderDate: byId.get(c.id)?.lastOrderDate || null,
    }));
  }

  async getCustomer(id: string): Promise<CustomerEntity> {
    const c = await this.customerRepo.findOne({ where: { id, companyId: this.companyId, isDeleted: false } });
    if (!c) throw new NotFoundException(err('CUSTOMER_NOT_FOUND'));
    return c;
  }

  /** Customer with its billing / delivery addresses. */
  async getCustomerDetail(id: string): Promise<CustomerEntity & { addresses: CustomerAddressEntity[] }> {
    const c = await this.getCustomer(id);
    return { ...c, addresses: await this.listAddresses(id) };
  }

  private async defaultCountry(): Promise<string> {
    return (await this.finance.getCompany()).country || 'TR';
  }

  /** Applies a create / update DTO onto the entity (validated identity, tax office, structured address). */
  private async apply(c: CustomerEntity, dto: CustomerFieldsDto, isCreate: boolean): Promise<void> {
    for (const k of SIMPLE_FIELDS) {
      const v = (dto as Record<string, unknown>)[k];
      if (v !== undefined) (c as unknown as Record<string, unknown>)[k] = v === '' ? null : v;
    }
    if (!c.type) c.type = 'individual';

    // Identity: always validated on create; on update when touched, or when the record is not flagged for review.
    if (isCreate || touchesIdentity(dto) || !c.needsReview) {
      const id = resolvePartyIdentity({ identityType: c.identityType ?? null, identityNumber: c.identityNumber ?? null }, dto, c.type);
      c.identityType = id.identityType ?? (c.type === 'individual' ? 'ANONYMOUS' : null);
      c.identityNumber = id.identityNumber;
      c.needsReview = false;
      c.reviewReason = null;
    }

    if (dto.taxOfficeCode !== undefined || dto.taxOfficeName !== undefined) {
      const office = await this.refdata.resolveTaxOffice(
        dto.taxOfficeCode !== undefined ? dto.taxOfficeCode : c.taxOfficeCode,
        dto.taxOfficeName !== undefined ? dto.taxOfficeName : c.taxOfficeName,
      );
      c.taxOfficeCode = office.code;
      c.taxOfficeName = office.name;
    }

    // Structured address (legacy flat city/postalCode/country are folded in).
    const legacyTouched = dto.city !== undefined || dto.postalCode !== undefined || dto.country !== undefined;
    if (dto.address !== undefined || legacyTouched || isCreate) {
      const base = dto.address !== undefined ? dto.address || {} : { ...(c.address || {}) };
      const merged: Record<string, unknown> = { ...base };
      if (dto.country !== undefined && !merged['country']) merged['country'] = dto.country;
      if (dto.postalCode !== undefined && !merged['postalCode']) merged['postalCode'] = dto.postalCode;
      if (dto.city !== undefined && !merged['province'] && !merged['provinceCode']) {
        const prov = (await this.refdata.listProvinces()).find((p) => p.name.toLocaleLowerCase('tr-TR') === String(dto.city || '').trim().toLocaleLowerCase('tr-TR'));
        if (prov) merged['provinceCode'] = prov.code;
        else merged['province'] = dto.city;
      }
      c.address = await this.refdata.normalizeAddress(merged, await this.defaultCountry());
    }
  }

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerEntity> {
    const c = this.customerRepo.create({ companyId: this.companyId, type: 'individual', isVatTaxpayer: false, isDesignatedBuyer: false, needsReview: false });
    await this.apply(c, dto, true);
    c.companyId = this.companyId;
    const saved = await this.customerRepo.save(c);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'create', customer: saved });
    return saved;
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto): Promise<CustomerEntity> {
    const c = await this.getCustomer(id);
    await this.apply(c, dto, false);
    c.companyId = this.companyId;
    const saved = await this.customerRepo.save(c);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'update', customer: saved });
    return saved;
  }

  /** Soft delete; orders keep their customerName snapshot. */
  async deleteCustomer(id: string): Promise<boolean> {
    const c = await this.getCustomer(id);
    c.isDeleted = true;
    await this.customerRepo.save(c);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'delete', customerId: id });
    return true;
  }

  // ------------------------------------------------------------------ addresses
  async listAddresses(customerId: string): Promise<CustomerAddressEntity[]> {
    return this.dataSource.manager.find(CustomerAddressEntity, {
      where: { companyId: this.companyId, customerId },
      order: { kind: 'ASC', isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  private async requireAddress(customerId: string, addressId: string): Promise<CustomerAddressEntity> {
    const a = await this.dataSource.manager.findOne(CustomerAddressEntity, { where: { id: addressId, customerId, companyId: this.companyId } });
    if (!a) throw new NotFoundException(err('CUSTOMER_ADDRESS_NOT_FOUND'));
    return a;
  }

  private async saveAddress(a: CustomerAddressEntity, dto: CustomerAddressDto): Promise<CustomerAddressEntity> {
    if (dto.kind !== undefined) a.kind = dto.kind;
    if (dto.label !== undefined) a.label = dto.label || null;
    if (dto.contactName !== undefined) a.contactName = dto.contactName || null;
    if (dto.phone !== undefined) a.phone = dto.phone || null;
    if (dto.isDefault !== undefined) a.isDefault = !!dto.isDefault;
    if (dto.address !== undefined || !a.id) a.address = await this.refdata.normalizeAddress(dto.address || {}, await this.defaultCountry());
    return this.dataSource.transaction(async (m) => {
      if (a.isDefault) {
        // One default address per kind.
        await m.update(CustomerAddressEntity, { companyId: this.companyId, customerId: a.customerId, kind: a.kind, isDefault: true }, { isDefault: false });
      }
      return m.save(CustomerAddressEntity, a);
    });
  }

  async addAddress(customerId: string, dto: CustomerAddressDto): Promise<CustomerAddressEntity> {
    await this.getCustomer(customerId);
    const a = this.dataSource.manager.create(CustomerAddressEntity, { companyId: this.companyId, customerId, kind: 'DELIVERY', isDefault: false });
    const saved = await this.saveAddress(a, dto);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'update', customerId });
    return saved;
  }

  async updateAddress(customerId: string, addressId: string, dto: CustomerAddressDto): Promise<CustomerAddressEntity> {
    await this.getCustomer(customerId);
    const saved = await this.saveAddress(await this.requireAddress(customerId, addressId), dto);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'update', customerId });
    return saved;
  }

  async deleteAddress(customerId: string, addressId: string): Promise<boolean> {
    const a = await this.requireAddress(customerId, addressId);
    await this.dataSource.manager.remove(CustomerAddressEntity, a);
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'update', customerId });
    return true;
  }
}
