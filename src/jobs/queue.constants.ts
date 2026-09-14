export const QUEUES = {
  NOTIFICATIONS: 'notifications-queue',
  REPORTS: 'reports-queue',
  IMPORT_EXPORT: 'import-export-queue',
  PAYMENT_RECONCILE: 'payment-reconcile-queue',
} as const;

export const DEAD_LETTER_QUEUES = {
  NOTIFICATIONS: 'notifications-dlq',
  REPORTS: 'reports-dlq',
  IMPORT_EXPORT: 'import-export-dlq',
  PAYMENT_RECONCILE: 'payment-reconcile-dlq',
} as const;

export const JOB_TYPES = {
  SEND_EMAIL: 'send-email',
  SEND_SMS: 'send-sms',
  SEND_WHATSAPP: 'send-whatsapp',
  GENERATE_REPORT_CARD: 'generate-report-card',
  GENERATE_FINANCIAL_REPORT: 'generate-financial-report',
  BULK_STUDENT_IMPORT: 'bulk-student-import',
  EXPORT_DATA: 'export-data',
  RECONCILE_PAYMENTS: 'reconcile-payments',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 86400, // 24 hours retention
    count: 1000,
  },
  removeOnFail: false, // Keep failed jobs for inspection and DLQ routing
} as const;
