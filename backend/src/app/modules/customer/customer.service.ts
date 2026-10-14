import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { CustomerEntity } from '../../entities/customer.entity';
import { OrderEntity } from '../../entities/order.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { AppGateway } from '../../app.gateway';
import { CreateCustomerDto, UpdateCustomerDto } from '../../dto/customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    private readonly tenant: TenantContext,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly appGateway: AppGateway,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** Customers with order count / last order date. */
  async getCustomers(): Promise<(CustomerEntity & { orderCount: number; lastOrderDate: string | null })[]> {
    const customers = await this.customerRepo.find({
      where: { companyId: this.companyId, isDeleted: false },
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

  private clean(dto: Partial<CreateCustomerDto>): Partial<CustomerEntity> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      out[k] = v === '' ? null : v;
    }
    return out as Partial<CustomerEntity>;
  }

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerEntity> {
    const saved = await this.customerRepo.save(
      this.customerRepo.create({ type: 'individual', ...this.clean(dto), companyId: this.companyId }),
    );
    this.appGateway.emitToCompany(this.companyId, 'customer_mutated', { type: 'create', customer: saved });
    return saved;
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto): Promise<CustomerEntity> {
    const c = await this.getCustomer(id);
    Object.assign(c, this.clean(dto), { id: c.id, companyId: this.companyId });
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
}
