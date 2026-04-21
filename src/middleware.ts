/**
 * ANOLLA SPEC - NEXT.JS AUTH MIDDLEWARE
 * Ticket 2: Clerk Auth Setup
 * 
 * Main middleware for route protection using Clerk.
 * Fixed: Use auth() correctly per Clerk v6 API, handle API routes properly.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/roles";
import { getUserRole, getUserStudioIds, getPublicRoutes } from "@/lib/auth/middleware";

// Route matchers
const isPublicRoute = createRouteMatcher(getPublicRoutes());

// Admin routes - include both page and API routes
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

// Owner routes
const isOwnerRouteMatcher = createRouteMatcher([
  "/owner(.*)",
  "/api/owner(.*)",
  "/api/studios(.*)",
]);

// Staff routes (frontdesk, detailer)
const isStaffRouteMatcher = createRouteMatcher([
  "/frontdesk(.*)",
  "/detailer(.*)",
  "/api/bookings(.*)",
  "/api/customers(.*)",
]);

// Authenticated routes
const isAuthRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/bookings(.*)",
  "/vehicles(.*)",
  "/packages(.*)",
]);

// FIXED Comment 2: Removed /services from protected routes (it's public per middleware config)
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/bookings(.*)",
  "/vehicles(.*)",
  "/packages(.*)",
  "/admin(.*)",
  "/owner(.*)",
  "/frontdesk(.*)",
  "/detailer(.*)",
]);

// Role hierarchy for minimum role requirements
const ROLE_HIERARCHY: Record<UserRole, number> = {
  customer: 1,
  detailer: 2,
  frontdesk: 3,
  owner: 4,
  admin: 5,
};

// FIXED Comment 6: Get redirect path based on role
function getRedirectPath(role: UserRole | null, pathname: string): string {
  if (!role) return "/sign-in?redirect_url=" + encodeURIComponent(pathname);
  
  // Admin routes
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return "/access-denied";
  }
  
  // Owner routes
  if (pathname.startsWith("/owner") || pathname.startsWith("/api/owner") || pathname.startsWith("/api/studios")) {
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY.owner) {
      return "/access-denied";
    }
  }
  
  // Staff routes
  if (pathname.startsWith("/frontdesk") || pathname.startsWith("/detailer") || pathname.startsWith("/api/bookings")) {
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY.detailer) {
      return "/access-denied";
    }
  }
  
  // Default: redirect to dashboard
  return "/dashboard";
}

export default clerkMiddleware(async (auth, req) => {
  // FIXED Comment 1: Use auth() correctly - destructure from single call
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;
  
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }
  
  // If not authenticated and trying to access protected route, redirect to sign in
  if (!userId && isProtectedRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(signInUrl);
  }
  
  // If authenticated, check role-based access
  if (userId) {
    // Get user's role from Clerk public metadata
    const authObj = await auth();
    const role = (authObj.sessionClaims?.publicMetadata?.role as UserRole) || "customer";
    
    // FIXED Comment 6: For API routes, return JSON 403 instead of redirect
    if (isAdminRoute(req) && role !== "admin") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Forbidden: admin access required", code: "ADMIN_REQUIRED" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL(getRedirectPath(role, pathname), req.url));
    }
    
    if (isOwnerRouteMatcher(req) && ROLE_HIERARCHY[role] < ROLE_HIERARCHY.owner) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Forbidden: owner access required", code: "OWNER_REQUIRED" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/access-denied", req.url));
    }
    
    if (isStaffRouteMatcher(req) && ROLE_HIERARCHY[role] < ROLE_HIERARCHY.detailer) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Forbidden: staff access required", code: "STAFF_REQUIRED" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/access-denied", req.url));
    }
  }
  
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
