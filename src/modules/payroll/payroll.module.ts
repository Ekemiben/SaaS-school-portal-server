import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { BulkPayrollService } from './bulk-payroll.service.js';
import { PayrollDisbursementService } from './payroll-disbursement.service.js';
import { PayslipService } from './payslip.service.js';
import { PaystackDisbursementAdapter } from './disbursement/paystack-disbursement.adapter.js';
import { FlutterwaveDisbursementAdapter } from './disbursement/flutterwave-disbursement.adapter.js';
import { DisbursementProviderFactory } from './disbursement/disbursement-provider.factory.js';
import { FilesModule } from '../files/files.module.js';

@Module({
  imports: [FilesModule],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    BulkPayrollService,
    PayrollDisbursementService,
    PayslipService,
    PaystackDisbursementAdapter,
    FlutterwaveDisbursementAdapter,
    DisbursementProviderFactory,
  ],
  exports: [
    PayrollService,
    BulkPayrollService,
    PayrollDisbursementService,
    PayslipService,
    DisbursementProviderFactory,
  ],
})
export class PayrollModule {}
