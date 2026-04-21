/**
 * ANOLLA SPEC - CONVEX CLERK AUTH HELPER
 * Ticket 2: Clerk Auth Setup
 * 
 * Server-side authentication helpers for Convex.
 * Bridges Clerk auth with Convex database.
 * Fixed: Proper user filtering by Clerk user ID.
 */

import { auth } from "@clerk/nextjs/server";
import { query } from "../../convex/_generated/server";
import { v } from "convex/values";

/**
 * Get the current user's Clerk user ID
 * This is the external ID from Clerk
 */
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Get the current user's Convex document ID
 * This requires the users table to have a clerkUserId field indexed
 */
export async function getCurrentConvexUserId(
  ctx: import("../../convex/_generated/server").QueryCtx
): Promise<string | null> {
  const clerkUserId = await getClerkUserId();
  
  if (!clerkUserId) {
    return null;
  }
  
  // Look up user by clerkUserId field
  // NOTE: This requires adding clerkUserId to your users table schema
  // and creating an index "by_clerk_user_id" on ["clerkUserId"]
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id")
    .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
    .first();
  
  return user?._id ?? null;
}

/**
 * FIXED Comment 4: Query to get current user from Convex database
 * Now properly filters by Clerk user ID
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return null;
    }
    
    // Find user by Clerk user ID (requires clerkUserId field in schema)
    // If clerkUserId doesn't exist in schema, fall back to email lookup
    try {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
      
      return user;
    } catch {
      // If by_clerk_user_id index doesn't exist, try email-based lookup
      // This requires the user to have signed in before and stored their email
      // In production, use clerkUserId field
      const { getAuthUserId } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      
      if (!userId) return null;
      
      // Last resort: get user from sessionClaims public metadata
      const { sessionClaims } = await auth();
      const email = sessionClaims?.email;
      
      if (!email) return null;
      
      return await ctx.db
        .query("users")
        .withIndex("by_email")
        .filter((q) => q.eq(q.field("email"), email))
        .first();
    }
  },
});

/**
 * FIXED Comment 4: Query to check if current user has a specific role
 * Now properly scoped to authenticated user
 */
export const getCurrentUserRole = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return { authenticated: false, role: null };
    }
    
    // Get user from database (filtered by Clerk ID)
    let user;
    try {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
    } catch {
      // Fallback without clerkUserId index
      return {
        authenticated: true,
        clerkUserId,
        role: "customer" as const, // Default role
        note: "Role lookup unavailable - clerkUserId index not configured",
      };
    }
    
    return {
      authenticated: true,
      clerkUserId,
      userId: user?._id,
      role: user?.role ?? null,
    };
  },
});

/**
 * Query to get user's studio access
 * Returns studios the user has permission to access
 */
export const getUserStudios = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return [];
    }
    
    // Get user's role first
    let user;
    try {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
    } catch {
      return [];
    }
    
    const role = user?.role;
    const userStudioIds = user?.studioIds ?? [];
    
    // Admins see all studios
    if (role === "admin") {
      return await ctx.db
        .query("studios")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }
    
    // Owners and staff see their assigned studios
    if (role === "owner" || role === "frontdesk" || role === "detailer") {
      const studios = await Promise.all(
        userStudioIds.map((studioId: string) => ctx.db.get(studioId as import("convex/dataModel").Doc<"studios">))
      );
      return studios.filter((s): s is NonNullable<typeof s> => s !== null && s.isActive);
    }
    
    // Customers don't have studio access here (they access through bookings)
    return [];
  },
});

/**
 * Query to check if user has access to a specific studio
 */
export const hasStudioAccess = query({
  args: { studioId: v.id("studios") },
  handler: async (ctx, args) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return { hasAccess: false, reason: "not_authenticated" };
    }
    
    let user;
    try {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
    } catch {
      return { hasAccess: false, reason: "index_not_configured" };
    }
    
    if (!user) {
      return { hasAccess: false, reason: "user_not_found" };
    }
    
    // Admin has access to all studios
    if (user.role === "admin") {
      return { hasAccess: true, reason: "admin" };
    }
    
    // Owner has access to all studios
    if (user.role === "owner") {
      return { hasAccess: true, reason: "owner" };
    }
    
    // Check if studio is in user's assigned studios
    const userStudioIds = user.studioIds ?? [];
    const hasAccess = userStudioIds.includes(args.studioId);
    
    return {
      hasAccess,
      reason: hasAccess ? "assigned_studio" : "not_assigned",
    };
  },
});

/**
 * Query to get user's booking history
 * Only returns bookings for the authenticated user
 */
export const getMyBookings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return [];
    }
    
    // Get user's Convex ID
    let user;
    try {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
    } catch {
      return [];
    }
    
    if (!user) {
      return [];
    }
    
    // Get bookings for this user
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();
    
    // Sort by createdAt descending and limit
    const sorted = bookings.sort((a, b) => b.createdAt - a.createdAt);
    return args.limit ? sorted.slice(0, args.limit) : sorted;
  },
});

/**
 * Query to get user's vehicles
 */
export const getMyVehicles = query({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = await getClerkUserId();
    
    if (!clerkUserId) {
      return [];
    }
    
    let user;
    try {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id")
        .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
        .first();
    } catch {
      return [];
    }
    
    if (!user) {
      return [];
    }
    
    return await ctx.db
      .query("vehicles")
      .withIndex("by_owner")
      .filter((q) => q.eq(q.field("ownerId"), user._id))
      .collect();
  },
});
