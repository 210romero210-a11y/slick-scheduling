/**
 * ANOLLA SPEC - CLERK AUTH MIDDLEWARE
 * Ticket 2: Clerk Auth Setup
 * 
 * Route protection middleware with role-based access control.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/roles";
import { hasPermission, hasMinimumRole, canManageStudio, getRoleDashboardPath } from "@/lib/auth/roles";
import type { Permission } from "@/lib/auth/roles";

// Extend Clerk's UserMetadata to include our custom fields
declare module "@clerk/clerk-sdk-node" {
  interface UserPublicMetadata {
    role: UserRole;
    studioIds: string[];
    defaultStudioId?: string;
  }
}

// Route protection configuration
export interface RouteProtection {
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  minimumRole?: UserRole;
  requiredPermissions?: Permission[];
  requireStudioAccess?: boolean;
}

// Common route patterns
export const protectedRoutes = {
  "/admin": {
    requireAuth: true,
    minimumRole: "admin" as UserRole,
  },
  "/owner": {
    requireAuth: true,
    minimumRole: "owner" as UserRole,
  },
  "/frontdesk": {
    requireAuth: true,
    minimumRole: "frontdesk" as UserRole,
  },
  "/detailer": {
    requireAuth: true,
    minimumRole: "detailer" as UserRole,
  },
  "/dashboard": {
    requireAuth: true,
    allowedRoles: ["customer", "detailer", "frontdesk", "owner", "admin"] as UserRole[],
  },
  "/bookings": {
    requireAuth: true,
  },
  "/services": {
    requireAuth: false, // Public can view services
  },
  "/api/admin": {
    requireAuth: true,
    minimumRole: "admin" as UserRole,
  },
  "/api/studios": {
    requireAuth: true,
  },
};

/**
 * Get current user's role from Clerk metadata
 */
export async function getUserRole(): Promise<UserRole | null> {
  const { userId } = await auth();
  
  if (!userId) return null;
  
  const user = await currentUser();
  return (user?.publicMetadata?.role as UserRole) ?? null;
}

/**
 * Get current user's studio IDs
 */
export async function getUserStudioIds(): Promise<string[]> {
  const { userId } = await auth();
  
  if (!userId) return [];
  
  const user = await currentUser();
  return (user?.publicMetadata?.studioIds as string[]) ?? [];
}

/**
 * Check if current user has a specific permission
 */
export async function userHasPermission(permission: Permission): Promise<boolean> {
  const role = await getUserRole();
  if (!role) return false;
  return hasPermission(role, permission);
}

/**
 * Check if current user can access a studio
 */
export async function userCanAccessStudio(studioId: string): Promise<boolean> {
  const role = await getUserRole();
  const studioIds = await getUserStudioIds();
  
  if (!role) return false;
  
  // Admin can access all studios
  if (role === "admin") return true;
  
  // Check if user has access to this specific studio
  return canManageStudio(role, studioIds, studioId);
}

/**
 * Create a middleware guard for a route
 */
export function createRouteGuard(config: RouteProtection) {
  return async function guard(): Promise<{
    allowed: boolean;
    redirect?: string;
    reason?: string;
  }> {
    const { userId } = await auth();
    
    // Check authentication
    if (config.requireAuth && !userId) {
      return {
        allowed: false,
        redirect: "/sign-in",
        reason: "Authentication required",
      };
    }
    
    if (!userId) {
      return { allowed: true }; // Public route
    }
    
    const role = await getUserRole();
    
    if (!role) {
      return {
        allowed: false,
        redirect: "/sign-in",
        reason: "User role not found",
      };
    }
    
    // Check role restrictions
    if (config.allowedRoles && !config.allowedRoles.includes(role)) {
      return {
        allowed: false,
        redirect: getRoleDashboardPath(role),
        reason: "Role not allowed for this route",
      };
    }
    
    // Check minimum role
    if (config.minimumRole && !hasMinimumRole(role, config.minimumRole)) {
      return {
        allowed: false,
        redirect: getRoleDashboardPath(role),
        reason: "Insufficient role level",
      };
    }
    
    // Check specific permissions
    if (config.requiredPermissions) {
      const missingPermissions = config.requiredPermissions.filter(
        p => !hasPermission(role, p)
      );
      if (missingPermissions.length > 0) {
        return {
          allowed: false,
          redirect: getRoleDashboardPath(role),
          reason: `Missing permissions: ${missingPermissions.join(", ")}`,
        };
      }
    }
    
    return { allowed: true };
  };
}

/**
 * Redirect helper for middleware
 */
export function redirectToAccessDenied() {
  return NextResponse.redirect(new URL("/access-denied", "http://localhost"));
}

/**
 * Redirect helper for unauthorized users
 */
export function redirectToSignIn() {
  return NextResponse.redirect(new URL("/sign-in", "http://localhost"));
}

/**
 * Validate studio access in API routes
 */
export async function validateStudioAccess(
  studioId: string,
  operation: "read" | "write" | "delete" = "read"
): Promise<boolean> {
  const role = await getUserRole();
  const studioIds = await getUserStudioIds();
  
  if (!role) return false;
  
  if (role === "admin") return true;
  if (role === "owner" && studioIds.includes(studioId)) return true;
  if (role === "frontdesk" && studioIds.includes(studioId) && operation !== "delete") {
    return true;
  }
  
  return false;
}