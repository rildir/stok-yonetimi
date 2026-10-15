/** Persistence of the mock integrator (DB table ebelge_mock_documents, or memory in unit tests). */
export interface MockDocument {
  companyId: string;
  ettn: string;
  docType: string;
  /** SENT: received from the company; INBOX: waiting for the company */
  box: 'SENT' | 'INBOX';
  counterpartyTaxId?: string | null;
  xml: string;
  status: string;
  receivedAt: Date;
  data?: Record<string, any> | null;
}

export interface MockStore {
  get(companyId: string, ettn: string, box: 'SENT' | 'INBOX'): Promise<MockDocument | null>;
  /** Insert; throws when (companyId, ettn, box) exists */
  insert(doc: MockDocument): Promise<void>;
  update(companyId: string, ettn: string, box: 'SENT' | 'INBOX', patch: Partial<MockDocument>): Promise<void>;
  list(companyId: string, box: 'SENT' | 'INBOX', since?: Date | null): Promise<MockDocument[]>;
}

export class MemoryMockStore implements MockStore {
  readonly docs: MockDocument[] = [];

  async get(companyId: string, ettn: string, box: 'SENT' | 'INBOX') {
    return this.docs.find((d) => d.companyId === companyId && d.ettn === ettn && d.box === box) || null;
  }

  async insert(doc: MockDocument) {
    if (await this.get(doc.companyId, doc.ettn, doc.box)) throw new Error('duplicate');
    this.docs.push({ ...doc });
  }

  async update(companyId: string, ettn: string, box: 'SENT' | 'INBOX', patch: Partial<MockDocument>) {
    const d = await this.get(companyId, ettn, box);
    if (d) Object.assign(d, patch);
  }

  async list(companyId: string, box: 'SENT' | 'INBOX', since?: Date | null) {
    return this.docs.filter((d) => d.companyId === companyId && d.box === box && (!since || d.receivedAt.getTime() > since.getTime()));
  }
}
