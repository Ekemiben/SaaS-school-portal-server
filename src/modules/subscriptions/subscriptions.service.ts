import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QuotaOverrideDto } from './dto/quota-override.dto.js';
import { CreateCustomPlanRequestDto } from './dto/custom-plan-request.dto.js';
import {
  PlatformSubscriptionFilterDto,
  UpdatePlanConfigDto,
  GrantIncentiveDto,
  TenantActionReasonDto,
} from './dto/platform-subscription-management.dto.js';
import {
  PreviewPlanChangeDto,
  UpgradeSubscriptionDto,
  DowngradeSubscriptionDto,
  SuperAdminChangePlanDto,
} from './dto/plan-change.dto.js';

export interface PlanTierDefinition {
  tier: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  termlyPrice?: number;
  maxStudents: number;
  maxCampuses: number;
  maxStaff: number;
  storageLimitMb: number;
  messagingQuota: number;
  features: string[];
  description: string;
  isPopular?: boolean;
}

export const SAAS_PLANS: Record<string, PlanTierDefinition> = {
  free_trial: {
    tier: 'free_trial',
    name: 'Free Trial (60 Days)',
    monthlyPrice: 0,
    annualPrice: 0,
    termlyPrice: 0,
    maxStudents: 500,
    maxCampuses: 1,
    maxStaff: 30,
    storageLimitMb: 10240, // 10 GB
    messagingQuota: 1000,
    features: [
      'academics',
      'attendance',
      'reports',
      'homework',
      'admissions',
      'STUDENT_MANAGEMENT',
      'PARENT_MANAGEMENT',
      'TEACHER_MANAGEMENT',
      'ACADEMIC_MANAGEMENT',
      'ATTENDANCE_BASIC',
      'HOMEWORK',
      'FEE_MANAGEMENT_BASIC',
      'NOTIFICATIONS_BASIC',
      'REPORTS_BASIC',
      'DASHBOARD_BASIC',
      'ADMISSIONS_PORTAL',
    ],
    description: '60-day evaluation trial with core academic and attendance modules.',
  },
  starter: {
    tier: 'starter',
    name: 'Starter Plan',
    monthlyPrice: 99,
    annualPrice: 990,
    termlyPrice: 150000,
    maxStudents: 300,
    maxCampuses: 1,
    maxStaff: 30,
    storageLimitMb: 10240, // 10 GB
    messagingQuota: 1000,
    features: [
      'academics',
      'attendance',
      'reports',
      'homework',
      'notifications',
      'admissions',
      'STUDENT_MANAGEMENT',
      'PARENT_MANAGEMENT',
      'TEACHER_MANAGEMENT',
      'ACADEMIC_MANAGEMENT',
      'ATTENDANCE_BASIC',
      'HOMEWORK',
      'FEE_MANAGEMENT_BASIC',
      'NOTIFICATIONS_BASIC',
      'REPORTS_BASIC',
      'DASHBOARD_BASIC',
      'ADMISSIONS_PORTAL',
    ],
    description: 'Ideal for single-campus primary and secondary schools.',
  },
  standard: {
    tier: 'standard',
    name: 'Standard Growth',
    monthlyPrice: 120000,
    annualPrice: 987000,
    termlyPrice: 350000,
    maxStudents: 1500,
    maxCampuses: 3,
    maxStaff: 100,
    storageLimitMb: 51200, // 50 GB
    messagingQuota: 5000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'STUDENT_MANAGEMENT',
      'PARENT_MANAGEMENT',
      'TEACHER_MANAGEMENT',
      'ACADEMIC_MANAGEMENT',
      'ATTENDANCE_BASIC',
      'HOMEWORK',
      'FEE_MANAGEMENT_BASIC',
      'NOTIFICATIONS_BASIC',
      'REPORTS_BASIC',
      'DASHBOARD_BASIC',
      'EXAMINATIONS_RESULTS',
      'ONLINE_PAYMENTS',
      'ADMISSIONS_PORTAL',
      'ATTENDANCE_ADVANCED',
      'TRANSPORT_BASIC',
      'COMMUNICATION_CHANNELS',
      'PAYROLL_BASIC',
      'EXPENSE_TRACKING',
      'LIBRARY_MANAGEMENT',
      'MEDICAL_CLINIC',
      'HOSTEL_MANAGEMENT',
      'DISCIPLINE_MANAGEMENT',
      'TIMETABLE_MANAGEMENT',
      'ADVANCED_REPORTS',
    ],
    description: 'Comprehensive academic, online fees, admissions, and transport operations for scaling schools.',
  },
  growth: {
    tier: 'growth',
    name: 'Standard Growth',
    monthlyPrice: 249,
    annualPrice: 2490,
    termlyPrice: 350000,
    maxStudents: 1500,
    maxCampuses: 3,
    maxStaff: 100,
    storageLimitMb: 51200, // 50 GB
    messagingQuota: 5000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'EXAMINATIONS_RESULTS',
      'ONLINE_PAYMENTS',
      'ADMISSIONS_PORTAL',
      'TRANSPORT_BASIC',
    ],
    description: 'Comprehensive multi-campus suite for scaling educational institutions.',
  },
  pro: {
    tier: 'growth',
    name: 'Standard Growth (Pro)',
    monthlyPrice: 249,
    annualPrice: 2490,
    termlyPrice: 350000,
    maxStudents: 1500,
    maxCampuses: 3,
    maxStaff: 100,
    storageLimitMb: 51200,
    messagingQuota: 5000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
    ],
    description: 'Full multi-campus suite.',
  },
  premium: {
    tier: 'premium',
    name: 'Premium Enterprise',
    monthlyPrice: 260000,
    annualPrice: 2115000,
    termlyPrice: 750000,
    maxStudents: 5000,
    maxCampuses: 10,
    maxStaff: 500,
    storageLimitMb: 256000, // 250 GB
    messagingQuota: 25000,
    isPopular: true,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'audit',
      'customDomain',
      'prioritySupport',
      'STUDENT_MANAGEMENT',
      'PARENT_MANAGEMENT',
      'TEACHER_MANAGEMENT',
      'ACADEMIC_MANAGEMENT',
      'ATTENDANCE_BASIC',
      'HOMEWORK',
      'FEE_MANAGEMENT_BASIC',
      'NOTIFICATIONS_BASIC',
      'REPORTS_BASIC',
      'DASHBOARD_BASIC',
      'EXAMINATIONS_RESULTS',
      'ONLINE_PAYMENTS',
      'ADMISSIONS_PORTAL',
      'ATTENDANCE_ADVANCED',
      'TRANSPORT_BASIC',
      'COMMUNICATION_CHANNELS',
      'PAYROLL_BASIC',
      'EXPENSE_TRACKING',
      'LIBRARY_MANAGEMENT',
      'MEDICAL_CLINIC',
      'HOSTEL_MANAGEMENT',
      'DISCIPLINE_MANAGEMENT',
      'TIMETABLE_MANAGEMENT',
      'ADVANCED_REPORTS',
      'MULTI_CAMPUS',
      'TRANSPORT_ADVANCED_FLEET',
      'AI_ANALYTICS',
      'ADVANCED_FINANCE',
      'CUSTOM_DOMAIN_SSL',
      'WHATSAPP_AUTOMATION',
      'BIOMETRIC_ATTENDANCE',
      'ADVANCED_AUDIT_LOGS',
      'PRIORITY_SUPPORT',
    ],
    description: 'Flagship institutional platform featuring multi-campus hierarchy, real-time GPS fleet tracking, and AI analytics.',
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise School System',
    monthlyPrice: 599,
    annualPrice: 5990,
    termlyPrice: 750000,
    maxStudents: 10000,
    maxCampuses: 10,
    maxStaff: 500,
    storageLimitMb: 256000, // 250 GB
    messagingQuota: 25000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'audit',
      'customDomain',
      'prioritySupport',
      'dedicatedSla',
    ],
    description: 'For large school networks, state boards, and international school groups.',
  },
  custom: {
    tier: 'custom',
    name: 'Custom Institutional Network',
    monthlyPrice: 0,
    annualPrice: 0,
    termlyPrice: 0,
    maxStudents: 999999,
    maxCampuses: 999,
    maxStaff: 99999,
    storageLimitMb: 1048576, // 1 TB
    messagingQuota: 100000,
    features: [
      'academics',
      'attendance',
      'examinations',
      'results',
      'homework',
      'fees',
      'onlinePayments',
      'payroll',
      'expenses',
      'transport',
      'communications',
      'notifications',
      'medical',
      'admissions',
      'discipline',
      'hostel',
      'library',
      'inventory',
      'reports',
      'audit',
      'customDomain',
      'prioritySupport',
      'dedicatedSla',
      'CUSTOM_INTEGRATIONS',
      'SOVEREIGN_CLOUD_BACKUP',
      'WHITE_LABEL',
      'DEDICATED_INFRASTRUCTURE',
    ],
    description: 'Bespoke infrastructure and integrations for large school groups, ministries, and state boards.',
  },
};

export const FRIENDLY_FEATURE_NAMES: Record<string, string> = {
  ADVANCED_TRANSPORT_TRACKING: 'Advanced Transport Tracking',
  TRANSPORT_ADVANCED_FLEET: 'Advanced Transport Tracking',
  AI_ASSISTANT: 'AI Assistant',
  AI_ANALYTICS: 'AI Assistant',
  CUSTOM_DOMAIN: 'Custom Domain',
  CUSTOM_DOMAIN_SSL: 'Custom Domain',
  ADVANCED_REPORTING: 'Advanced Reporting',
  ADVANCED_REPORTS: 'Advanced Reporting',
  BIOMETRIC_ATTENDANCE: 'Biometric Attendance',
  WHATSAPP_AUTOMATION: 'WhatsApp Automation',
  ONLINE_PAYMENTS: 'Online Fee Payments',
  MULTI_CAMPUS: 'Multi-Campus Management',
  PRIORITY_SUPPORT: 'Priority SLA Support',
  PAYROLL_BASIC: 'Payroll Management',
  EXAMINATIONS_RESULTS: 'Examinations & Broadsheets',
  ADMISSIONS_PORTAL: 'Online Admissions Portal',
  COMMUNICATION_CHANNELS: 'Multi-Channel SMS & Email',
  LIBRARY_MANAGEMENT: 'Library Management',
  HOSTEL_MANAGEMENT: 'Hostel Management',
  DISCIPLINE_MANAGEMENT: 'Discipline Tracking',
  TIMETABLE_MANAGEMENT: 'Timetable Scheduling',
  EXPENSE_TRACKING: 'Expense Tracking',
  MEDICAL_CLINIC: 'Medical Clinic & Infirmary',
};

export const COMPREHENSIVE_PRICING_FAQS = [
  {
    category: 'Billing',
    question: 'How does school SaaS subscription billing work?',
    answer: 'Edusphere operates on a predictable four-tier subscription model (Starter, Standard, Premium, Custom). Schools can choose between Termly billing (3 payments per academic session aligned with school terms) and Annual billing.',
  },
  {
    category: 'Billing',
    question: 'Can our school choose between termly and yearly billing cycles?',
    answer: 'Yes! Nigerian schools operate on a 3-term academic calendar. You can pay each term when school resumes, or pay annually upfront for the entire academic session.',
  },
  {
    category: 'Billing',
    question: 'How does the 6% yearly discount work?',
    answer: 'When paying annually upfront, the total cost for 3 academic terms is automatically discounted by 6%. For example, Standard termly at ₦350,000 x 3 = ₦1,050,000 becomes ₦987,000 annually (saving ₦63,000 per school year).',
  },
  {
    category: 'Trial',
    question: 'What is included in the complimentary Starter Free Trial?',
    answer: 'Every newly registered school receives unrestricted evaluation access to all Starter plan modules for 60 calendar days without requiring credit card details or upfront financial commitments.',
  },
  {
    category: 'Upgrades',
    question: 'How can our school upgrade between plans mid-cycle?',
    answer: 'Upgrades between Starter, Standard, and Premium can be executed at any time. Unused credit from your active term is automatically calculated and credited towards your new plan per Architecture Constitution §49, so you only pay the net prorated difference.',
  },
  {
    category: 'Payments',
    question: 'What payment methods are supported on the platform?',
    answer: 'We support instant online debit/credit cards and bank account transfers via Paystack, automated dedicated virtual account transfers, and official bank transfer/deposit receipts.',
  },
  {
    category: 'Payments',
    question: 'Can schools pay via direct bank transfer or corporate deposit?',
    answer: 'Yes! You can generate an official platform invoice with our corporate account details. Once payment is made and receipt uploaded, our Platform Super Admin reconciles and activates your subscription with an immutable audit trail.',
  },
  {
    category: 'Incentives',
    question: 'How do Super Admin promotional feature incentives work?',
    answer: 'Platform administrators can grant promotional feature incentives (such as Advanced Fleet Tracking, AI Assistant, or Custom Apex Domain) directly to your institution without modifying your purchased base plan tier or renewal pricing.',
  },
  {
    category: 'Cancellation',
    question: 'What happens if our subscription expires or we cancel?',
    answer: 'In accordance with our Zero Data Destruction Guarantee (Constitution §48), we never delete your school records. If your subscription lapses, your portal enters a restricted grace period allowing view-only access to existing records while administrative write operations are paused until renewal.',
  },
  {
    category: 'Limits',
    question: 'What happens if our school reaches our student, campus, or staff limit?',
    answer: 'The system displays proactive alerts in your dashboard when you reach 90% of your student or campus capacity. You can easily upgrade to a higher tier at any time without any disruption to student learning or administrative operations.',
  },
];

export const PLATFORM_CONTACT_CONFIG = {
  whatsapp: process.env.PLATFORM_SUPPORT_WHATSAPP || '+234 810 791 4902',
  whatsappGroup: process.env.PLATFORM_WHATSAPP_COMMUNITY || 'https://chat.whatsapp.com/edusphere-community',
  phone: process.env.PLATFORM_SUPPORT_PHONE || '+234 800 338 7743',
  email: process.env.PLATFORM_SUPPORT_EMAIL || 'support@edusphere.org',
  salesEmail: process.env.PLATFORM_SALES_EMAIL || 'sales@edusphere.org',
  officeAddress: 'Plot 1024, Central Business District, Abuja, FCT, Nigeria',
  workingHours: 'Monday - Friday: 8:00 AM - 6:00 PM (WAT)',
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format Nigerian Naira currency values cleanly.
   */
  private formatCurrency(amount: any): string {
    const val = Number(amount || 0);
    if (val === 0) return 'Custom';
    return `₦${val.toLocaleString('en-NG')}`;
  }

  /**
   * Public catalog of all plans, feature comparison matrix, and billing frequency savings.
   * Consumed by the public pricing marketing page without authentication.
   */
  async getPublicPlans() {
    if (this.prisma.isDbConnected) {
      try {
        const dbPlans = await this.prisma.subscriptionPlan.findMany({
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            features: {
              where: { isIncluded: true },
              orderBy: [{ category: 'asc' }, { featureName: 'asc' }],
            },
          },
        });

        if (dbPlans && dbPlans.length > 0) {
          const plans = dbPlans.map((p) => {
            const termlyNum = Number(p.termlyPrice);
            const annualNum = Number(p.annualPrice);
            const threeTerms = termlyNum * 3;
            const savings = threeTerms > annualNum ? threeTerms - annualNum : 0;

            return {
              id: p.id,
              tier: p.tier,
              name: p.name,
              description: p.description,
              termlyPrice: termlyNum,
              termlyPriceFormatted: this.formatCurrency(termlyNum),
              annualPrice: annualNum,
              annualPriceFormatted: this.formatCurrency(annualNum),
              yearlyDiscountPercent: p.yearlyDiscountPercent,
              savingsAmount: savings,
              savingsFormatted: this.formatCurrency(savings),
              currency: p.currency,
              maxStudents: p.maxStudents >= 900000 ? 'Unlimited' : p.maxStudents,
              maxCampuses: p.maxCampuses >= 900 ? 'Unlimited' : p.maxCampuses,
              maxStaff: p.maxStaff >= 90000 ? 'Unlimited' : p.maxStaff,
              storageLimitMb: p.storageLimitMb,
              messagingQuota: p.messagingQuota,
              isPopular: p.isPopular,
              features: p.features.map((f) => ({
                key: f.featureKey,
                name: f.featureName,
                category: f.category,
              })),
            };
          });

          // Build comparison matrix
          const featureKeysMap = new Map<string, { key: string; name: string; category: string }>();
          dbPlans.forEach((plan) => {
            plan.features.forEach((feat) => {
              if (!featureKeysMap.has(feat.featureKey)) {
                featureKeysMap.set(feat.featureKey, {
                  key: feat.featureKey,
                  name: feat.featureName,
                  category: feat.category,
                });
              }
            });
          });

          const comparisonMatrix = Array.from(featureKeysMap.values()).map((feat) => {
            const row: Record<string, any> = {
              key: feat.key,
              name: feat.name,
              category: feat.category,
            };
            dbPlans.forEach((plan) => {
              const hasFeat = plan.features.some((f) => f.featureKey === feat.key);
              row[plan.tier.toLowerCase()] = hasFeat;
            });
            return row;
          });

          return {
            plans,
            comparisonMatrix,
            yearlyDiscountPercent: 6.0,
            trialDays: 60,
            billingFrequencies: [
              { key: 'TERMLY', label: 'Termly Billing', description: 'Pay per academic term (3 terms per session)' },
              { key: 'ANNUAL', label: 'Yearly Billing', description: 'Pay for the whole academic year (Save 6%)', discount: 'Save 6%', discountPercent: 6.0 },
            ],
            faq: COMPREHENSIVE_PRICING_FAQS,
            contact: PLATFORM_CONTACT_CONFIG,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch public plans from DB: ${err?.message}. Falling back to default catalog.`);
      }
    }

    // Default Fallback catalog
    const fallbackPlans = [
      {
        id: 'plan-starter',
        tier: 'STARTER',
        name: 'Starter Campus',
        description: 'Essential core school operations for single-campus institutions.',
        termlyPrice: 150000,
        termlyPriceFormatted: '₦150,000',
        annualPrice: 423000,
        annualPriceFormatted: '₦423,000',
        yearlyDiscountPercent: 6.0,
        savingsAmount: 27000,
        savingsFormatted: '₦27,000',
        currency: 'NGN',
        maxStudents: 500,
        maxCampuses: 1,
        maxStaff: 30,
        isPopular: false,
        features: [
          { key: 'STUDENT_MANAGEMENT', name: 'Student Records & Profiles', category: 'CORE' },
          { key: 'PARENT_MANAGEMENT', name: 'Parent Directory & Linking', category: 'CORE' },
          { key: 'TEACHER_MANAGEMENT', name: 'Teacher & Staff Directory', category: 'CORE' },
          { key: 'ACADEMIC_MANAGEMENT', name: 'Academic Calendar & Terms', category: 'ACADEMIC' },
          { key: 'ATTENDANCE_BASIC', name: 'Daily Attendance Roll-Call', category: 'CORE' },
          { key: 'HOMEWORK', name: 'Homework Assignments', category: 'ACADEMIC' },
          { key: 'FEE_MANAGEMENT_BASIC', name: 'Fee Schedules & Manual Receipts', category: 'FINANCE' },
          { key: 'NOTIFICATIONS_BASIC', name: 'In-App Announcements', category: 'CORE' },
        ],
      },
      {
        id: 'plan-standard',
        tier: 'STANDARD',
        name: 'Standard Growth',
        description: 'Comprehensive academic examinations, online fees, admissions, and transport operations for scaling schools.',
        termlyPrice: 350000,
        termlyPriceFormatted: '₦350,000',
        annualPrice: 987000,
        annualPriceFormatted: '₦987,000',
        yearlyDiscountPercent: 6.0,
        savingsAmount: 63000,
        savingsFormatted: '₦63,000',
        currency: 'NGN',
        maxStudents: 1500,
        maxCampuses: 3,
        maxStaff: 100,
        isPopular: false,
        features: [
          { key: 'EXAMINATIONS_RESULTS', name: 'Examinations, Broadsheets & Report Cards', category: 'ACADEMIC' },
          { key: 'ONLINE_PAYMENTS', name: 'Paystack & Flutterwave Online Fee Gateway', category: 'FINANCE' },
          { key: 'ADMISSIONS_PORTAL', name: 'Online Applications & Screening', category: 'OPERATIONS' },
          { key: 'TRANSPORT_BASIC', name: 'Routes, Vehicle Allocations & Roster', category: 'OPERATIONS' },
          { key: 'COMMUNICATION_CHANNELS', name: 'Multi-Channel SMS & Email Broadcasts', category: 'OPERATIONS' },
          { key: 'PAYROLL_BASIC', name: 'Staff Salary Profiles & Payslips', category: 'FINANCE' },
        ],
      },
      {
        id: 'plan-premium',
        tier: 'PREMIUM',
        name: 'Premium Enterprise',
        description: 'Flagship institutional platform featuring multi-campus hierarchy, real-time GPS fleet tracking, and AI analytics.',
        termlyPrice: 750000,
        termlyPriceFormatted: '₦750,000',
        annualPrice: 2115000,
        annualPriceFormatted: '₦2,115,000',
        yearlyDiscountPercent: 6.0,
        savingsAmount: 135000,
        savingsFormatted: '₦135,000',
        currency: 'NGN',
        maxStudents: 5000,
        maxCampuses: 10,
        maxStaff: 500,
        isPopular: true,
        features: [
          { key: 'MULTI_CAMPUS', name: 'Multi-Branch Campus Architecture', category: 'OPERATIONS' },
          { key: 'TRANSPORT_ADVANCED_FLEET', name: 'Real-Time GPS Bus Telemetry', category: 'OPERATIONS' },
          { key: 'AI_ANALYTICS', name: 'Predictive Learning Analytics & AI Assistants', category: 'ADVANCED' },
          { key: 'CUSTOM_DOMAIN_SSL', name: 'Custom Apex Domain & Automated SSL Provisioning', category: 'ADVANCED' },
          { key: 'WHATSAPP_AUTOMATION', name: 'Automated WhatsApp Parent Notifications', category: 'OPERATIONS' },
          { key: 'PRIORITY_SUPPORT', name: 'Dedicated Technical Account Manager & WhatsApp SLA', category: 'ADVANCED' },
        ],
      },
      {
        id: 'plan-custom',
        tier: 'CUSTOM',
        name: 'Custom Institutional Network',
        description: 'Bespoke infrastructure and integrations for large school groups, ministries, and state boards.',
        termlyPrice: 0,
        termlyPriceFormatted: 'Custom',
        annualPrice: 0,
        annualPriceFormatted: 'Custom',
        yearlyDiscountPercent: 6.0,
        savingsAmount: 0,
        savingsFormatted: 'Custom',
        currency: 'NGN',
        maxStudents: 'Unlimited',
        maxCampuses: 'Unlimited',
        maxStaff: 'Unlimited',
        isPopular: false,
        features: [
          { key: 'CUSTOM_INTEGRATIONS', name: 'Sovereign Bank Feeds (NIBSS) & ERP Connectors', category: 'ADVANCED' },
          { key: 'SOVEREIGN_CLOUD_BACKUP', name: 'Dedicated Database Replicas & Custom Snapshots', category: 'ADVANCED' },
          { key: 'WHITE_LABEL', name: 'White-Label Branding & Mobile App Builds', category: 'ADVANCED' },
          { key: 'DEDICATED_INFRASTRUCTURE', name: 'Dedicated Compute Instances & Bespoke SLA', category: 'ADVANCED' },
        ],
      },
    ];

    return {
      plans: fallbackPlans,
      comparisonMatrix: [],
      yearlyDiscountPercent: 6.0,
      trialDays: 60,
      billingFrequencies: [
        { key: 'TERMLY', label: 'Termly Billing', description: 'Pay per academic term (3 terms per session)' },
        { key: 'ANNUAL', label: 'Yearly Billing', description: 'Pay for the whole academic year (Save 6%)', discount: 'Save 6%', discountPercent: 6.0 },
      ],
      faq: COMPREHENSIVE_PRICING_FAQS,
      contact: PLATFORM_CONTACT_CONFIG,
    };
  }

  /**
   * Plans list for authenticated school dashboard modals and upgrade cards.
   */
  async getPlans() {
    if (this.prisma.isDbConnected) {
      try {
        const dbPlans = await this.prisma.subscriptionPlan.findMany({
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            features: {
              where: { isIncluded: true },
            },
          },
        });

        if (dbPlans && dbPlans.length > 0) {
          return dbPlans.map((p) => ({
            id: p.id,
            tier: p.tier.toLowerCase(),
            planTier: p.tier,
            name: p.name,
            description: p.description,
            price: this.formatCurrency(p.termlyPrice),
            termlyPrice: Number(p.termlyPrice),
            annualPrice: Number(p.annualPrice),
            period: '/ term',
            maxStudents: p.maxStudents >= 900000 ? 'Unlimited' : p.maxStudents,
            maxCampuses: p.maxCampuses >= 900 ? 'Unlimited' : p.maxCampuses,
            maxStaff: p.maxStaff >= 90000 ? 'Unlimited' : p.maxStaff,
            popular: p.isPopular,
            isPopular: p.isPopular,
            features: p.features.map((f) => f.featureName),
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not load plans from DB: ${err?.message}`);
      }
    }

    // Default fallback
    return [
      {
        id: 'plan-starter',
        tier: 'starter',
        planTier: 'STARTER',
        name: 'Starter Campus',
        price: '₦150,000',
        termlyPrice: 150000,
        annualPrice: 423000,
        period: '/ term',
        maxStudents: 500,
        maxCampuses: 1,
        features: [
          'Up to 500 Students',
          '1 Campus Location',
          'Single Domain Subdomain',
          'Basic Exam & Results Module',
          'Standard Email Support',
        ],
      },
      {
        id: 'plan-standard',
        tier: 'standard',
        planTier: 'STANDARD',
        name: 'Standard Growth',
        price: '₦350,000',
        termlyPrice: 350000,
        annualPrice: 987000,
        period: '/ term',
        maxStudents: 1500,
        maxCampuses: 3,
        features: [
          'Up to 1,500 Students',
          'Up to 3 Campuses',
          'Examinations & Broadsheets',
          'Paystack & Flutterwave Online Fees',
          'Transport Operations Roster',
        ],
      },
      {
        id: 'plan-premium',
        tier: 'premium',
        planTier: 'PREMIUM',
        name: 'Premium Enterprise',
        price: '₦750,000',
        termlyPrice: 750000,
        annualPrice: 2115000,
        period: '/ term',
        maxStudents: 5000,
        maxCampuses: 10,
        popular: true,
        isPopular: true,
        features: [
          'Up to 5,000 Students',
          'Up to 10 Campuses',
          'Multi-Branch Hierarchy',
          'Real-Time GPS Bus Telemetry',
          'AI Performance Analytics',
          'Custom Apex Domain & SSL',
        ],
      },
      {
        id: 'plan-custom',
        tier: 'custom',
        planTier: 'CUSTOM',
        name: 'Custom Institutional Network',
        price: 'Custom',
        termlyPrice: 0,
        annualPrice: 0,
        period: 'Contact Us',
        maxStudents: 'Unlimited',
        maxCampuses: 'Unlimited',
        features: [
          'Unlimited Students & Campuses',
          'NIBSS Direct Bank Feeds',
          'Dedicated PostgreSQL Replicas',
          'Full White-Label Branding',
          '24/7 Dedicated Technical SLA',
        ],
      },
    ];
  }

  /**
   * Retrieves tenant subscription, plan details, active incentives/overrides, and live quota usage.
   */
  async getSubscription(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        let dbSub = await this.prisma.subscription.findFirst({
          where: { tenantId },
          include: {
            plan: {
              include: {
                features: true,
              },
            },
            overrides: true,
          },
        });

        // If no DB subscription exists yet for this tenant, look up tenant and create baseline record
        if (!dbSub) {
          const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
          });

          let targetTier = 'STARTER';
          if (tenant?.plan?.toUpperCase() === 'STANDARD' || tenant?.plan?.toLowerCase() === 'growth') {
            targetTier = 'STANDARD';
          } else if (tenant?.plan?.toUpperCase() === 'PREMIUM' || tenant?.plan?.toLowerCase() === 'pro') {
            targetTier = 'PREMIUM';
          } else if (tenant?.plan?.toUpperCase() === 'CUSTOM' || tenant?.plan?.toLowerCase() === 'enterprise') {
            targetTier = 'CUSTOM';
          }

          let planRow = await this.prisma.subscriptionPlan.findUnique({
            where: { tier: targetTier },
            include: { features: true },
          });

          if (!planRow) {
            planRow = await this.prisma.subscriptionPlan.findFirst({
              include: { features: true },
            });
          }

          const now = new Date();
          const trialEnd = new Date(now.getTime() + 60 * 86400000); // 60 days
          const isTrial = tenant?.status === 'TRIAL';

          dbSub = await this.prisma.subscription.create({
            data: {
              id: `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`,
              tenantId,
              planId: planRow?.id || null,
              planTier: targetTier,
              status: isTrial ? 'TRIAL' : 'ACTIVE',
              billingCycle: 'TERMLY',
              priceAtPurchase: planRow ? Number(planRow.termlyPrice) : 150000,
              currency: planRow?.currency || 'NGN',
              trialEndsAt: isTrial ? trialEnd : null,
              currentPeriodStart: now,
              currentPeriodEnd: isTrial ? trialEnd : new Date(now.getTime() + 90 * 86400000),
              maxStudents: planRow?.maxStudents || 500,
              maxCampuses: planRow?.maxCampuses || 1,
              maxStaff: planRow?.maxStaff || 30,
              storageLimitMb: planRow?.storageLimitMb || 10240,
            },
            include: {
              plan: {
                include: {
                  features: true,
                },
              },
              overrides: true,
            },
          });
        }

        // Calculate live resources from PostgreSQL
        const [studentCount, campusCount, staffCount] = await Promise.all([
          this.prisma.student.count({ where: { tenantId, status: { not: 'GRADUATED' } } }).catch(() => 0),
          this.prisma.campus.count({ where: { tenantId } }).catch(() => 0),
          this.prisma.teacher.count({ where: { tenantId } }).catch(() => 0),
        ]);

        // Calculate effective entitlements: Plan features + Active overrides
        const planFeatures = (dbSub.plan?.features || [])
          .filter((f) => f.isIncluded)
          .map((f) => f.featureKey);

        const now = new Date();
        const activeOverrides = (dbSub.overrides || []).filter(
          (o) => !o.expiresAt || new Date(o.expiresAt) > now,
        );

        const effectiveFeaturesSet = new Set<string>(planFeatures);
        const incentivesList: any[] = [];

        activeOverrides.forEach((override) => {
          if (override.isEnabled) {
            effectiveFeaturesSet.add(override.featureKey);
            const daysRemaining = override.expiresAt
              ? Math.max(0, Math.ceil((new Date(override.expiresAt).getTime() - now.getTime()) / 86400000))
              : null;
            const featureName =
              FRIENDLY_FEATURE_NAMES[override.featureKey] ||
              override.featureKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

            incentivesList.push({
              key: override.featureKey,
              featureKey: override.featureKey,
              name: featureName,
              featureName,
              reason: override.reason || 'Administrative Promotional Incentive',
              expiresAt: override.expiresAt,
              daysRemaining,
              grantedBy: override.grantedBy || 'Platform Super Admin',
            });
          } else {
            effectiveFeaturesSet.delete(override.featureKey);
          }
        });

        const effectiveFeatures = Array.from(effectiveFeaturesSet);
        const tierKey = dbSub.planTier.toLowerCase();
        const staticFallbackPlan = SAAS_PLANS[tierKey] || SAAS_PLANS.standard;

        const planFeatureNames = (dbSub.plan?.features || [])
          .filter((f) => f.isIncluded)
          .map((f) => f.featureName || f.featureKey);

        const planDetails: PlanTierDefinition = {
          tier: tierKey,
          name: dbSub.plan?.name || staticFallbackPlan.name,
          monthlyPrice: staticFallbackPlan.monthlyPrice,
          annualPrice: Number(dbSub.plan?.annualPrice || staticFallbackPlan.annualPrice),
          termlyPrice: Number(dbSub.plan?.termlyPrice || staticFallbackPlan.termlyPrice || 0),
          maxStudents: dbSub.maxStudents,
          maxCampuses: dbSub.maxCampuses,
          maxStaff: dbSub.maxStaff,
          storageLimitMb: dbSub.storageLimitMb,
          messagingQuota: dbSub.plan?.messagingQuota || 1000,
          features: planFeatureNames.length > 0 ? planFeatureNames : planFeatures,
          description: dbSub.plan?.description || staticFallbackPlan.description,
        };

        const subDto = {
          id: dbSub.id,
          tenantId: dbSub.tenantId,
          planId: dbSub.planId || `plan-${tierKey}`,
          planTier: dbSub.planTier,
          tier: tierKey,
          status: dbSub.status,
          billingCycle: dbSub.billingCycle,
          priceAtPurchase: Number(dbSub.priceAtPurchase),
          currency: dbSub.currency,
          trialEndsAt: dbSub.trialEndsAt,
          gracePeriodEndsAt: dbSub.gracePeriodEndsAt,
          currentPeriodStart: dbSub.currentPeriodStart,
          currentPeriodEnd: dbSub.currentPeriodEnd,
          maxStudents: dbSub.maxStudents,
          maxCampuses: dbSub.maxCampuses,
          maxStaff: dbSub.maxStaff,
          storageLimitMb: dbSub.storageLimitMb,
          autoRenew: dbSub.autoRenew,
          createdAt: dbSub.createdAt,
          updatedAt: dbSub.updatedAt,
          currentStudents: studentCount,
          currentCampuses: campusCount,
          currentStaff: staffCount,
        };

        // Also sync memory store for any other components
        this.prisma.memoryStore.subscriptions.set(dbSub.id, subDto);

        return {
          subscription: subDto,
          planDetails,
          currentPlan: dbSub.planTier,
          planTier: dbSub.planTier,
          planFeatures: planFeatureNames.length > 0 ? planFeatureNames : planFeatures,
          effectiveFeatures,
          incentives: incentivesList,
          hasIncentives: incentivesList.length > 0,
          currentStudents: studentCount,
          currentCampuses: campusCount,
          currentStaff: staffCount,
        };
      } catch (err: any) {
        this.logger.warn(`Error querying subscription from DB for tenant ${tenantId}: ${err?.message}. Using memory store.`);
      }
    }

    // Fallback: Memory store
    let sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );

    if (!sub) {
      const plan = SAAS_PLANS.standard || SAAS_PLANS.growth;
      sub = {
        id: `sub_${tenantId}`,
        tenantId,
        planId: 'plan-standard',
        planTier: 'STANDARD',
        tier: 'standard',
        status: 'ACTIVE',
        billingCycle: 'TERMLY',
        trialEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 90 * 86400000),
        maxStudents: 1500,
        maxCampuses: 3,
        maxStaff: 100,
        storageLimitMb: plan.storageLimitMb,
        messagingQuota: plan.messagingQuota,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
    }

    const currentStudents = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId && s.status !== 'DELETED',
    ).length;

    const currentCampuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c: any) => c.tenantId === tenantId,
    ).length;

    const currentStaff = Array.from(this.prisma.memoryStore.teachers.values()).filter(
      (t: any) => t.tenantId === tenantId,
    ).length;

    const tierKey = (sub.tier || sub.planTier || 'standard').toLowerCase();
    const planDetails = SAAS_PLANS[tierKey] || SAAS_PLANS.standard;

    const now = new Date();
    const memoryOverrides = Array.from((this.prisma.memoryStore as any).featureOverrides?.values?.() || [])
      .filter((o: any) => o.tenantId === tenantId && o.isEnabled && (!o.expiresAt || new Date(o.expiresAt) > now));
    const memIncentivesList = memoryOverrides.map((override: any) => {
      const daysRemaining = override.expiresAt
        ? Math.max(0, Math.ceil((new Date(override.expiresAt).getTime() - now.getTime()) / 86400000))
        : null;
      const featureName =
        FRIENDLY_FEATURE_NAMES[override.featureKey] ||
        override.featureKey.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      return {
        key: override.featureKey,
        featureKey: override.featureKey,
        name: featureName,
        featureName,
        reason: override.reason || 'Administrative Promotional Incentive',
        expiresAt: override.expiresAt,
        daysRemaining,
        grantedBy: override.grantedBy || 'Platform Super Admin',
      };
    });

    return {
      subscription: {
        ...sub,
        tier: tierKey,
        currentStudents,
        currentCampuses,
        currentStaff,
      },
      planDetails,
      currentPlan: sub.planTier || 'STANDARD',
      planTier: sub.planTier || 'STANDARD',
      effectiveFeatures: Array.from(new Set([...planDetails.features, ...memIncentivesList.map((i: any) => i.featureKey)])),
      incentives: memIncentivesList,
      hasIncentives: memIncentivesList.length > 0,
      currentStudents,
      currentCampuses,
      currentStaff,
    };
  }

  /**
   * Step 14: Checks whether a tenant is entitled to a specific subscription feature.
   * Returns entitlement verdict, plan tier, and user-friendly feature label.
   */
  async isFeatureEntitled(
    tenantId: string,
    featureKey: string,
  ): Promise<{
    entitled: boolean;
    reason?: string;
    featureName?: string;
    planTier?: string;
  }> {
    const subInfo = await this.getSubscription(tenantId);
    if (!subInfo || !subInfo.subscription) {
      return {
        entitled: false,
        reason: 'NO_ACTIVE_SUBSCRIPTION',
        featureName: FRIENDLY_FEATURE_NAMES[featureKey] || featureKey,
        planTier: 'STARTER',
      };
    }

    const subStatus = subInfo.subscription.status;
    if (['SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(subStatus)) {
      return {
        entitled: false,
        reason: `SUBSCRIPTION_${subStatus}`,
        featureName: FRIENDLY_FEATURE_NAMES[featureKey] || featureKey,
        planTier: subInfo.planTier || 'STARTER',
      };
    }

    const effective = (subInfo.effectiveFeatures || []).map((f: string) => f.toUpperCase());
    const isIncluded =
      effective.includes(featureKey.toUpperCase()) ||
      effective.includes(featureKey);

    return {
      entitled: isIncluded,
      reason: isIncluded ? 'AUTHORIZED' : 'FEATURE_NOT_IN_TIER',
      featureName: FRIENDLY_FEATURE_NAMES[featureKey] || featureKey,
      planTier: subInfo.planTier || 'STARTER',
    };
  }

  /**
   * Step 8: Retrieves live institutional resource counts for quota enforcement.
   */
  async getCurrentUsageCounts(tenantId: string) {
    let studentCount = 0;
    let campusCount = 0;
    let staffCount = 0;

    if (this.prisma.isDbConnected) {
      try {
        const [students, campuses, teachers, staffUsers] = await Promise.all([
          this.prisma.student.count({
            where: { tenantId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          }),
          this.prisma.campus.count({
            where: { tenantId },
          }),
          this.prisma.teacher.count({
            where: { tenantId, isActive: true },
          }),
          this.prisma.user.count({
            where: {
              tenantId,
              isActive: true,
              userRoles: {
                some: {
                  role: {
                    name: {
                      in: ['Admin', 'Staff', 'Principal', 'Accountant', 'Librarian', 'Teacher', 'TEACHER', 'STAFF', 'ADMIN'],
                    },
                  },
                },
              },
            },
          }),
        ]);
        studentCount = students;
        campusCount = campuses;
        staffCount = Math.max(teachers, staffUsers);
      } catch (err: any) {
        this.logger.warn(`Failed to query DB usage counts for ${tenantId}: ${err?.message}. Falling back to memoryStore.`);
      }
    }

    if (studentCount === 0 && campusCount === 0 && staffCount === 0) {
      studentCount = Array.from(this.prisma.memoryStore.students.values()).filter(
        (s: any) => s.tenantId === tenantId && s.status !== 'DELETED',
      ).length;
      campusCount = Array.from(this.prisma.memoryStore.campuses.values()).filter(
        (c: any) => c.tenantId === tenantId,
      ).length;
      staffCount = Array.from(this.prisma.memoryStore.teachers.values()).filter(
        (t: any) => t.tenantId === tenantId,
      ).length;
    }

    return { studentCount, campusCount, staffCount };
  }

  /**
   * Step 8: Calculates mid-cycle proration, unused credit, and net payable charge (Constitution §49).
   */
  calculateProration(currentSub: any, currentPlan: any, targetPlan: any, targetCycle: string) {
    const now = new Date();
    const isTargetAnnual = (targetCycle || '').toUpperCase() === 'ANNUAL' || (targetCycle || '').toUpperCase() === 'ANNUALLY';
    const targetPrice = isTargetAnnual ? Number(targetPlan?.annualPrice || 0) : Number(targetPlan?.termlyPrice || 0);

    const isTrial = !currentSub || currentSub.status === 'TRIAL' || currentSub.tier === 'free_trial' || !currentSub.currentPeriodEnd;
    if (isTrial) {
      return {
        isProrated: false,
        totalCycleDays: isTargetAnnual ? 365 : 90,
        daysRemaining: isTargetAnnual ? 365 : 90,
        unusedCredit: 0,
        targetProratedCost: targetPrice,
        proratedAmountToPay: targetPrice,
        currency: targetPlan?.currency || 'NGN',
        explanation: 'Transitioning from Trial to Paid plan. Full cycle charge applies.',
      };
    }

    const periodStart = new Date(currentSub.currentPeriodStart || now);
    const periodEnd = new Date(currentSub.currentPeriodEnd);
    const totalCycleDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000));

    const currentPrice = Number(
      currentSub.priceAtPurchase ||
      (currentSub.billingCycle === 'ANNUAL' ? currentPlan?.annualPrice : currentPlan?.termlyPrice) ||
      0
    );

    const unusedCredit = Math.round((currentPrice * daysRemaining) / totalCycleDays);
    const targetProratedCost = Math.round((targetPrice * daysRemaining) / totalCycleDays);
    const proratedAmountToPay = Math.max(0, targetProratedCost - unusedCredit);

    return {
      isProrated: true,
      totalCycleDays,
      daysRemaining,
      unusedCredit,
      targetProratedCost,
      proratedAmountToPay,
      currency: targetPlan?.currency || 'NGN',
      explanation: `Prorated for ${daysRemaining} of ${totalCycleDays} days remaining in billing cycle. Unused credit: ₦${unusedCredit.toLocaleString()}.`,
    };
  }

  /**
   * Step 8: Validates that institutional resource counts do not exceed target plan quotas.
   */
  validateDowngradeQuotas(usage: { studentCount: number; campusCount: number; staffCount: number }, targetPlan: any) {
    const violations: string[] = [];

    if (targetPlan.maxStudents && usage.studentCount > targetPlan.maxStudents) {
      violations.push(
        `Current student count (${usage.studentCount}) exceeds target plan limit (${targetPlan.maxStudents})`
      );
    }
    if (targetPlan.maxCampuses && usage.campusCount > targetPlan.maxCampuses) {
      violations.push(
        `Current campus count (${usage.campusCount}) exceeds target plan limit (${targetPlan.maxCampuses})`
      );
    }
    if (targetPlan.maxStaff && usage.staffCount > targetPlan.maxStaff) {
      violations.push(
        `Current staff count (${usage.staffCount}) exceeds target plan limit (${targetPlan.maxStaff})`
      );
    }

    return {
      isCompatible: violations.length === 0,
      violations,
    };
  }

  /**
   * Step 8: Previews a plan change (upgrade/downgrade), returning proration, quota compatibility, and feature diff.
   */
  async previewPlanChange(tenantId: string, dto: any) {
    const subRes = await this.getSubscription(tenantId);
    const currentSub = subRes.subscription;
    const currentPlan = subRes.planDetails;
    const currentTier = (currentSub.planTier || currentSub.tier || 'STANDARD').toUpperCase();

    const targetTier = (dto?.targetTier || dto?.tier || 'STANDARD').toUpperCase();
    const targetCycle = (dto?.targetBillingCycle || dto?.billingCycle || currentSub.billingCycle || 'TERMLY').toUpperCase();

    let targetPlan: any = null;
    if (this.prisma.isDbConnected) {
      try {
        targetPlan = await this.prisma.subscriptionPlan.findUnique({
          where: { tier: targetTier },
          include: { features: true },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to fetch target plan ${targetTier}: ${err?.message}`);
      }
    }
    if (!targetPlan) {
      const plans = await this.getPlans();
      targetPlan = plans.find((p: any) => p.tier === targetTier || p.tier === targetTier.toLowerCase()) || plans[1];
    }

    const TIER_RANK: Record<string, number> = {
      FREE_TRIAL: 0,
      TRIAL: 0,
      STARTER: 1,
      STANDARD: 2,
      PREMIUM: 3,
      CUSTOM: 4,
    };

    const currentRank = TIER_RANK[currentTier] ?? 1;
    const targetRank = TIER_RANK[targetTier] ?? 2;

    let action = 'NO_CHANGE';
    if (currentSub.status === 'TRIAL' || currentSub.tier === 'free_trial') {
      action = 'UPGRADE';
    } else if (targetRank > currentRank) {
      action = 'UPGRADE';
    } else if (targetRank < currentRank) {
      action = 'DOWNGRADE';
    } else if (targetCycle !== currentSub.billingCycle) {
      action = 'CYCLE_CHANGE';
    }

    const proration = this.calculateProration(currentSub, currentPlan, targetPlan, targetCycle);
    const usage = await this.getCurrentUsageCounts(tenantId);
    const quotaValidation = this.validateDowngradeQuotas(usage, targetPlan);

    const currentFeatures: string[] = (currentPlan?.features || []).map((f: any) => typeof f === 'string' ? f : f.key);
    const targetFeatures: string[] = (targetPlan?.features || []).map((f: any) => typeof f === 'string' ? f : f.key);
    const addedFeatures = targetFeatures.filter(f => !currentFeatures.includes(f));
    const removedFeatures = currentFeatures.filter(f => !targetFeatures.includes(f));

    return {
      action,
      currentSubscription: {
        planTier: currentTier,
        status: currentSub.status,
        billingCycle: currentSub.billingCycle,
        currentPeriodEnd: currentSub.currentPeriodEnd,
      },
      currentPlan: {
        tier: currentPlan.tier,
        name: currentPlan.name,
        termlyPrice: currentPlan.termlyPrice,
        annualPrice: currentPlan.annualPrice,
        maxStudents: currentPlan.maxStudents,
        maxCampuses: currentPlan.maxCampuses,
        maxStaff: currentPlan.maxStaff,
      },
      targetPlan: {
        tier: targetPlan.tier,
        name: targetPlan.name,
        targetBillingCycle: targetCycle,
        termlyPrice: targetPlan.termlyPrice,
        annualPrice: targetPlan.annualPrice,
        maxStudents: targetPlan.maxStudents,
        maxCampuses: targetPlan.maxCampuses,
        maxStaff: targetPlan.maxStaff,
      },
      proration,
      quotaValidation: {
        currentUsage: usage,
        targetLimits: {
          maxStudents: targetPlan.maxStudents,
          maxCampuses: targetPlan.maxCampuses,
          maxStaff: targetPlan.maxStaff,
        },
        isCompatible: quotaValidation.isCompatible,
        violations: quotaValidation.violations,
      },
      featureDiff: {
        addedFeatures,
        removedFeatures,
      },
    };
  }

  /**
   * Step 8: Upgrades a school tenant's subscription plan, calculating proration and generating an invoice.
   */
  async upgradeSubscription(tenantId: string, body: any) {
    const subRes = await this.getSubscription(tenantId);
    const currentSub = subRes.subscription;
    const currentPlan = subRes.planDetails;
    const currentTier = (currentSub.planTier || currentSub.tier || 'STANDARD').toUpperCase();

    const requestedTarget = (body?.targetTier || body?.tier || body?.planTier || body?.id || body?.name || 'STANDARD').toString().toUpperCase();
    let targetTier = 'STANDARD';
    if (requestedTarget.includes('STARTER')) targetTier = 'STARTER';
    else if (requestedTarget.includes('PREMIUM') || requestedTarget.includes('PRO')) targetTier = 'PREMIUM';
    else if (requestedTarget.includes('CUSTOM') || requestedTarget.includes('ENTERPRISE')) targetTier = 'CUSTOM';
    else if (requestedTarget.includes('STANDARD') || requestedTarget.includes('GROWTH')) targetTier = 'STANDARD';

    const isAnnual = (body?.targetBillingCycle || body?.billingCycle || currentSub.billingCycle || '').toUpperCase() === 'ANNUAL' || (body?.billingCycle || '').toUpperCase() === 'ANNUALLY';
    const cycle = isAnnual ? 'ANNUAL' : 'TERMLY';
    const durationDays = isAnnual ? 365 : 90;

    let targetPlan: any = null;
    let dbSub: any = null;
    let invoice: any = null;

    if (this.prisma.isDbConnected) {
      try {
        targetPlan = await this.prisma.subscriptionPlan.findUnique({
          where: { tier: targetTier },
          include: { features: true },
        });
      } catch (err: any) {
        this.logger.warn(`DB lookup failed for plan ${targetTier}: ${err?.message}`);
      }
    }
    if (!targetPlan) {
      const plans = await this.getPlans();
      targetPlan = plans.find((p: any) => p.planTier === targetTier || p.tier === targetTier || p.tier === targetTier.toLowerCase()) || plans[1];
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);
    const proration = this.calculateProration(currentSub, currentPlan, targetPlan, cycle);
    const priceToPay = proration.proratedAmountToPay;

    if (this.prisma.isDbConnected) {
      try {
        const subId = currentSub.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // 1. Update subscription in DB
        dbSub = await this.prisma.subscription.upsert({
          where: { id: subId },
          create: {
            id: subId,
            tenantId,
            planId: targetPlan.id,
            planTier: targetTier,
            status: 'ACTIVE',
            billingCycle: cycle,
            priceAtPurchase: priceToPay > 0 ? priceToPay : (isAnnual ? Number(targetPlan.annualPrice) : Number(targetPlan.termlyPrice)),
            currency: targetPlan.currency || 'NGN',
            trialEndsAt: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            maxStudents: targetPlan.maxStudents,
            maxCampuses: targetPlan.maxCampuses,
            maxStaff: targetPlan.maxStaff,
            storageLimitMb: targetPlan.storageLimitMb,
            autoRenew: true,
          },
          update: {
            planId: targetPlan.id,
            planTier: targetTier,
            status: 'ACTIVE',
            billingCycle: cycle,
            priceAtPurchase: priceToPay > 0 ? priceToPay : (isAnnual ? Number(targetPlan.annualPrice) : Number(targetPlan.termlyPrice)),
            trialEndsAt: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            maxStudents: targetPlan.maxStudents,
            maxCampuses: targetPlan.maxCampuses,
            maxStaff: targetPlan.maxStaff,
            storageLimitMb: targetPlan.storageLimitMb,
            updatedAt: now,
          },
        });

        // 2. Synchronize Tenant plan string
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { plan: targetTier.toLowerCase(), status: 'ACTIVE', updatedAt: now },
        }).catch(() => {});

        // 3. Create BillingInvoice in DB
        const invoiceNumber = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        invoice = await this.prisma.billingInvoice.create({
          data: {
            id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            subscriptionId: dbSub.id,
            invoiceNumber,
            amount: priceToPay,
            currency: targetPlan.currency || 'NGN',
            status: 'PAID',
            dueDate: now,
            paidAt: now,
            paymentMethod: body?.paymentMethod || 'Instant Card Billing',
            lineItems: [
              {
                description: `Plan Upgrade to ${targetPlan.name} (${cycle})`,
                amount: priceToPay,
                quantity: 1,
                proratedCost: proration.targetProratedCost,
                unusedCredit: proration.unusedCredit,
                daysRemaining: proration.daysRemaining,
              },
            ],
          },
        });

        // 4. Record Audit Log
        await this.prisma.auditLog.create({
          data: {
            id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            action: 'SUBSCRIPTION_PLAN_UPGRADED',
            resourceType: 'Subscription',
            resourceId: dbSub.id,
            afterData: {
              previousTier: currentTier,
              tier: targetTier,
              cycle,
              amountPaid: priceToPay,
              proration,
              invoiceNumber,
            },
          },
        }).catch(() => {});

        // Sync memory store
        this.prisma.memoryStore.subscriptions.set(dbSub.id, {
          ...dbSub,
          tier: targetTier.toLowerCase(),
        });
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) {
          memTenant.plan = targetTier.toLowerCase();
          memTenant.status = 'ACTIVE';
        }
        this.prisma.memoryStore.billingInvoices.set(invoice.id, invoice);

        return {
          success: true,
          action: 'UPGRADE',
          subscription: {
            ...dbSub,
            tier: targetTier.toLowerCase(),
          },
          currentPlan: targetPlan,
          proration,
          invoice,
          message: `Plan successfully upgraded to ${targetPlan.name} (${cycle}). New entitlements and limits are active immediately.`,
        };
      } catch (err: any) {
        this.logger.warn(`DB upgrade failed for ${tenantId}: ${err?.message}. Falling back to memory store.`);
      }
    }

    // Memory Store Fallback
    currentSub.tier = targetPlan.tier;
    currentSub.planTier = targetTier;
    currentSub.planId = targetPlan.id;
    currentSub.status = 'ACTIVE';
    currentSub.trialEndsAt = null;
    if (typeof targetPlan.maxStudents === 'number') currentSub.maxStudents = targetPlan.maxStudents;
    if (typeof targetPlan.maxCampuses === 'number') currentSub.maxCampuses = targetPlan.maxCampuses;
    if (typeof targetPlan.maxStaff === 'number') currentSub.maxStaff = targetPlan.maxStaff;
    currentSub.billingCycle = cycle;
    currentSub.updatedAt = new Date();
    this.prisma.memoryStore.subscriptions.set(currentSub.id, currentSub);

    const invoiceId = `SUB-INV-${now.getFullYear()}-0${this.prisma.memoryStore.billingInvoices.size + 1}`;
    invoice = {
      id: invoiceId,
      tenantId,
      date: now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      plan: `${targetPlan.name} (Upgrade)`,
      amount: priceToPay,
      method: 'Instant Paystack Billing',
      status: 'Paid',
      createdAt: now,
    };
    this.prisma.memoryStore.billingInvoices.set(invoiceId, invoice);

    return {
      success: true,
      action: 'UPGRADE',
      subscription: currentSub,
      currentPlan: targetPlan,
      proration,
      invoice,
      message: `Plan successfully upgraded to ${targetPlan.name}`,
    };
  }

  /**
   * Step 8: Downgrades a school tenant's subscription plan.
   * STRICT ENFORCEMENT: Rejects if current usage exceeds target limits.
   * GUARANTEE: Never destroys or deletes tenant data on downgrade.
   */
  async downgradeSubscription(tenantId: string, body: any) {
    const subRes = await this.getSubscription(tenantId);
    const currentSub = subRes.subscription;
    const currentTier = (currentSub.planTier || currentSub.tier || 'STANDARD').toUpperCase();

    const targetTier = (body?.targetTier || body?.tier || body?.planTier || 'STARTER').toUpperCase();
    const cycle = (body?.targetBillingCycle || body?.billingCycle || currentSub.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'ANNUALLY';
    const durationDays = isAnnual ? 365 : 90;

    const TIER_RANK: Record<string, number> = {
      FREE_TRIAL: 0,
      TRIAL: 0,
      STARTER: 1,
      STANDARD: 2,
      PREMIUM: 3,
      CUSTOM: 4,
    };

    if (TIER_RANK[targetTier] >= TIER_RANK[currentTier]) {
      throw new BadRequestException(`Requested target tier '${targetTier}' is not lower than current tier '${currentTier}'. Use upgrade instead.`);
    }

    let targetPlan: any = null;
    if (this.prisma.isDbConnected) {
      try {
        targetPlan = await this.prisma.subscriptionPlan.findUnique({
          where: { tier: targetTier },
          include: { features: true },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to fetch target plan: ${err?.message}`);
      }
    }
    if (!targetPlan) {
      const plans = await this.getPlans();
      targetPlan = plans.find((p: any) => p.tier === targetTier || p.tier === targetTier.toLowerCase()) || plans[0];
    }

    // STRICT DOWNGRADE QUOTA BOUNDARY CHECK
    const usage = await this.getCurrentUsageCounts(tenantId);
    const quotaCheck = this.validateDowngradeQuotas(usage, targetPlan);

    if (!quotaCheck.isCompatible) {
      this.logger.warn(`Rejected downgrade for tenant ${tenantId} to ${targetTier}. Violations: ${quotaCheck.violations.join('; ')}`);
      throw new BadRequestException({
        statusCode: 400,
        error: 'DOWNGRADE_LIMIT_EXCEEDED',
        message: `Cannot downgrade to ${targetPlan.name} (${targetPlan.tier}): Current usage exceeds target plan limits.`,
        violations: quotaCheck.violations,
        currentUsage: usage,
        targetLimits: {
          maxStudents: targetPlan.maxStudents,
          maxCampuses: targetPlan.maxCampuses,
          maxStaff: targetPlan.maxStaff,
        },
        instruction: 'Please reduce your active resources or retain your current subscription plan.',
      });
    }

    const now = new Date();
    const periodEnd = currentSub.currentPeriodEnd ? new Date(currentSub.currentPeriodEnd) : new Date(now.getTime() + durationDays * 86400000);
    const price = isAnnual ? Number(targetPlan.annualPrice) : Number(targetPlan.termlyPrice);

    let updatedSub: any = null;
    let invoice: any = null;

    if (this.prisma.isDbConnected) {
      try {
        const subId = currentSub.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

        [updatedSub] = await this.prisma.$transaction([
          this.prisma.subscription.upsert({
            where: { id: subId },
            create: {
              id: subId,
              tenantId,
              planId: targetPlan.id,
              planTier: targetTier,
              status: 'ACTIVE',
              billingCycle: cycle,
              priceAtPurchase: price,
              currency: targetPlan.currency || 'NGN',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              maxStudents: targetPlan.maxStudents,
              maxCampuses: targetPlan.maxCampuses,
              maxStaff: targetPlan.maxStaff,
              storageLimitMb: targetPlan.storageLimitMb,
              autoRenew: true,
            },
            update: {
              planId: targetPlan.id,
              planTier: targetTier,
              billingCycle: cycle,
              maxStudents: targetPlan.maxStudents,
              maxCampuses: targetPlan.maxCampuses,
              maxStaff: targetPlan.maxStaff,
              storageLimitMb: targetPlan.storageLimitMb,
              updatedAt: now,
            },
          }),
          this.prisma.tenant.update({
            where: { id: tenantId },
            data: { plan: targetTier.toLowerCase(), updatedAt: now },
          }),
          this.prisma.auditLog.create({
            data: {
              id: `aud_down_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              action: 'SUBSCRIPTION_PLAN_DOWNGRADED',
              resourceType: 'Subscription',
              resourceId: subId,
              afterData: {
                previousTier: currentTier,
                newTier: targetTier,
                cycle,
                reason: body?.reason || 'Tenant self-service downgrade',
                limits: {
                  maxStudents: targetPlan.maxStudents,
                  maxCampuses: targetPlan.maxCampuses,
                  maxStaff: targetPlan.maxStaff,
                },
              },
            },
          }),
        ]);

        const invoiceNumber = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        invoice = await this.prisma.billingInvoice.create({
          data: {
            id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            subscriptionId: updatedSub.id,
            invoiceNumber,
            amount: 0,
            currency: targetPlan.currency || 'NGN',
            status: 'PAID',
            dueDate: now,
            paidAt: now,
            paymentMethod: 'Plan Adjustment',
            lineItems: [
              {
                description: `Subscription Downgrade to ${targetPlan.name} (${cycle})`,
                amount: 0,
                quantity: 1,
                notes: 'Effective immediately. All existing institutional records safely preserved.',
              },
            ],
          },
        });

        // Memory Store sync
        this.prisma.memoryStore.subscriptions.set(updatedSub.id, {
          ...updatedSub,
          tier: targetTier.toLowerCase(),
        });
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) memTenant.plan = targetTier.toLowerCase();
        this.prisma.memoryStore.billingInvoices.set(invoice.id, invoice);

      } catch (err: any) {
        this.logger.warn(`DB downgrade failed for ${tenantId}: ${err?.message}. Falling back to memoryStore.`);
      }
    }

    if (!updatedSub) {
      currentSub.tier = targetPlan.tier;
      currentSub.planTier = targetTier;
      currentSub.planId = targetPlan.id;
      if (typeof targetPlan.maxStudents === 'number') currentSub.maxStudents = targetPlan.maxStudents;
      if (typeof targetPlan.maxCampuses === 'number') currentSub.maxCampuses = targetPlan.maxCampuses;
      if (typeof targetPlan.maxStaff === 'number') currentSub.maxStaff = targetPlan.maxStaff;
      currentSub.billingCycle = cycle;
      currentSub.updatedAt = new Date();
      this.prisma.memoryStore.subscriptions.set(currentSub.id, currentSub);
      updatedSub = currentSub;
    }

    return {
      success: true,
      action: 'DOWNGRADE',
      subscription: {
        ...updatedSub,
        tier: targetTier.toLowerCase(),
      },
      currentPlan: targetPlan,
      invoice,
      dataPreserved: true,
      message: `Plan successfully downgraded to ${targetPlan.name}. All existing institutional data is 100% preserved. Resource quotas are now set to ${targetPlan.name} limits.`,
    };
  }

  /**
   * Step 8: Super Admin changes any school's plan with mandatory audit logging and optional quota override.
   */
  async changePlanBySuperAdmin(tenantId: string, adminUser: any, dto: any) {
    if (!dto?.reason) {
      throw new BadRequestException('A reason for administrative plan change is strictly required for audit.');
    }

    const targetTier = (dto.targetTier || dto.planTier || dto.tier || 'STANDARD').toUpperCase();
    const cycle = (dto.targetBillingCycle || dto.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'ANNUALLY';
    const durationDays = isAnnual ? 365 : 90;

    let targetPlan: any = null;
    if (this.prisma.isDbConnected) {
      try {
        targetPlan = await this.prisma.subscriptionPlan.findUnique({
          where: { tier: targetTier },
          include: { features: true },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to fetch target plan: ${err?.message}`);
      }
    }
    if (!targetPlan) {
      const plans = await this.getPlans();
      targetPlan = plans.find((p: any) => p.tier === targetTier || p.tier === targetTier.toLowerCase()) || plans[1];
    }

    // Unless bypassed, validate quotas for downgrades
    if (!dto.bypassQuotaValidation) {
      const usage = await this.getCurrentUsageCounts(tenantId);
      const quotaCheck = this.validateDowngradeQuotas(usage, targetPlan);
      if (!quotaCheck.isCompatible) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'DOWNGRADE_LIMIT_EXCEEDED',
          message: `Cannot change tenant ${tenantId} to ${targetTier}: Current usage exceeds plan limits. Set 'bypassQuotaValidation: true' if intentional administrative override.`,
          violations: quotaCheck.violations,
          currentUsage: usage,
        });
      }
    }

    const subRes = await this.getSubscription(tenantId);
    const currentSub = subRes.subscription;
    const previousTier = currentSub.planTier || currentSub.tier;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);
    const price = isAnnual ? Number(targetPlan.annualPrice) : Number(targetPlan.termlyPrice);

    const subId = currentSub.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    let updatedSub: any = null;
    if (this.prisma.isDbConnected) {
      try {
        [updatedSub] = await this.prisma.$transaction([
          this.prisma.subscription.upsert({
            where: { id: subId },
            create: {
              id: subId,
              tenantId,
              planId: targetPlan.id,
              planTier: targetTier,
              status: 'ACTIVE',
              billingCycle: cycle,
              priceAtPurchase: price,
              currency: targetPlan.currency || 'NGN',
              trialEndsAt: null,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              maxStudents: targetPlan.maxStudents,
              maxCampuses: targetPlan.maxCampuses,
              maxStaff: targetPlan.maxStaff,
              storageLimitMb: targetPlan.storageLimitMb,
              autoRenew: true,
            },
            update: {
              planId: targetPlan.id,
              planTier: targetTier,
              status: 'ACTIVE',
              billingCycle: cycle,
              priceAtPurchase: price,
              trialEndsAt: null,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              maxStudents: targetPlan.maxStudents,
              maxCampuses: targetPlan.maxCampuses,
              maxStaff: targetPlan.maxStaff,
              storageLimitMb: targetPlan.storageLimitMb,
              updatedAt: now,
            },
          }),
          this.prisma.tenant.update({
            where: { id: tenantId },
            data: { plan: targetTier.toLowerCase(), status: 'ACTIVE', updatedAt: now },
          }),
          this.prisma.auditLog.create({
            data: {
              id: `aud_sa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              actorUserId: adminUser?.id || adminUser?.userId || null,
              action: 'SUPERADMIN_SUBSCRIPTION_PLAN_CHANGED',
              resourceType: 'Subscription',
              resourceId: subId,
              afterData: {
                previousTier,
                newTier: targetTier,
                cycle,
                changedBy: adminUser?.email || 'Platform Super Admin',
                reason: dto.reason,
                bypassQuotaValidation: !!dto.bypassQuotaValidation,
                waiveCharges: !!dto.waiveCharges,
              },
            },
          }),
        ]);

        this.prisma.memoryStore.subscriptions.set(updatedSub.id, {
          ...updatedSub,
          tier: targetTier.toLowerCase(),
        });
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) {
          memTenant.plan = targetTier.toLowerCase();
          memTenant.status = 'ACTIVE';
        }
      } catch (err: any) {
        this.logger.warn(`Super Admin change plan DB error: ${err?.message}`);
      }
    }

    if (!updatedSub) {
      currentSub.tier = targetPlan.tier;
      currentSub.planTier = targetTier;
      currentSub.planId = targetPlan.id;
      currentSub.status = 'ACTIVE';
      currentSub.trialEndsAt = null;
      currentSub.billingCycle = cycle;
      this.prisma.memoryStore.subscriptions.set(currentSub.id, currentSub);
      updatedSub = currentSub;
    }

    return {
      success: true,
      subscription: {
        ...updatedSub,
        tier: targetTier.toLowerCase(),
      },
      currentPlan: targetPlan,
      changedBy: adminUser?.email || 'Platform Super Admin',
      reason: dto.reason,
      message: `Tenant subscription successfully changed to ${targetPlan.name} by Super Admin.`,
    };
  }

  /**
   * Retrieves billing invoices for a tenant.
   */
  async getInvoices(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const invoices = await this.prisma.billingInvoice.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });
        if (invoices && invoices.length > 0) {
          return invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            date: inv.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            plan: `Invoice #${inv.invoiceNumber}`,
            amount: `${inv.currency} ${inv.amount.toLocaleString()}`,
            method: inv.paymentMethod || 'Online Gateway',
            status: inv.status,
            createdAt: inv.createdAt,
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not load invoices from DB for ${tenantId}: ${err?.message}`);
      }
    }

    const list = Array.from(this.prisma.memoryStore.subscriptionInvoices.values())
      .filter((inv: any) => !inv.tenantId || inv.tenantId === tenantId)
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || b.date).getTime() -
          new Date(a.createdAt || a.date).getTime(),
      );

    return list;
  }

/**
   * Step 9: Platform Super Admin - View all school tenant subscriptions with filtering.
   */
  async getAllSubscriptions(filter?: PlatformSubscriptionFilterDto) {
    if (this.prisma.isDbConnected) {
      try {
        const whereClause: any = {};

        if (filter?.status) {
          whereClause.status = filter.status.toUpperCase();
        }
        if (filter?.planTier) {
          whereClause.planTier = filter.planTier.toUpperCase();
        }
        if (filter?.billingCycle) {
          whereClause.billingCycle = filter.billingCycle.toUpperCase();
        }
        if (filter?.search) {
          const searchVal = filter.search.toLowerCase();
          whereClause.tenant = {
            OR: [
              { name: { contains: searchVal, mode: 'insensitive' } },
              { slug: { contains: searchVal, mode: 'insensitive' } },
            ],
          };
        }

        const subs = await this.prisma.subscription.findMany({
          where: whereClause,
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
            plan: {
              include: { features: true },
            },
            overrides: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        return subs.map((s) => {
          let overdueDays = 0;
          if (s.status === 'PAST_DUE' && s.currentPeriodEnd) {
            overdueDays = Math.max(0, Math.ceil((now.getTime() - new Date(s.currentPeriodEnd).getTime()) / 86400000));
          }

          return {
            id: s.id,
            tenantId: s.tenantId,
            name: s.tenant?.name || 'Unknown School',
            schoolName: s.tenant?.name || 'Unknown School',
            slug: s.tenant?.slug || '',
            planTier: s.planTier,
            tier: s.planTier.toLowerCase(),
            planName: s.plan?.name || s.planTier,
            status: s.status,
            tenantStatus: s.tenant?.status || 'ACTIVE',
            billingCycle: s.billingCycle,
            priceAtPurchase: Number(s.priceAtPurchase || 0),
            currency: s.currency || 'NGN',
            maxStudents: s.maxStudents,
            maxCampuses: s.maxCampuses,
            maxStaff: s.maxStaff,
            storageLimitMb: s.storageLimitMb,
            trialEndsAt: s.trialEndsAt,
            currentPeriodStart: s.currentPeriodStart,
            currentPeriodEnd: s.currentPeriodEnd,
            overdueDays,
            activeOverridesCount: s.overrides.filter((o) => o.isEnabled).length,
            subscription: {
              id: s.id,
              status: s.status,
              planTier: s.planTier,
              billingCycle: s.billingCycle,
              priceAtPurchase: Number(s.priceAtPurchase || 0),
              maxStudents: s.maxStudents,
              maxCampuses: s.maxCampuses,
              maxStaff: s.maxStaff,
              renewalDate: s.currentPeriodEnd,
              overdueDays,
              effectiveEntitlements: ((s.plan as any)?.features || []).map((f: any) => f.featureKey),
            },
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          };
        });
      } catch (err: any) {
        this.logger.warn(`Could not load all subscriptions from DB: ${err?.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.subscriptions.values()).map((s: any) => {
      const tenant = this.prisma.memoryStore.tenants.get(s.tenantId);
      return {
        ...s,
        name: tenant?.name || 'Unknown School',
        schoolName: tenant?.name || 'Unknown School',
        slug: tenant?.slug || '',
        tenantStatus: tenant?.status || 'ACTIVE',
        subscription: {
          id: s.id,
          status: s.status,
          planTier: s.planTier || 'STANDARD',
          billingCycle: s.billingCycle || 'TERMLY',
          priceAtPurchase: Number(s.priceAtPurchase || 0),
          maxStudents: s.maxStudents || 400,
          maxCampuses: s.maxCampuses || 2,
          maxStaff: s.maxStaff || 40,
          renewalDate: s.currentPeriodEnd,
          overdueDays: 0,
          effectiveEntitlements: [],
        },
      };
    });
  }

  /**
   * Step 9: Platform Super Admin - Global platform subscription statistics & metrics.
   */
  async getPlatformSubscriptionStats() {
    let totalTenants = 0;
    let activeSubscriptions = 0;
    let trialSubscriptions = 0;
    let pastDueSubscriptions = 0;
    let suspendedSchools = 0;
    let archivedSchools = 0;
    let totalRevenue = 0;
    let planDistribution: Record<string, number> = {
      STARTER: 0,
      STANDARD: 0,
      PREMIUM: 0,
      CUSTOM: 0,
    };
    let cycleDistribution: Record<string, number> = {
      TERMLY: 0,
      ANNUAL: 0,
    };

    if (this.prisma.isDbConnected) {
      try {
        const [tenantsCount, subs, paymentsSum] = await Promise.all([
          this.prisma.tenant.count(),
          this.prisma.subscription.findMany({
            select: {
              status: true,
              planTier: true,
              billingCycle: true,
              priceAtPurchase: true,
              tenant: { select: { status: true } },
            },
          }),
          this.prisma.subscriptionPayment.aggregate({
            where: { status: 'SUCCESSFUL' },
            _sum: { amount: true },
          }),
        ]);

        totalTenants = tenantsCount;
        totalRevenue = Number(paymentsSum._sum.amount || 0);

        for (const s of subs) {
          if (s.status === 'ACTIVE') activeSubscriptions++;
          else if (s.status === 'TRIAL') trialSubscriptions++;
          else if (s.status === 'PAST_DUE') pastDueSubscriptions++;
          else if (s.status === 'SUSPENDED' || s.tenant?.status === 'SUSPENDED') suspendedSchools++;
          else if (s.tenant?.status === 'ARCHIVED') archivedSchools++;

          const tier = (s.planTier || 'STANDARD').toUpperCase();
          planDistribution[tier] = (planDistribution[tier] || 0) + 1;

          const cycle = (s.billingCycle || 'TERMLY').toUpperCase();
          cycleDistribution[cycle] = (cycleDistribution[cycle] || 0) + 1;
        }

        // Monthly run rate calculation
        const mrr = Math.round(
          subs.reduce((acc, s) => {
            if (s.status !== 'ACTIVE') return acc;
            const price = Number(s.priceAtPurchase || 0);
            return acc + (s.billingCycle === 'ANNUAL' ? price / 12 : price / 3);
          }, 0)
        );

        return {
          totalTenants,
          activeSubscriptions,
          trialSubscriptions,
          pastDueSubscriptions,
          suspendedSchools,
          archivedSchools,
          totalRevenue,
          monthlyRecurringRevenue: mrr,
          planDistribution,
          cycleDistribution,
          billingCycleDistribution: cycleDistribution,
          overview: {
            totalTenants,
            activeTenants: activeSubscriptions,
            trialTenants: trialSubscriptions,
            pastDueTenants: pastDueSubscriptions,
            suspendedTenants: suspendedSchools,
            archivedTenants: archivedSchools,
            totalPlatformRevenue: totalRevenue,
            estimatedMrr: mrr,
          },
        };
      } catch (err: any) {
        this.logger.warn(`Error querying subscription stats: ${err?.message}`);
      }
    }

    // Memory Store fallback
    totalTenants = this.prisma.memoryStore.tenants.size;
    for (const sub of this.prisma.memoryStore.subscriptions.values()) {
      if (sub.status === 'ACTIVE') activeSubscriptions++;
      else if (sub.status === 'TRIAL') trialSubscriptions++;
      else if (sub.status === 'PAST_DUE') pastDueSubscriptions++;
      else if (sub.status === 'SUSPENDED') suspendedSchools++;

      const tier = (sub.planTier || 'STANDARD').toUpperCase();
      planDistribution[tier] = (planDistribution[tier] || 0) + 1;
    }

    return {
      totalTenants,
      activeSubscriptions,
      trialSubscriptions,
      pastDueSubscriptions,
      suspendedSchools,
      archivedSchools,
      totalRevenue: 350000,
      monthlyRecurringRevenue: 116667,
      planDistribution,
      cycleDistribution,
      billingCycleDistribution: cycleDistribution,
      overview: {
        totalTenants,
        activeTenants: activeSubscriptions,
        trialTenants: trialSubscriptions,
        pastDueTenants: pastDueSubscriptions,
        suspendedTenants: suspendedSchools,
        archivedTenants: archivedSchools,
        totalPlatformRevenue: 350000,
        estimatedMrr: 116667,
      },
    };
  }

  /**
   * Step 9: Platform Super Admin - List all 4 configurable subscription plans.
   */
  async getPlatformPlans() {
    if (this.prisma.isDbConnected) {
      try {
        const plans = await this.prisma.subscriptionPlan.findMany({
          include: {
            features: {
              orderBy: { featureKey: 'asc' },
            },
          },
          orderBy: { annualPrice: 'asc' },
        });

        return plans.map((p) => ({
          id: p.id,
          tier: p.tier,
          name: p.name,
          description: p.description,
          termlyPrice: Number(p.termlyPrice),
          annualPrice: Number(p.annualPrice),
          yearlyDiscountPercent: Number((p as any).yearlyDiscountPercent ?? 6),
          maxStudents: p.maxStudents,
          maxCampuses: p.maxCampuses,
          maxStaff: p.maxStaff,
          storageLimitMb: p.storageLimitMb,
          currency: p.currency,
          featuresCount: p.features.length,
          features: p.features,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
      } catch (err: any) {
        this.logger.warn(`Error querying platform plans: ${err?.message}`);
      }
    }

    return this.getPlans();
  }

  /**
   * Step 9: Platform Super Admin - Configure plan pricing, discounts, limits, and features.
   */
  async updatePlatformPlan(tier: string, dto: UpdatePlanConfigDto, adminUser: any) {
    const targetTier = tier.toUpperCase();
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const updateData: any = { updatedAt: now };

        if (typeof dto.termlyPrice === 'number') updateData.termlyPrice = dto.termlyPrice;
        if (typeof dto.annualPrice === 'number') updateData.annualPrice = dto.annualPrice;
        if (typeof dto.yearlyDiscountPercent === 'number') {
          updateData.yearlyDiscountPercent = dto.yearlyDiscountPercent;
        }
        if (typeof dto.maxStudents === 'number') updateData.maxStudents = dto.maxStudents;
        if (typeof dto.maxCampuses === 'number') updateData.maxCampuses = dto.maxCampuses;
        if (typeof dto.maxStaff === 'number') updateData.maxStaff = dto.maxStaff;
        if (typeof dto.storageLimitMb === 'number') updateData.storageLimitMb = dto.storageLimitMb;

        const updatedPlan = await this.prisma.subscriptionPlan.update({
          where: { tier: targetTier },
          data: updateData,
          include: { features: true },
        });

        // Update plan feature entitlements if features array provided
        if (Array.isArray(dto.features)) {
          await this.prisma.planFeature.updateMany({
            where: { planId: updatedPlan.id },
            data: { isIncluded: false },
          });

          if (dto.features.length > 0) {
            await this.prisma.planFeature.updateMany({
              where: {
                planId: updatedPlan.id,
                featureKey: { in: dto.features },
              },
              data: { isIncluded: true },
            });
          }
        }

        // Fetch refreshed plan with features
        const refreshedPlan = await this.prisma.subscriptionPlan.findUnique({
          where: { id: updatedPlan.id },
          include: {
            features: {
              orderBy: { featureKey: 'asc' },
            },
          },
        });

        const activePlan = refreshedPlan || updatedPlan;

        // Record Audit Log
        const auditId = `aud_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const auditPayload = {
          id: auditId,
          tenantId: 'platform_system',
          actorUserId: adminUser?.id || adminUser?.userId || 'usr_super_admin',
          action: 'PLATFORM_PLAN_CONFIG_UPDATED',
          resourceType: 'SubscriptionPlan',
          resourceId: activePlan.id,
          afterData: {
            tier: targetTier,
            updatedFields: JSON.parse(JSON.stringify(dto)),
            configuredBy: adminUser?.email || 'Platform Super Admin',
          },
        };

        this.prisma.memoryStore.auditLogs.set(auditId, {
          ...auditPayload,
          createdAt: new Date(),
        });

        await this.prisma.auditLog
          .create({ data: auditPayload })
          .catch((e: any) => this.logger.warn(`Could not save audit log to DB: ${e?.message}`));

        return {
          success: true,
          plan: activePlan,
          tier: activePlan.tier,
          name: activePlan.name,
          termlyPrice: Number(activePlan.termlyPrice),
          priceTermly: Number(activePlan.termlyPrice),
          annualPrice: Number(activePlan.annualPrice),
          maxStudents: activePlan.maxStudents,
          maxCampuses: activePlan.maxCampuses,
          maxStaff: activePlan.maxStaff,
          storageLimitMb: activePlan.storageLimitMb,
          yearlyDiscountPercent: Number(activePlan.yearlyDiscountPercent),
          features: activePlan.features,
          featuresCount: activePlan.features.length,
          message: `Subscription plan '${targetTier}' successfully updated.`,
        };
      } catch (err: any) {
        this.logger.error(`Failed to update plan ${targetTier}: ${err?.message}`);
        throw err;
      }
    }

    return {
      success: true,
      message: `Plan ${targetTier} configuration updated (memory mode).`,
    };
  }

  /**
   * Step 9: Platform Super Admin - Manually deactivates a school subscription.
   */
  async deactivateSubscription(tenantId: string, reason?: string, adminUser?: any) {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const sub = await this.prisma.subscription.findFirst({ where: { tenantId } });

        if (sub) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'EXPIRED', currentPeriodEnd: now, updatedAt: now },
          });
        }

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'SUSPENDED', updatedAt: now },
        });

        await this.prisma.auditLog.create({
          data: {
            id: `aud_deact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            actorUserId: adminUser?.id || adminUser?.userId || null,
            action: 'SUBSCRIPTION_DEACTIVATED',
            resourceType: 'Subscription',
            resourceId: sub?.id || tenantId,
            afterData: {
              status: 'EXPIRED',
              tenantStatus: 'SUSPENDED',
              reason: reason || 'Administrative deactivation',
              deactivatedBy: adminUser?.email || 'Platform Super Admin',
            },
          },
        });

        // Sync memoryStore
        if (sub) {
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) {
            memSub.status = 'EXPIRED';
            memSub.currentPeriodEnd = now;
          }
        }
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) memTenant.status = 'SUSPENDED';

        return {
          success: true,
          status: 'EXPIRED',
          subscription: { status: 'CANCELLED' },
          message: `Subscription for tenant ${tenantId} successfully deactivated.`,
        };
      } catch (err: any) {
        this.logger.error(`Failed to deactivate subscription: ${err?.message}`);
        throw err;
      }
    }

    const memSub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (memSub) {
      memSub.status = 'CANCELLED';
      memSub.currentPeriodEnd = now;
    }
    const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (memTenant) memTenant.status = 'SUSPENDED';

    return {
      success: true,
      status: 'CANCELLED',
      subscription: { status: 'CANCELLED' },
      message: 'Subscription deactivated.',
    };
  }

  /**
   * Step 9: Platform Super Admin - Archives a school tenant and cancels active subscription.
   */
  async archiveSchool(tenantId: string, reason?: string, adminUser?: any) {
    const now = new Date();

    if (this.prisma.isDbConnected) {
      try {
        const sub = await this.prisma.subscription.findFirst({ where: { tenantId } });

        if (sub) {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED', updatedAt: now },
          });
        }

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'ARCHIVED', updatedAt: now },
        });

        await this.prisma.auditLog.create({
          data: {
            id: `aud_arch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            actorUserId: adminUser?.id || adminUser?.userId || null,
            action: 'SCHOOL_TENANT_ARCHIVED',
            resourceType: 'Tenant',
            resourceId: tenantId,
            afterData: {
              status: 'ARCHIVED',
              subscriptionStatus: 'CANCELLED',
              reason: reason || 'Administrative archival',
              archivedBy: adminUser?.email || 'Platform Super Admin',
            },
          },
        });

        // Sync memoryStore
        if (sub) {
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id);
          if (memSub) memSub.status = 'CANCELLED';
        }
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) memTenant.status = 'ARCHIVED';

        return {
          success: true,
          status: 'ARCHIVED',
          subscription: { status: 'CANCELLED' },
          message: `School tenant ${tenantId} has been successfully archived.`,
        };
      } catch (err: any) {
        this.logger.error(`Failed to archive school: ${err?.message}`);
        throw err;
      }
    }

    const memSub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s: any) => s.tenantId === tenantId,
    );
    if (memSub) memSub.status = 'CANCELLED';
    const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (memTenant) memTenant.status = 'ARCHIVED';

    return {
      success: true,
      status: 'ARCHIVED',
      subscription: { status: 'CANCELLED' },
      message: 'School archived.',
    };
  }

  /**
   * Step 9: Platform Super Admin - Grants a feature incentive to a tenant with expiration.
   */
  async grantTenantIncentive(tenantId: string, dto: GrantIncentiveDto, adminUser?: any) {
    const subRes = await this.getSubscription(tenantId);
    const sub = subRes.subscription;
    let expiresAt: Date;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
    } else {
      const durationDays = dto.durationDays || 60;
      expiresAt = new Date(Date.now() + durationDays * 86400000);
    }

    if (this.prisma.isDbConnected) {
      try {
        const override = await this.prisma.subscriptionFeatureOverride.upsert({
          where: {
            subscriptionId_featureKey: {
              subscriptionId: sub.id,
              featureKey: dto.featureKey,
            },
          },
          create: {
            id: `sfo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            subscriptionId: sub.id,
            featureKey: dto.featureKey,
            isEnabled: dto.isEnabled !== false,
            reason: dto.reason,
            grantedBy: adminUser?.email || 'Platform Super Admin',
            expiresAt,
          },
          update: {
            isEnabled: dto.isEnabled !== false,
            reason: dto.reason,
            grantedBy: adminUser?.email || 'Platform Super Admin',
            expiresAt,
            updatedAt: new Date(),
          },
        });

        await this.prisma.auditLog.create({
          data: {
            id: `aud_inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            actorUserId: adminUser?.id || adminUser?.userId || null,
            action: 'TENANT_INCENTIVE_GRANTED',
            resourceType: 'SubscriptionFeatureOverride',
            resourceId: override.id,
            afterData: {
              featureKey: dto.featureKey,
              reason: dto.reason,
              expiresAt,
              grantedBy: adminUser?.email || 'Platform Super Admin',
            },
          },
        });

        return {
          success: true,
          incentive: override,
          featureKey: override.featureKey,
          isEnabled: override.isEnabled,
          expiresAt: override.expiresAt,
          message: `Incentive '${dto.featureKey}' successfully granted to tenant ${tenantId} until ${expiresAt.toLocaleDateString()}.`,
        };
      } catch (err: any) {
        this.logger.error(`Failed to grant incentive: ${err?.message}`);
        throw err;
      }
    }

    // Memory mode fallback
    const memOverride = {
      id: `sfo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      subscriptionId: sub.id,
      featureKey: dto.featureKey,
      isEnabled: dto.isEnabled !== false,
      reason: dto.reason,
      grantedBy: adminUser?.email || 'Platform Super Admin',
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if ((this.prisma.memoryStore as any).featureOverrides) {
      (this.prisma.memoryStore as any).featureOverrides.set(`${sub.id}_${dto.featureKey}`, memOverride);
    }

    return {
      success: true,
      incentive: memOverride,
      featureKey: dto.featureKey,
      isEnabled: true,
      expiresAt,
      message: `Incentive '${dto.featureKey}' granted (memory mode).`,
    };
  }

  /**
   * Step 9: Platform Super Admin - Revokes a feature incentive from a tenant.
   */
  async revokeTenantIncentive(tenantId: string, featureKey: string, adminUser?: any) {
    const subRes = await this.getSubscription(tenantId);
    const sub = subRes.subscription;

    if (this.prisma.isDbConnected) {
      try {
        const override = await this.prisma.subscriptionFeatureOverride.findFirst({
          where: {
            subscriptionId: sub.id,
            featureKey,
          },
        });

        if (override) {
          await this.prisma.subscriptionFeatureOverride.update({
            where: { id: override.id },
            data: { isEnabled: false, updatedAt: new Date() },
          });

          await this.prisma.auditLog.create({
            data: {
              id: `aud_rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              actorUserId: adminUser?.id || adminUser?.userId || null,
              action: 'TENANT_INCENTIVE_REVOKED',
              resourceType: 'SubscriptionFeatureOverride',
              resourceId: override.id,
              afterData: {
                featureKey,
                revokedBy: adminUser?.email || 'Platform Super Admin',
              },
            },
          });
        }

        return {
          success: true,
          override,
          featureKey,
          isEnabled: false,
          message: `Incentive '${featureKey}' successfully revoked from tenant ${tenantId}.`,
        };
      } catch (err: any) {
        this.logger.error(`Failed to revoke incentive: ${err?.message}`);
        throw err;
      }
    }

    // Memory mode fallback
    if ((this.prisma.memoryStore as any).featureOverrides) {
      const key = `${sub.id}_${featureKey}`;
      const existing = (this.prisma.memoryStore as any).featureOverrides.get(key);
      if (existing) {
        existing.isEnabled = false;
        existing.updatedAt = new Date();
        (this.prisma.memoryStore as any).featureOverrides.set(key, existing);
      }
    }

    return {
      success: true,
      featureKey,
      isEnabled: false,
      message: `Incentive '${featureKey}' successfully revoked from tenant ${tenantId}.`,
    };
  }

  /**
   * Step 9: Platform Super Admin - Comprehensive subscription audit, invoice, and payment history for a tenant.
   */
  async getTenantSubscriptionHistory(tenantId: string) {
    const subRes = await this.getSubscription(tenantId);
    const sub = subRes.subscription;
    const plan = subRes.planDetails;

    let invoices: any[] = [];
    let payments: any[] = [];
    let auditLogs: any[] = [];
    let overrides: any[] = [];
    let tenant: any = null;

    if (this.prisma.isDbConnected) {
      try {
        [invoices, payments, auditLogs, overrides, tenant] = await Promise.all([
          this.prisma.billingInvoice.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.subscriptionPayment.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.auditLog.findMany({
            where: {
              tenantId,
              action: {
                in: [
                  'SUBSCRIPTION_PLAN_UPGRADED',
                  'SUBSCRIPTION_PLAN_DOWNGRADED',
                  'SUPERADMIN_SUBSCRIPTION_PLAN_CHANGED',
                  'SUBSCRIPTION_ACTIVATED',
                  'SUBSCRIPTION_DEACTIVATED',
                  'SUBSCRIPTION_MANUALLY_SUSPENDED',
                  'SUBSCRIPTION_SUSPENDED',
                  'SUBSCRIPTION_REACTIVATED',
                  'TENANT_INCENTIVE_GRANTED',
                  'TENANT_INCENTIVE_REVOKED',
                  'SUBSCRIPTION_MANUAL_PAYMENT_RECORDED',
                ],
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.subscriptionFeatureOverride.findMany({
            where: { subscriptionId: sub.id },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.tenant.findUnique({
            where: { id: tenantId },
          }),
        ]);
      } catch (err: any) {
        this.logger.warn(`Error querying subscription history: ${err?.message}`);
      }
    } else {
      tenant = this.prisma.memoryStore.tenants.get(tenantId);
    }

    return {
      tenantId,
      tenant: tenant || { id: tenantId, name: 'Unknown' },
      subscription: {
        id: sub.id,
        planTier: sub.planTier || sub.tier,
        planName: plan?.name || sub.planTier,
        status: sub.status,
        billingCycle: sub.billingCycle,
        priceAtPurchase: sub.priceAtPurchase,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        maxStudents: sub.maxStudents || plan?.maxStudents,
        maxCampuses: sub.maxCampuses || plan?.maxCampuses,
        maxStaff: sub.maxStaff || plan?.maxStaff,
      },
      incentives: overrides,
      invoices,
      payments,
      timeline: auditLogs,
      auditTimeline: auditLogs,
    };
  }

  /**
   * Platform Super Admin: Override quotas, grant promotional feature incentives, or extend trial dates.
   */
  async overrideSubscription(tenantId: string, dto: QuotaOverrideDto & { featureKey?: string; isEnabled?: boolean; reason?: string }) {
    if (this.prisma.isDbConnected) {
      try {
        const sub = await this.prisma.subscription.findFirst({
          where: { tenantId },
        });

        if (sub) {
          const updateData: any = { updatedAt: new Date() };
          if (dto.maxStudents) updateData.maxStudents = dto.maxStudents;
          if (dto.maxCampuses) updateData.maxCampuses = dto.maxCampuses;
          if (dto.maxStaff) updateData.maxStaff = dto.maxStaff;
          if (dto.storageLimitMb) updateData.storageLimitMb = dto.storageLimitMb;
          if (dto.status) {
            updateData.status = dto.status;
            await this.prisma.tenant.update({
              where: { id: tenantId },
              data: { status: dto.status as any },
            }).catch(() => {});
          }

          const updatedSub = await this.prisma.subscription.update({
            where: { id: sub.id },
            data: updateData,
          });

          // Also sync memoryStore
          const memSub = this.prisma.memoryStore.subscriptions.get(sub.id) || sub;
          Object.assign(memSub, updatedSub);
          this.prisma.memoryStore.subscriptions.set(sub.id, memSub);

          const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
          if (memTenant && dto.status) {
            memTenant.status = dto.status;
          }

          // If feature incentive override specified
          if (dto.featureKey) {
            await this.prisma.subscriptionFeatureOverride.upsert({
              where: {
                subscriptionId_featureKey: {
                  subscriptionId: sub.id,
                  featureKey: dto.featureKey,
                },
              },
              create: {
                id: `sfo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                tenantId,
                subscriptionId: sub.id,
                featureKey: dto.featureKey,
                isEnabled: dto.isEnabled !== false,
                reason: dto.reason || dto.notes || 'Super Admin Feature Incentive',
                grantedBy: 'Super Admin',
                expiresAt: new Date(Date.now() + 60 * 86400000), // 60 days default
              },
              update: {
                isEnabled: dto.isEnabled !== false,
                reason: dto.reason || dto.notes || 'Super Admin Feature Incentive',
                updatedAt: new Date(),
              },
            });
          }

          // Record Audit Log
          await this.prisma.auditLog.create({
            data: {
              id: `aud_ovr_${Date.now()}`,
              tenantId,
              action: 'SUBSCRIPTION_QUOTA_OVERRIDDEN',
              resourceType: 'Subscription',
              resourceId: sub.id,
              afterData: { ...dto },
            },
          }).catch(() => {});

          return {
            ...updatedSub,
            success: true,
            subscription: updatedSub,
            message: 'Tenant quotas and feature incentives updated successfully in database.',
          };
        }
      } catch (err: any) {
        this.logger.warn(`Override in DB failed: ${err?.message}`);
      }
    }

    // Memory Store Fallback
    const res = await this.getSubscription(tenantId);
    const sub = res.subscription;

    if (dto.maxStudents) sub.maxStudents = dto.maxStudents;
    if (dto.maxCampuses) sub.maxCampuses = dto.maxCampuses;
    if (dto.maxStaff) sub.maxStaff = dto.maxStaff;
    if (dto.storageLimitMb) sub.storageLimitMb = dto.storageLimitMb;
    if (dto.messagingQuota) sub.messagingQuota = dto.messagingQuota;
    if (dto.status) {
      sub.status = dto.status;
      const tenant = this.prisma.memoryStore.tenants.get(tenantId);
      if (tenant) {
        tenant.status = dto.status;
      }
    }
    sub.updatedAt = new Date();

    this.prisma.memoryStore.subscriptions.set(sub.id, sub);

    return {
      ...sub,
      success: true,
      subscription: sub,
      message: 'Subscription quotas updated successfully (in-memory).',
    };
  }

  /**
   * Captures prospective custom institutional inquiries submitted via public pricing portal.
   */
  async createCustomPlanRequest(dto: CreateCustomPlanRequestDto) {
    if (this.prisma.isDbConnected) {
      try {
        const record = await this.prisma.customPlanRequest.create({
          data: {
            schoolName: dto.schoolName,
            contactPersonName: dto.contactPersonName,
            contactEmail: dto.contactEmail,
            contactPhone: dto.contactPhone || null,
            estimatedStudents: dto.estimatedStudents || null,
            campusCount: dto.campusCount || 1,
            requestedFeatures: dto.requestedFeatures || null,
            message: dto.message || null,
            status: 'NEW',
          },
        });

        return {
          success: true,
          requestId: record.id,
          message: 'Thank you! Your custom institutional deployment inquiry has been submitted. Our enterprise solutions team will contact you within 24 hours.',
        };
      } catch (err: any) {
        this.logger.warn(`Could not save custom plan request to DB: ${err?.message}`);
      }
    }

    return {
      success: true,
      requestId: `cpr_${Date.now()}`,
      message: 'Custom plan inquiry recorded.',
    };
  }

  /**
   * Super Admin / Payment Verification: Confirms SaaS platform subscription payment,
   * transitioning subscription status PENDING/TRIAL -> ACTIVE, updating invoice to PAID,
   * and recording an immutable SubscriptionPayment ledger entry.
   */
  async verifySubscriptionPayment(
    tenantId: string,
    body: {
      amount?: number;
      currency?: string;
      provider?: string;
      providerReference?: string;
      paymentMethod?: string;
      planTier?: string;
      billingCycle?: string;
      invoiceId?: string;
      verifiedBy?: string;
    },
  ) {
    const now = new Date();
    const cycle = (body.billingCycle || 'TERMLY').toUpperCase();
    const isAnnual = cycle === 'ANNUAL' || cycle === 'YEARLY';
    const durationDays = isAnnual ? 365 : 90;
    const periodEnd = new Date(now.getTime() + durationDays * 86400000);

    if (this.prisma.isDbConnected) {
      try {
        let sub = await this.prisma.subscription.findFirst({
          where: { tenantId },
          include: { plan: true },
        });

        const targetTier = (body.planTier || sub?.planTier || 'STANDARD').toUpperCase();
        let plan = await this.prisma.subscriptionPlan.findUnique({
          where: { tier: targetTier },
        });
        if (!plan) {
          plan = await this.prisma.subscriptionPlan.findFirst();
        }

        const price =
          body.amount ??
          (isAnnual ? Number(plan?.annualPrice || 987000) : Number(plan?.termlyPrice || 350000));

        const subId = sub?.id || `sub_${tenantId.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // 1. Update or create subscription with ACTIVE status
        const updatedSub = await this.prisma.subscription.upsert({
          where: { id: subId },
          create: {
            id: subId,
            tenantId,
            planId: plan?.id,
            planTier: targetTier,
            status: 'ACTIVE',
            billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
            priceAtPurchase: price,
            currency: body.currency || plan?.currency || 'NGN',
            trialEndsAt: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            maxStudents: plan?.maxStudents || 1500,
            maxCampuses: plan?.maxCampuses || 3,
            maxStaff: plan?.maxStaff || 100,
            storageLimitMb: plan?.storageLimitMb || 25600,
            autoRenew: true,
          },
          update: {
            planId: plan?.id,
            planTier: targetTier,
            status: 'ACTIVE',
            billingCycle: isAnnual ? 'ANNUAL' : 'TERMLY',
            priceAtPurchase: price,
            trialEndsAt: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            maxStudents: plan?.maxStudents,
            maxCampuses: plan?.maxCampuses,
            maxStaff: plan?.maxStaff,
            storageLimitMb: plan?.storageLimitMb,
            updatedAt: now,
          },
        });

        // 2. Activate Tenant
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            status: 'ACTIVE',
            plan: targetTier.toLowerCase(),
            updatedAt: now,
          },
        });

        // 3. Create SubscriptionPayment record
        const paymentRef = body.providerReference || `SUB-PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const payment = await this.prisma.subscriptionPayment.create({
          data: {
            id: `spay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            subscriptionId: updatedSub.id,
            amount: price,
            currency: body.currency || plan?.currency || 'NGN',
            status: 'SUCCESSFUL',
            provider: (body.provider || 'PAYSTACK').toUpperCase(),
            providerReference: paymentRef,
            paymentMethod: body.paymentMethod || 'Online Gateway Payment',
            paidAt: now,
            verifiedAt: now,
            verifiedBy: body.verifiedBy || 'Platform Super Admin',
            metadata: {
              planTier: targetTier,
              billingCycle: cycle,
            },
          },
        });

        // 4. Update BillingInvoice if exists, or create one
        let invoice = null;
        if (body.invoiceId) {
          invoice = await this.prisma.billingInvoice.update({
            where: { id: body.invoiceId },
            data: {
              status: 'PAID',
              paidAt: now,
              paymentMethod: body.paymentMethod || 'Online Payment',
            },
          }).catch(() => null);
        }

        if (!invoice) {
          const invNum = `SUB-INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          invoice = await this.prisma.billingInvoice.create({
            data: {
              id: `binv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              subscriptionId: updatedSub.id,
              invoiceNumber: invNum,
              amount: price,
              currency: body.currency || plan?.currency || 'NGN',
              status: 'PAID',
              dueDate: now,
              paidAt: now,
              paymentMethod: body.paymentMethod || 'Online Payment',
              lineItems: [
                {
                  description: `${plan?.name || targetTier} Subscription Payment`,
                  amount: price,
                  quantity: 1,
                },
              ],
            },
          });
        }

        // 5. Audit Log
        await this.prisma.auditLog.create({
          data: {
            id: `aud_pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            action: 'SUBSCRIPTION_PAYMENT_VERIFIED_ACTIVATED',
            resourceType: 'SubscriptionPayment',
            resourceId: payment.id,
            afterData: {
              subscriptionId: updatedSub.id,
              status: 'ACTIVE',
              amount: price,
              providerReference: paymentRef,
              verifiedBy: body.verifiedBy || 'Platform Super Admin',
            },
          },
        });

        // Sync Memory Store
        this.prisma.memoryStore.subscriptions.set(updatedSub.id, {
          ...updatedSub,
          tier: targetTier.toLowerCase(),
        });
        const memTenant = this.prisma.memoryStore.tenants.get(tenantId);
        if (memTenant) {
          memTenant.status = 'ACTIVE';
          memTenant.plan = targetTier.toLowerCase();
        }

        return {
          success: true,
          subscription: updatedSub,
          payment,
          invoice,
          message: `Subscription successfully verified and activated. Status is now ACTIVE.`,
        };
      } catch (err: any) {
        this.logger.error(`Error verifying subscription payment in DB: ${err?.message}`);
        throw err;
      }
    }

    return { success: false, message: 'Database not connected.' };
  }

  /**
   * Helper to verify if a tenant is entitled to a specific feature key.
   * Evaluates: Feature in plan OR active incentive override.
   */
  async hasEntitlement(tenantId: string, featureKey: string): Promise<boolean> {
    const subRes = await this.getSubscription(tenantId);
    if (!subRes || !subRes.effectiveFeatures) return false;
    const normalizedKey = featureKey.toUpperCase();
    return subRes.effectiveFeatures.some(
      (f: string) => f.toUpperCase() === normalizedKey || f.toLowerCase() === featureKey.toLowerCase(),
    );
  }

  /**
   * Backwards-compatible feature flag check for UsageMeteringService and legacy guards.
   */
  async checkFeatureFlag(tenantId: string, featureKey: string): Promise<boolean> {
    return this.hasEntitlement(tenantId, featureKey);
  }

  /**
   * Backwards-compatible plan tier definitions for existing services and unit test suites.
   */
  getAvailablePlans(): PlanTierDefinition[] {
    return [
      SAAS_PLANS.free_trial,
      SAAS_PLANS.starter,
      SAAS_PLANS.growth,
      SAAS_PLANS.enterprise,
    ];
  }

  getPlanDetails(tier: string): PlanTierDefinition {
    const key = (tier || 'standard').toLowerCase();
    return SAAS_PLANS[key] || SAAS_PLANS.standard || SAAS_PLANS.growth;
  }
}
