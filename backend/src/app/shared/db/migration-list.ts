import { InitialMigration1784274121999 } from '../../migrations/1784274121999-InitialMigration';
import { RemoveSubscription1784274122000 } from '../../migrations/1784274122000-RemoveSubscription';
import { AddMultiTenancy1784274123000 } from '../../migrations/1784274123000-AddMultiTenancy';
import { AddCurrencyTaxCustomersWarehouseStock1784274124000 } from '../../migrations/1784274124000-AddCurrencyTaxCustomersWarehouseStock';
import { AddBarcodesLotsSerialsUnits1784274125000 } from '../../migrations/1784274125000-AddBarcodesLotsSerialsUnits';
import { AddAuditApiKeysWebhooks1784274126000 } from '../../migrations/1784274126000-AddAuditApiKeysWebhooks';
import { AddFiscalIdentityAddressLegalParams1784274127000 } from '../../migrations/1784274127000-AddFiscalIdentityAddressLegalParams';
import { FixLegalParamsDemoIdentities1784274128000 } from '../../migrations/1784274128000-FixLegalParamsDemoIdentities';
import { InventoryCoreDecimalImmutable1784274129000 } from '../../migrations/1784274129000-InventoryCoreDecimalImmutable';
import { InventoryCoreReviewFixes1784274130000 } from '../../migrations/1784274130000-InventoryCoreReviewFixes';
import { MakerCheckerControlRequests1784274131000 } from '../../migrations/1784274131000-MakerCheckerControlRequests';
import { TaxEngine1784274132000 } from '../../migrations/1784274132000-TaxEngine';
import { TaxEngineReviewFixes1784274133000 } from '../../migrations/1784274133000-TaxEngineReviewFixes';
import { TaxEngineReviewFixes21784274134000 } from '../../migrations/1784274134000-TaxEngineReviewFixes2';
import { DocumentRegime1784274135000 } from '../../migrations/1784274135000-DocumentRegime';
import { DocumentRegimeReviewFixes1784274136000 } from '../../migrations/1784274136000-DocumentRegimeReviewFixes';
import { EBelgeIntegration1784274137000 } from '../../migrations/1784274137000-EBelgeIntegration';
import { CostingPeriodsInventoryReports1784274139000 } from '../../migrations/1784274139000-CostingPeriodsInventoryReports';
import { EBelgeReviewFixes1784274138000 } from '../../migrations/1784274138000-EBelgeReviewFixes';
import { CostingReviewFixes1784274140000 } from '../../migrations/1784274140000-CostingReviewFixes';
import { KvkkDataGovernance1784274141000 } from '../../migrations/1784274141000-KvkkDataGovernance';
import { KvkkReviewFixes1784274142000 } from '../../migrations/1784274142000-KvkkReviewFixes';
import { KvkkAuditMaskAttestation1784274143000 } from '../../migrations/1784274143000-KvkkAuditMaskAttestation';

/**
 * Every migration, in order. The application bundle (webpack) cannot glob the
 * migrations folder, so the running app knows them from this list; it is used by
 * the schema-sync guard to detect pending / unknown migrations. A unit test keeps it
 * in step with the files in `app/migrations`.
 */
export const MIGRATIONS = [
  InitialMigration1784274121999,
  RemoveSubscription1784274122000,
  AddMultiTenancy1784274123000,
  AddCurrencyTaxCustomersWarehouseStock1784274124000,
  AddBarcodesLotsSerialsUnits1784274125000,
  AddAuditApiKeysWebhooks1784274126000,
  AddFiscalIdentityAddressLegalParams1784274127000,
  FixLegalParamsDemoIdentities1784274128000,
  InventoryCoreDecimalImmutable1784274129000,
  InventoryCoreReviewFixes1784274130000,
  MakerCheckerControlRequests1784274131000,
  TaxEngine1784274132000,
  TaxEngineReviewFixes1784274133000,
  TaxEngineReviewFixes21784274134000,
  DocumentRegime1784274135000,
  DocumentRegimeReviewFixes1784274136000,
  EBelgeIntegration1784274137000,
  EBelgeReviewFixes1784274138000,
  CostingPeriodsInventoryReports1784274139000,
  CostingReviewFixes1784274140000,
  KvkkDataGovernance1784274141000,
  KvkkReviewFixes1784274142000,
  KvkkAuditMaskAttestation1784274143000,
];
