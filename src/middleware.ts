/**
 * ANOLLA SPEC - NEXT.JS AUTH MIDDLEWARE
 * Ticket 2: Clerk Auth Setup
 * 
 * Main middleware for route protection using Clerk.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/roles";
import { hasMinimumRole, getRoleDashboardPath } from "@/lib/auth/roles";

// Define which routes require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/bookings(.*)",
  "/vehicles(.*)",
  "/services(.*)",
  "/packages(.*)",
  "/admin(.*)",
  "/owner(.*)",
  "/frontdesk(.*)",
  "/detailer(.*)",
  "/settings(.*)",
  "/api/bookings(.*)",
  "/api/studios(.*)",
  "/api/users(.*)",
]);

// Define routes that require admin access
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

// Define routes that require owner access
const isOwnerRoute = createRouteMatcher([
  "/owner(.*)",
  "/api/studios(.*)/manage",
]);

// Define routes that require staff access (frontdesk, detailer, owner, admin)
const isStaffRoute = createRouteMatcher([
  "/frontdesk(.*)",
  "/detailer(.*)",
  "/bookings/manage(.*)",
]);

/**
 * Get role from Clerk public metadata
 */
function getUserRole(metadata: { role?: string }): UserRole | null {
  const role = metadata?.role;
  if (role && ["customer", "detailer", "frontdesk", "owner", "admin"].includes(role)) {
    return role as UserRole;
  }
  return null;
}

/**
 * Determine redirect path based on user role
 */
function getRedirectPath(role: UserRole | null, path: string): string {
  // If no role, go to sign in
  if (!role) {
    return "/sign-in";
  }
  
  // Admin routes - only admin
  if (path.startsWith("/admin") && role !== "admin") {
    return getRoleDashboardPath(role);
  }
  
  // Owner routes - owner and admin
  if (path.startsWith("/owner") && !hasMinimumRole(role, "owner")) {
    return getRoleDashboardPath(role);
  }
  
  // Staff routes - frontdesk, detailer, owner, admin
  if (path.startsWith("/frontdesk") || path.startsWith("/detailer")) {
    if (!hasMinimumRole(role, "frontdesk")) {
      return getRoleDashboardPath(role);
    }
  }
  
  return "/dashboard";
}

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn } = await auth();
  const path = req.nextUrl.pathname;
  
  // Get user metadata for role check
  const user = userId ? await auth().then(a => a().user) : null;
  const role = getUserRole(user?.publicMetadata ?? {});
  
  // Handle protected routes
  if (isProtectedRoute(req)) {
    if (!userId) {
      return redirectToSignIn({ returnBackToUrl: req.url });
    }
    
    // Redirect if role doesn't match route requirements
    if (isAdminRoute(req) && role !== "admin") {
      return NextResponse.redirect(new URL(getRedirectPath(role, path), req.url));
    }
    
    if (isOwnerRoute(req) && !hasMinimumRole(role, "owner")) {
      return NextResponse.redirect(new URL(getRedirectPath(role, path), req.url));
    }
    
    if (isStaffRoute(req) && !hasMinimumRole(role, "frontdesk")) {
      return NextResponse.redirect(new URL(getRedirectPath(role, path), req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};