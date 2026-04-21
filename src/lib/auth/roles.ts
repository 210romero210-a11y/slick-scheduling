/**
 * ANOLLA SPEC - SLICK SCHEDULING AUTH ROLES
 * Ticket 2: Clerk Auth Setup
 * 
 * Role definitions and permissions aligned with Anolla specification.
 */

// User roles from Anolla spec
export type UserRole = "customer" | "detailer" | "frontdesk" | "owner" | "admin";

// Role hierarchy (higher = more permissions)
export const roleHierarchy: Record<UserRole, number> = {
  customer: 1,
  detailer: 2,
  frontdesk: 3,
  owner: 4,
  admin: 5,
};

// Role display names
export const roleDisplayNames: Record<UserRole, string> = {
  customer: "Customer",
  detailer: "Detailer",
  frontdesk: "Front Desk",
  owner: "Studio Owner",
  admin: "Administrator",
};

// Permission definitions
export type Permission =
  | "bookings:create"
  | "bookings:read"
  | "bookings:update"
  | "bookings:cancel"
  | "bookings:delete"
  | "vehicles:create"
  | "vehicles:read"
  | "vehicles:update"
  | "vehicles:delete"
  | "services:create"
  | "services:read"
  | "services:update"
  | "services:delete"
  | "packages:create"
  | "packages:read"
  | "packages:update"
  | "packages:delete"
  | "studios:create"
  | "studios:read"
  | "studios:update"
  | "studios:delete"
  | "studios:manage"
  | "bays:create"
  | "bays:read"
  | "bays:update"
  | "bays:delete"
  | "users:create"
  | "users:read"
  | "users:update"
  | "users:delete"
  | "detailers:manage"
  | "pricing:manage"
  | "reports:view"
  | "warranties:manage"
  | "ai:access"
  | "admin:full";

// Role permissions mapping
export const rolePermissions: Record<UserRole, Permission[]> = {
  customer: [
    "bookings:create",
    "bookings:read",
    "bookings:cancel",
    "vehicles:create",
    "vehicles:read",
    "vehicles:update",
    "services:read",
    "packages:read",
    "ai:access",
  ],
  detailer: [
    "bookings:read",
    "bookings:update",
    "vehicles:read",
    "services:read",
    "packages:read",
    "ai:access",
  ],
  frontdesk: [
    "bookings:create",
    "bookings:read",
    "bookings:update",
    "bookings:cancel",
    "vehicles:create",
    "vehicles:read",
    "vehicles:update",
    "services:read",
    "packages:read",
    "studios:read",
    "bays:read",
    "users:read",
    "reports:view",
    "ai:access",
  ],
  owner: [
    "bookings:create",
    "bookings:read",
    "bookings:update",
    "bookings:cancel",
    "bookings:delete",
    "vehicles:create",
    "vehicles:read",
    "vehicles:update",
    "vehicles:delete",
    "services:create",
    "services:read",
    "services:update",
    "services:delete",
    "packages:create",
    "packages:read",
    "packages:update",
    "packages:delete",
    "studios:create",
    "studios:read",
    "studios:update",
    "studios:delete",
    "studios:manage",
    "bays:create",
    "bays:read",
    "bays:update",
    "bays:delete",
    "users:create",
    "users:read",
    "users:update",
    "users:delete",
    "detailers:manage",
    "pricing:manage",
    "reports:view",
    "warranties:manage",
    "ai:access",
  ],
  admin: [
    "bookings:create",
    "bookings:read",
    "bookings:update",
    "bookings:cancel",
    "bookings:delete",
    "vehicles:create",
    "vehicles:read",
    "vehicles:update",
    "vehicles:delete",
    "services:create",
    "services:read",
    "services:update",
    "services:delete",
    "packages:create",
    "packages:read",
    "packages:update",
    "packages:delete",
    "studios:create",
    "studios:read",
    "studios:update",
    "studios:delete",
    "studios:manage",
    "bays:create",
    "bays:read",
    "bays:update",
    "bays:delete",
    "users:create",
    "users:read",
    "users:update",
    "users:delete",
    "detailers:manage",
    "pricing:manage",
    "reports:view",
    "warranties:manage",
    "ai:access",
    "admin:full",
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

/**
 * Check if a role is at least a certain level
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[minimumRole];
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: UserRole): Permission[] {
  return rolePermissions[role] ?? [];
}

/**
 * Check if role can manage a specific studio
 */
export function canManageStudio(
  userRole: UserRole,
  userStudioIds: string[],
  targetStudioId: string
): boolean {
  // Admins can manage any studio
  if (userRole === "admin") return true;
  
  // Owners can only manage their assigned studios
  if (userRole === "owner") {
    return userStudioIds.includes(targetStudioId);
  }
  
  return false;
}

/**
 * Get redirect path based on role
 */
export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "owner":
      return "/owner";
    case "frontdesk":
      return "/frontdesk";
    case "detailer":
      return "/detailer";
    case "customer":
    default:
      return "/dashboard";
  }
}