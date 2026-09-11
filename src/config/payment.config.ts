export const paymentConfig = () => ({
  payment: {
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_paystack',
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_mock_paystack',
      webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || 'whsec_paystack_secret',
    },
    flutterwave: {
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-mock',
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK_TEST-mock',
      encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || 'flw_enc_key',
      webhookSecretHash: process.env.FLUTTERWAVE_SECRET_HASH || 'flutterwave_hash',
    },
  },
});
