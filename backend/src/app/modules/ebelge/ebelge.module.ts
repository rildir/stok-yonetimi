import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { GatewayModule } from '../../shared/gateway.module';
import { DocumentsModule } from '../documents/documents.module';
import { ProviderRegistry } from './provider-registry.service';
import { EBelgeSettingsService } from './ebelge-settings.service';
import { RegistryService } from './registry.service';
import { EDocumentService } from './edocument.service';
import { InboxService } from './inbox.service';
import { EDocumentArchiveService } from './archive.service';
import { EBelgeWorker } from './ebelge-worker.service';
import { EBelgeDemoSeeder } from './demo-ebelge.seed';
import { EBelgeController, EBelgeWebhookController, EDocumentController } from './ebelge.controller';

/**
 * WP5 e-Belge: UBL-TR builders and validation, integrator abstraction (mock provider), outbox,
 * status timeline, inbox with responses, working-copy archive and inspection package.
 */
@Module({
  imports: [SharedModule, GatewayModule, DocumentsModule],
  controllers: [EBelgeController, EDocumentController, EBelgeWebhookController],
  providers: [ProviderRegistry, EBelgeSettingsService, RegistryService, EDocumentService, InboxService, EDocumentArchiveService, EBelgeWorker, EBelgeDemoSeeder],
  exports: [ProviderRegistry, EBelgeSettingsService, RegistryService, EDocumentService, InboxService, EDocumentArchiveService],
})
export class EBelgeModule {}
