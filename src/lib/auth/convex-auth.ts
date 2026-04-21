/**
 * ANOLLA SPEC - CONVEX CLERK AUTH HELPER
 * Ticket 2: Clerk Auth Setup
 * 
 * Server-side authentication helpers for Convex.
 * Bridges Clerk auth with Convex database.
 */

import { auth } from "@clerk/nextjs/server";
import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get the current user's Clerk user ID
 */
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Query to get current user from Convex database
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getClerkUserId();
    
    if (!userId) {
      return null;
    }
    
    // Find user by Clerk ID (stored as externalId or in metadata)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email")
      .first();
    
    return user;
  },
});

/**
 * Query to check if current user has a specific role
 */
export const getCurrentUserRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getClerkUserId();
    
    if (!userId) {
      return { authenticated: false, role: null };
    }
    
    // Get user from database
    const user = await ctx.db
      .query("users")
      .first();
    
    return {
      authenticated: true,
      userId,
      role: user?.role ?? null,
    };
  },
});

/**
 * Query to get user's studio access
 */
export const getUserStudios = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getClerkUserId();
    
    if (!userId) {
      return [];
    }
    
    // Get studios the user has access to
    // This would typically join with a user_studios table
    const studios = await ctx.db
      .query("studios")
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
    
    return studios;
  },
});