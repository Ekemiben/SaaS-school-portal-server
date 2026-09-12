import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';

// Core and Database
import { PrismaModule } from './database/prisma.module.js';

// Middlewares
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { TenantResolverMiddleware } from './common/middleware/tenant-resolver.middleware.js';

// Guards
import { AuthGuard } from './common/guards/auth.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

// Interceptors & Filters
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware.js';

// Asynchronous Queues & Background Processors
import { QueuesModule } from './jobs/queues.module.js';

// Business Domain Modules
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CampusesModule } from './modules/campuses/campuses.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { TeachersModule } from './modules/teachers/teachers.module.js';
import { ParentsModule } from './modules/parents/parents.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { TimetableModule } from './modules/timetable/timetable.module.js';
import { HomeworkModule } from './modules/homework/homework.module.js';
import { ExaminationsModule } from './modules/examinations/examinations.module.js';
import { ResultsModule } from './modules/results/results.module.js';
import { FeesModule } from './modules/fees/fees.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { TransportModule } from './modules/transport/transport.module.js';
import { CommunicationsModule } from './modules/communications/communications.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    QueuesModule,
    TenancyModule,
    AuthModule,
    CampusesModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AcademicsModule,
    StudentsModule,
    TeachersModule,
    ParentsModule,
    AttendanceModule,
    TimetableModule,
    HomeworkModule,
    ExaminationsModule,
    ResultsModule,
    FeesModule,
    PaymentsModule,
    BillingModule,
    PayrollModule,
    ExpensesModule,
    TransportModule,
    CommunicationsModule,
    NotificationsModule,
    StorageModule,
    FilesModule,
    ReportsModule,
    SubscriptionsModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, RateLimitMiddleware, TenantResolverMiddleware)
      .forRoutes('*');
  }
}
