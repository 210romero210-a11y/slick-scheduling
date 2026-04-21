/**
 * ANOLLA SPEC - AUTH MIDDLEWARE HELPERS
 * Ticket 2: Clerk Auth Setup
 * 
 * Role-based access control utilities and route protection.
 * Fixed: Removed hardcoded localhost, use request origin for redirects.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "./roles";
import type { RequestCookies } from "next/dist/compiled/@edge-runtime/primitives";

// ============================================
// ROUTE CONFIGURATIONS
// ============================================

export interface RouteConfig {
  requireAuth: boolean;
  allowedRoles?: UserRole[];
  allowedStudios?: "any" | "owned" | "assigned";
  requireStudioAccess?: boolean;
}

// FIXED Comment 3: Use dynamic origin instead of hardcoded localhost
function getBaseUrl(req?: Request): string {
  if (req) {
    const url = new URL(req.url);
    return url.origin;
  }
  // Fallback for server-side without request
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return "http://localhost:3000";
}

// Public routes - no authentication required
export function getPublicRoutes(): string[] {
  return [
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/sso-callback(.*)",
    "/services",           // Services listing is public
    "/services(.*)",       // Individual service details are public
    "/about(.*)",
    "/contact(.*)",
    "/pricing(.*)",
    "/api/webhooks/clerk", // Clerk webhooks need to be public
    "/api/public(.*)",
    // Public API routes
    "/api/services(.*)",
    "/api/packages(.*)",
    "/api/studios/public(.*)",
  ];
}

// Protected routes - require authentication
export function getProtectedRoutes(): string[] {
  return [
    "/dashboard(.*)",
    "/bookings(.*)",
    "/vehicles(.*)",
    "/packages(.*)",
    "/admin(.*)",
    "/owner(.*)",
    "/frontdesk(.*)",
    "/detailer(.*)",
    "/settings(.*)",
    "/profile(.*)",
  ];
}

// Admin-only routes
export function getAdminRoutes(): string[] {
  return [
    "/admin(.*)",
    "/api/admin(.*)",
    "/api/users(.*)", // User management
    "/api/settings(.*)", // System settings
  ];
}

// Owner routes (owner and admin)
export function getOwnerRoutes(): string[] {
  return [
    "/owner(.*)",
    "/api/owner(.*)",
    "/api/studios(.*)",
    "/api/detailers(.*)",
    "/api/pricing-rules(.*)",
  ];
}

// Staff routes (frontdesk, detailer, owner, admin)
export function getStaffRoutes(): string[] {
  return [
    "/frontdesk(.*)",
    "/detailer(.*)",
    "/api/bookings(.*)",
    "/api/customers(.*)",
  ];
}

// ============================================
// AUTH UTILITIES
// ============================================

/**
 * Get the current authenticated user's ID from Clerk
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Get the current authenticated user from Clerk
 */
export async function getCurrentClerkUser() {
  return await currentUser();
}

/**
 * Get the current user's role from Clerk public metadata
 */
export async function getUserRole(): Promise<UserRole> {
  const user = await currentUser();
  const role = user?.publicMetadata?.role as UserRole | undefined;
  return role || "customer";
}

/**
 * Get the user's assigned studio IDs from Clerk public metadata
 */
export async function getUserStudioIds(): Promise<string[]> {
  const user = await currentUser();
  const studioIds = user?.publicMetadata?.studioIds as string[] | undefined;
  return studioIds || [];
}

/**
 * Check if user has access to a specific studio
 */
export async function hasStudioAccess(studioId: string): Promise<boolean> {
  const role = await getUserRole();
  
  // Admins and owners have access to all studios
  if (role === "admin" || role === "owner") {
    return true;
  }
  
  // Staff may have assigned studios
  const studioIds = await getUserStudioIds();
  return studioIds.includes(studioId);
}

// ============================================
// ROUTE PROTECTION HELPERS
// ============================================

/**
 * Check if route requires authentication
 */
export function isAuthenticatedRoute(pathname: string): boolean {
  const protectedRoutes = getProtectedRoutes();
  return protectedRoutes.some(route => {
    if (route.endsWith("(.*)")) {
      return pathname.startsWith(route.replace("(.*)", ""));
    }
    return pathname === route;
  });
}

/**
 * Check if route is admin-only
 */
export function isAdminRoute(pathname: string): boolean {
  const adminRoutes = getAdminRoutes();
  return adminRoutes.some(route => {
    if (route.endsWith("(.*)")) {
      return pathname.startsWith(route.replace("(.*)", ""));
    }
    return pathname === route;
  });
}

/**
 * Check if route is owner-only
 */
export function isOwnerRoute(pathname: string): boolean {
  const ownerRoutes = getOwnerRoutes();
  return ownerRoutes.some(route => {
    if (route.endsWith("(.*)")) {
      return pathname.startsWith(route.replace("(.*)", ""));
    }
    return pathname === route;
  });
}

/**
 * Check if route is staff-only
 */
export function isStaffRoute(pathname: string): boolean {
  const staffRoutes = getStaffRoutes();
  return staffRoutes.some(route => {
    if (route.endsWith("(.*)")) {
      return pathname.startsWith(route.replace("(.*)", ""));
    }
    return pathname === route;
  });
}

/**
 * Check if route is public
 */
export function isPublicRoute(pathname: string): boolean {
  const publicRoutes = getPublicRoutes();
  return publicRoutes.some(route => {
    if (route.endsWith("(.*)")) {
      return pathname.startsWith(route.replace("(.*)", ""));
    }
    return pathname === route;
  });
}

// ============================================
// REDIRECT HELPERS
// ============================================

// FIXED Comment 3: Use dynamic URL instead of hardcoded localhost

export function redirectToSignIn(redirectUrl?: string, request?: Request): NextResponse {
  const baseUrl = getBaseUrl(request);
  const signInUrl = new URL("/sign-in", baseUrl);
  if (redirectUrl) {
    signInUrl.searchParams.set("redirect_url", redirectUrl);
  }
  return NextResponse.redirect(signInUrl);
}

export function redirectToDashboard(request?: Request): NextResponse {
  const baseUrl = getBaseUrl(request);
  return NextResponse.redirect(new URL("/dashboard", baseUrl));
}

export function redirectToAccessDenied(request?: Request): NextResponse {
  const baseUrl = getBaseUrl(request);
  return NextResponse.redirect(new URL("/access-denied", baseUrl));
}

export function redirectToHome(request?: Request): NextResponse {
  const baseUrl = getBaseUrl(request);
  return NextResponse.redirect(new URL("/", baseUrl));
}

// ============================================
// API RESPONSE HELPERS
// ============================================

export function jsonUnauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}

export function jsonForbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json(
    { error: message, code: "FORBIDDEN" },
    { status: 403 }
  );
}

export function jsonNotFound(message = "Not found"): NextResponse {
  return NextResponse.json(
    { error: message, code: "NOT_FOUND" },
    { status: 404 }
  );
}

export function jsonBadRequest(message = "Bad request"): NextResponse {
  return NextResponse.json(
    { error: message, code: "BAD_REQUEST" },
    { status: 400 }
  );
}
