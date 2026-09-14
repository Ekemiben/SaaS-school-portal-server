import { Injectable, BadRequestException } from '@nestjs/common';
import { DisbursementProviderAdapter } from './disbursement-provider.interface.js';
import { PaystackDisbursementAdapter } from './paystack-disbursement.adapter.js';
import { FlutterwaveDisbursementAdapter } from './flutterwave-disbursement.adapter.js';

@Injectable()
export class DisbursementProviderFactory {
  constructor(
    private readonly paystackAdapter: PaystackDisbursementAdapter,
    private readonly flutterwaveAdapter: FlutterwaveDisbursementAdapter,
  ) {}

  getProvider(providerName?: string): DisbursementProviderAdapter {
    const name = (providerName || 'paystack').toLowerCase();
    switch (name) {
      case 'paystack':
        return this.paystackAdapter;
      case 'flutterwave':
        return this.flutterwaveAdapter;
      default:
        throw new BadRequestException(`Unsupported bank disbursement provider: "${providerName}". Supported: "paystack", "flutterwave".`);
    }
  }
}
