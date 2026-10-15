import { EDocumentProvider } from './edocument-provider';
import { MockEDocumentProvider } from './mock.provider';
import { MockStore } from './mock-store';

export * from './edocument-provider';
export { MockEDocumentProvider, partyFromParsed } from './mock.provider';
export { MemoryMockStore } from './mock-store';
export type { MockStore, MockDocument } from './mock-store';

/** Dependencies the provider adapters may need (extend when a real integrator adapter is added). */
export interface ProviderDeps {
  mockStore: MockStore;
}

/**
 * Every available integrator adapter. A real integrator is added here (new class implementing
 * EDocumentProvider + its name in company_ebelge_settings.provider); no other code changes.
 */
export const EDOCUMENT_PROVIDER_FACTORIES: ((deps: ProviderDeps) => EDocumentProvider)[] = [(deps) => new MockEDocumentProvider(deps.mockStore)];
