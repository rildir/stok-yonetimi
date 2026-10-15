import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MockProviderDocumentEntity } from '../../entities/ebelge.entity';
import { EDOCUMENT_PROVIDER_FACTORIES, EDocumentProvider, MockDocument, MockStore } from '../../shared/ebelge/provider';

/** MockStore on table ebelge_mock_documents. */
export class TypeOrmMockStore implements MockStore {
  constructor(private readonly dataSource: DataSource) {}

  private toDoc(r: MockProviderDocumentEntity): MockDocument {
    return { companyId: r.companyId, ettn: r.ettn, docType: r.docType, box: r.box as 'SENT' | 'INBOX', counterpartyTaxId: r.counterpartyTaxId, xml: r.xml, status: r.status, receivedAt: new Date(r.receivedAt), data: r.data ?? null };
  }

  async get(companyId: string, ettn: string, box: 'SENT' | 'INBOX') {
    const r = await this.dataSource.manager.findOne(MockProviderDocumentEntity, { where: { companyId, ettn, box } });
    return r ? this.toDoc(r) : null;
  }

  async insert(doc: MockDocument) {
    // DATETIME keeps whole seconds (MySQL rounds): store the floor so simulated ages are never negative.
    const receivedAt = new Date(Math.floor(new Date(doc.receivedAt).getTime() / 1000) * 1000);
    await this.dataSource.manager.insert(MockProviderDocumentEntity, { ...doc, receivedAt, data: doc.data ?? null });
  }

  async update(companyId: string, ettn: string, box: 'SENT' | 'INBOX', patch: Partial<MockDocument>) {
    const { companyId: _c, ettn: _e, box: _b, ...rest } = patch;
    if (Object.keys(rest).length) await this.dataSource.manager.update(MockProviderDocumentEntity, { companyId, ettn, box }, rest as any);
  }

  async list(companyId: string, box: 'SENT' | 'INBOX', since?: Date | null) {
    const qb = this.dataSource.manager.createQueryBuilder(MockProviderDocumentEntity, 'm').where('m.companyId = :companyId AND m.box = :box', { companyId, box });
    if (since) qb.andWhere('m.receivedAt > :since', { since });
    return (await qb.orderBy('m.receivedAt', 'ASC').getMany()).map((r) => this.toDoc(r));
  }
}

/** Available integrator adapters by name (company_ebelge_settings.provider). */
@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, EDocumentProvider>();

  constructor(dataSource: DataSource) {
    const deps = { mockStore: new TypeOrmMockStore(dataSource) };
    for (const f of EDOCUMENT_PROVIDER_FACTORIES) {
      const p = f(deps);
      this.providers.set(p.name, p);
    }
  }

  /** Test hook: replace / add an adapter. */
  register(p: EDocumentProvider): void {
    this.providers.set(p.name, p);
  }

  get(name: string | null | undefined): EDocumentProvider | null {
    return name ? this.providers.get(name) || null : null;
  }

  list(): { name: string; label: string; capabilities: ReturnType<EDocumentProvider['capabilities']> }[] {
    return [...this.providers.values()].map((p) => ({ name: p.name, label: p.label, capabilities: p.capabilities() }));
  }
}
