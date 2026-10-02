import type {
  Device,
  DevDemoAccount,
  DevImpersonation,
  DevMember,
  TenantSummary,
} from '@rbp/types';
import { apiClient } from '@/lib/api';

/** Mock-only dev/support endpoints (not part of the product API contract). */
const P = '/api/v1/dev';

export const devApi = {
  tenants: () => apiClient.get<TenantSummary[]>(`${P}/tenants`),
  members: (tenantId: string) => apiClient.get<DevMember[]>(`${P}/tenants/${tenantId}/members`),
  devices: (tenantId: string) => apiClient.get<Device[]>(`${P}/tenants/${tenantId}/devices`),
  demoAccounts: () => apiClient.get<DevDemoAccount[]>(`${P}/demo-accounts`),
  impersonate: (tenantUserId: string) =>
    apiClient.post<DevImpersonation>(`${P}/impersonate`, { tenantUserId }),
  reset: () => apiClient.post<undefined>(`${P}/reset`),
};
