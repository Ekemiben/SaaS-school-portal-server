export interface TenantContext {
  tenantId: string;
  slug: string;
  name: string;
  status: string;
  features?: Record<string, any>;
  userId?: string;
  email?: string;
  roleIds?: string[];
  permissionIds?: string[];
  campusIds?: string[];
  requestId?: string;
  isPlatformAdmin?: boolean;
}
