import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { CommunicationWalletService } from './services/communication-wallet.service.js';
import { CommunicationPaystackService } from './services/communication-paystack.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  InitializeWalletTopUpDto,
  WalletTransactionFilterDto,
} from './dto/communication-wallet.dto.js';

@Controller('api/v1/communication/wallet')
export class CommunicationWalletController {
  constructor(
    private readonly walletService: CommunicationWalletService,
    private readonly paystackService: CommunicationPaystackService,
  ) {}

  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  @Get()
  async getWallet(@CurrentTenant() tenant: TenantContext) {
    return this.walletService.getOrCreateWallet(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  @Post('top-up')
  async initializeTopUp(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: InitializeWalletTopUpDto,
  ) {
    return this.paystackService.initializeTopUp(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  @Get('verify/:reference')
  async verifyTopUp(
    @CurrentTenant() tenant: TenantContext,
    @Param('reference') reference: string,
  ) {
    return this.paystackService.verifyTopUp(tenant.tenantId, reference);
  }

  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    return this.paystackService.handleWebhook(payload, signature);
  }

  @RequirePermissions(SystemPermissions.COMMUNICATIONS_VIEW)
  @Get('transactions')
  async listTransactions(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: WalletTransactionFilterDto,
  ) {
    return this.walletService.listTransactions(tenant.tenantId, filter);
  }

  @RequirePermissions(SystemPermissions.COMMUNICATIONS_MANAGE)
  @Post('transactions/:id/refund')
  async refundTransaction(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.walletService.refundTransaction(tenant.tenantId, id, reason || 'Administrative Refund');
  }
}
