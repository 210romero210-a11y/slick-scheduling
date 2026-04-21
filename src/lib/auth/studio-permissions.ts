/**
 * ANOLLA SPEC - MULTI-STUDIO PERMISSIONS
 * Ticket 2: Clerk Auth Setup
 * 
 * Manages studio access for owners with multiple studios.
 */

import type { UserRole } from "./roles";

export interface StudioPermission {
  studioId: string;
  role: UserRole;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface UserStudioAccess {
  userId: string;
  permissions: StudioPermission[];
  defaultStudioId?: string;
}

/**
 * Check if user has access to a specific studio
 */
export function hasStudioAccess(
  access: UserStudioAccess,
  studioId: string
): boolean {
  const permission = access.permissions.find(p => p.studioId === studioId);
  
  if (!permission) return false;
  
  // Check if expired
  if (permission.expiresAt && permission.expiresAt < new Date()) {
    return false;
  }
  
  return true;
}

/**
 * Check if user is the owner of a studio
 */
export function isStudioOwner(
  access: UserStudioAccess,
  studioId: string
): boolean {
  const permission = access.permissions.find(
    p => p.studioId === studioId && 
    (p.role === "owner" || p.role === "admin")
  );
  
  return !!permission;
}

/**
 * Get all studios a user has access to
 */
export function getAccessibleStudios(
  access: UserStudioAccess
): string[] {
  return access.permissions
    .filter(p => !p.expiresAt || p.expiresAt > new Date())
    .map(p => p.studioId);
}

/**
 * Get the default studio for a user
 */
export function getDefaultStudio(
  access: UserStudioAccess
): string | null {
  // Return explicitly set default
  if (access.defaultStudioId) {
    return access.defaultStudioId;
  }
  
  // Return first accessible studio
  const accessible = getAccessibleStudios(access);
  return accessible[0] ?? null;
}

/**
 * Create a studio permission object
 */
export function createStudioPermission(
  studioId: string,
  role: UserRole,
  expiresAt?: Date
): StudioPermission {
  return {
    studioId,
    role,
    grantedAt: new Date(),
    expiresAt,
  };
}

/**
 * Merge permissions from multiple sources (e.g., individual + organization)
 */
export function mergePermissions(
  baseAccess: UserStudioAccess,
  additionalPermissions: StudioPermission[]
): UserStudioAccess {
  const existingIds = new Set(baseAccess.permissions.map(p => p.studioId));
  
  const newPermissions = additionalPermissions.filter(
    p => !existingIds.has(p.studioId)
  );
  
  return {
    ...baseAccess,
    permissions: [...baseAccess.permissions, ...newPermissions],
  };
}

/**
 * Check permission level for studio operations
 */
export function canManageStudioResources(
  userRole: UserRole,
  userStudioIds: string[],
  targetStudioId: string,
  operation: "read" | "write" | "delete"
): boolean {
  // Admin can do anything
  if (userRole === "admin") return true;
  
  // Owner can do read/write on their studios
  if (userRole === "owner") {
    if (!userStudioIds.includes(targetStudioId)) return false;
    return operation !== "delete";
  }
  
  // Frontdesk can read/write on their assigned studio
  if (userRole === "frontdesk") {
    return userStudioIds.includes(targetStudioId) && operation !== "delete";
  }
  
  // Detailers and customers can only read
  return operation === "read";
}