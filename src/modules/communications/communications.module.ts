import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller.js';
import { CommunicationWalletController } from './communication-wallet.controller.js';
import { CommunicationsService } from './communications.service.js';
import { AudienceService } from './services/audience.service.js';
import { MessageTemplateService } from './services/message-template.service.js';
import { CommunicationPolicyService } from './services/communication-policy.service.js';
import { CommunicationWalletService } from './services/communication-wallet.service.js';
import { CommunicationPaystackService } from './services/communication-paystack.service.js';
import { CampaignService } from './services/campaign.service.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [PaymentsModule],
  controllers: [CommunicationsController, CommunicationWalletController],
  providers: [
    CommunicationsService,
    AudienceService,
    MessageTemplateService,
    CommunicationPolicyService,
    CommunicationWalletService,
    CommunicationPaystackService,
    CampaignService,
  ],
  exports: [
    CommunicationsService,
    AudienceService,
    MessageTemplateService,
    CommunicationPolicyService,
    CommunicationWalletService,
    CommunicationPaystackService,
    CampaignService,
  ],
})
export class CommunicationsModule {}
