/**
 * Dev/support-only contract (mock API only — AUTH-002 tenant switcher, role impersonation).
 * A real platform-support flow would be audited and separate.
 */
export interface DevMember {
  tenantUserId: string;
  displayName: string;
  email: string;
  roleName: string;
  roleCode: string;
}

export interface DevDemoAccount {
  email: string;
  displayName: string;
  tenantName: string;
  roleName: string;
  password: string;
}

export interface DevImpersonation {
  accessToken: string;
  member: DevMember;
  locationIds: string[];
}
