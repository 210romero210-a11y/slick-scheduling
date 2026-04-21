/**
 * ANOLLA SPEC - SLICK SCHEDULING AGGREGATES V2
 * 
 * Using @convex-dev/aggregate component for efficient analytics.
 * See: https://docs.convex.dev/database/aggregates
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { aggregate } from "@convex-dev/aggregate";

// ============================================
// BOOKING AGGREGATES
// ============================================

/**
 * Count bookings by status for a studio
 * Usage: aggregates.count(components.aggregate, "bookings", "by_status", { status: "pending" })
 */
export const getBookingCountsByStatus = query({
  args: { studioId: v.optional(v.id("studios")) },
  handler: async (ctx, args) => {
    // For now, use standard queries (aggregate component would need setup)
    const baseQuery = ctx.db.query("bookings");
    
    const allBookings = await baseQuery.collect();
    const bookings = args.studioId 
      ? allBookings.filter(b => b.studioId === args.studioId)
      : allBookings;

    const counts = {
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      total: bookings.length,
    };

    for (const booking of bookings) {
      if (booking.status in counts) {
        counts[booking.status as keyof typeof counts]++;
      }
    }

    return counts;
  },
});

/**
 * Get bookings for a date range
 */
export const getBookingsByDateRange = query({
  args: { 
    studioId: v.id("studios"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .collect();

    return bookings.filter(b => 
      b.startTime >= args.startDate && b.startTime <= args.endDate
    );
  },
});

// ============================================
// REVENUE AGGREGATES
// ============================================

/**
 * Calculate studio revenue for a date range
 */
export const getStudioRevenue = query({
  args: {
    studioId: v.id("studios"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .filter(q => q.eq(q.field("status"), "completed"))
      .collect();

    const filtered = bookings.filter(b => {
      if (args.startDate && b.createdAt < args.startDate) return false;
      if (args.endDate && b.createdAt > args.endDate) return false;
      return true;
    });

    const revenue = filtered.reduce((sum, b) => sum + b.totalPrice, 0);
    const addOnRevenue = filtered.reduce(
      (sum, b) => sum + (b.addOnPrice || 0), 
      0
    );
    const discountTotal = filtered.reduce(
      (sum, b) => sum + (b.appliedDiscounts?.reduce((s, d) => s + d.amount, 0) || 0),
      0
    );

    return {
      totalRevenue: revenue,
      addOnRevenue,
      discountTotal,
      netRevenue: revenue - discountTotal,
      completedBookings: filtered.length,
      averageBookingValue: filtered.length > 0 
        ? Math.round(revenue / filtered.length) 
        : 0,
    };
  },
});

// ============================================
// UTILIZATION AGGREGATES
// ============================================

/**
 * Calculate bay utilization for a date
 */
export const getBayUtilization = query({
  args: {
    studioId: v.id("studios"),
    date: v.number(), // Start of day timestamp
  },
  handler: async (ctx, args) => {
    const bays = await ctx.db
      .query("bays")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();

    const dayStart = args.date;
    const dayEnd = dayStart + 86400000; // 24 hours in ms

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .filter(q => q.gte(q.field("startTime"), dayStart))
      .filter(q => q.lt(q.field("startTime"), dayEnd))
      .collect();

    // Calculate available minutes (assuming 8am-6pm = 10 hours)
    const availableMinutesPerBay = 10 * 60;

    return bays.map(bay => {
      const bayBookings = bookings.filter(b => b.bayId === bay._id);
      const bookedMinutes = bayBookings.reduce((sum, b) => sum + b.duration, 0);
      const utilizationPercent = (bookedMinutes / availableMinutesPerBay) * 100;

      return {
        bayId: bay._id,
        bayName: bay.name,
        bayType: bay.type,
        bookingsCount: bayBookings.length,
        bookedMinutes,
        availableMinutes: availableMinutesPerBay,
        utilizationPercent: Math.round(Math.min(utilizationPercent, 100) * 100) / 100,
      };
    });
  },
});

/**
 * Get studio utilization summary
 */
export const getStudioUtilization = query({
  args: {
    studioId: v.id("studios"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const bays = await ctx.db
      .query("bays")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .collect();

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", args.studioId))
      .filter(q => q.gte(q.field("startTime"), args.startDate))
      .filter(q => q.lt(q.field("startTime"), args.endDate))
      .filter(q => q.eq(q.field("status"), "completed"))
      .collect();

    const totalAvailableMinutes = bays.length * 10 * 60 * 7; // bays * hours * days
    const totalBookedMinutes = bookings.reduce((sum, b) => sum + b.duration, 0);

    return {
      studioId: args.studioId,
      totalBays: bays.length,
      totalBookings: bookings.length,
      totalBookedMinutes,
      totalAvailableMinutes,
      utilizationPercent: totalAvailableMinutes > 0 
        ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 10000) / 100
        : 0,
      revenuePerBayHour: bookings.length > 0
        ? Math.round(
            bookings.reduce((s, b) => s + b.totalPrice, 0) / 
            (totalBookedMinutes / 60) * bays.length
          )
        : 0,
    };
  },
});

// ============================================
// USER/CUSTOMER AGGREGATES
// ============================================

/**
 * Get customer booking history with stats
 */
export const getUserBookingHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const completed = bookings.filter(b => b.status === "completed");
    const cancelled = bookings.filter(b => b.status === "cancelled");
    const pending = bookings.filter(b => b.status === "pending");

    return {
      totalBookings: bookings.length,
      completed: completed.length,
      cancelled: cancelled.length,
      pending: pending.length,
      totalSpent: completed.reduce((sum, b) => sum + b.totalPrice, 0),
      averageBookingValue: completed.length > 0
        ? Math.round(completed.reduce((sum, b) => sum + b.totalPrice, 0) / completed.length)
        : 0,
      lastBookingDate: completed.length > 0
        ? Math.max(...completed.map(b => b.createdAt))
        : null,
      favoriteServices: getMostFrequentItems(
        completed.flatMap(b => b.itemIds.map(id => ({ id, type: b.itemType }))),
        5
      ),
    };
  },
});

// ============================================
// SERVICE POPULARITY AGGREGATES
// ============================================

/**
 * Get most popular services
 */
export const getPopularServices = query({
  args: {
    studioId: v.optional(v.id("studios")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .filter(q => q.eq(q.field("status"), "completed"))
      .collect();

    const relevantBookings = args.studioId
      ? bookings.filter(b => b.studioId === args.studioId)
      : bookings;

    // Count service usage (simplified - in production use aggregation)
    const serviceCounts = new Map<string, number>();
    
    for (const booking of relevantBookings) {
      if (booking.itemType === "services") {
        for (const serviceId of booking.itemIds) {
          serviceCounts.set(
            serviceId, 
            (serviceCounts.get(serviceId) || 0) + 1
          );
        }
      }
    }

    const sorted = Array.from(serviceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.limit || 10);

    const results = await Promise.all(
      sorted.map(async ([serviceId, count]) => {
        const service = await ctx.db.get(serviceId as Id<"services">);
        return {
          serviceId,
          serviceName: service?.name || "Unknown",
          category: service?.category || "unknown",
          bookingCount: count,
        };
      })
    );

    return results;
  },
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

type Id<T extends string> = string;

/**
 * Get the most frequent items from a list
 */
function getMostFrequentItems<T>(
  items: { id: string; type: string }[],
  limit: number
): { id: string; type: string; count: number }[] {
  const counts = new Map<string, { id: string; type: string; count: number }>();

  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (counts.has(key)) {
      counts.get(key)!.count++;
    } else {
      counts.set(key, { ...item, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ============================================
// SHARDED COUNTER USAGE EXAMPLE
// ============================================

/**
 * Example of how to use sharded counters with the component.
 * In actual mutations, use:
 * 
 * import { components } from "../_generated/api";
 * import { shardedCounter } from "@convex-dev/sharded-counter";
 * 
 * const counter = components.shardedCounter;
 * await shardedCounter.increment(ctx, counter, "bookings", 1);
 * await shardedCounter.increment(ctx, counter, `studio:${studioId}:revenue`, amount);
 */