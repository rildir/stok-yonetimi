import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { KvkkController, KvkkPublicController } from './kvkk.controller';
import { NoticeService } from './notice.service';
import { ConsentService } from './consent.service';
import { RetentionService } from './retention.service';
import { DsrService } from './dsr.service';
import { SubjectReportService } from './subject-report.service';
import { IncidentService } from './incident.service';
import { GovernanceService } from './governance.service';
import { TenantClosureService } from './tenant-closure.service';
import { AuditChainService } from './audit-chain.service';
import { ErasureService } from './erasure.service';
import { KvkkDemoSeeder } from './demo-kvkk.seed';

/** WP7 - KVKK and data governance. */
@Module({
  imports: [SharedModule, GatewayModule],
  controllers: [KvkkPublicController, KvkkController],
  providers: [
    NoticeService,
    ConsentService,
    RetentionService,
    DsrService,
    SubjectReportService,
    IncidentService,
    GovernanceService,
    TenantClosureService,
    AuditChainService,
    ErasureService,
    KvkkDemoSeeder,
  ],
  exports: [AuditChainService, ErasureService],
})
export class KvkkModule {}
