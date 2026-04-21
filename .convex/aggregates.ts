import { action } from "./_generated/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

// Booking status counts aggregate
export const getBookingStatusCounts = query({
  args: { studioId: v.optional(v.id("studios")) },
  handler: async (ctx, args) => {
    const bookings = await ctx.db.query("bookings").collect();
    const filtered = args.studioId
      ? bookings.filter(b => b.studioId === args.studioId)
      : bookings;

    const counts = {
      pending: 0,
      confirmed: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    };

    filtered.forEach(booking => {
      counts[booking.status]++;
    });

    return counts;
  },
});

// Studio revenue aggregate
export const getStudioRevenue = query({
  args: { studioId: v.id("studios"), startDate: v.optional(v.number()), endDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const bookings = await ctx.db.query("bookings")
      .filter(q => q.eq(q.field("studioId"), args.studioId))
      .collect();

    const filtered = bookings.filter(b => {
      if (args.startDate && b.createdAt < args.startDate) return false;
      if (args.endDate && b.createdAt > args.endDate) return false;
      return b.status === "completed";
    });

    const revenue = filtered.reduce((sum, b) => sum + b.finalPrice, 0);
    return { totalRevenue: revenue, completedBookings: filtered.length };
  },
});

// User booking history aggregate
export const getUserBookingHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db.query("bookings")
      .filter(q => q.eq(q.field("userId"), args.userId))
      .collect();

    const history = {
      totalBookings: bookings.length,
      completed: bookings.filter(b => b.status === "completed").length,
      cancelled: bookings.filter(b => b.status === "cancelled").length,
      totalSpent: bookings
        .filter(b => b.status === "completed")
        .reduce((sum, b) => sum + b.finalPrice, 0),
    };

    return history;
  },
});

// Bay utilization aggregate
export const getBayUtilization = query({
  args: { studioId: v.id("studios"), date: v.number() },
  handler: async (ctx, args) => {
    const bays = await ctx.db.query("bays")
      .filter(q => q.eq(q.field("studioId"), args.studioId))
      .collect();

    const startOfDay = args.date;
    const endOfDay = args.date + 86400000; // 24 hours in ms

    const bookings = await ctx.db.query("bookings")
      .filter(q => q.eq(q.field("studioId"), args.studioId))
      .filter(q => q.gte(q.field("startTime"), startOfDay))
      .filter(q => q.lt(q.field("startTime"), endOfDay))
      .collect();

    const utilization = bays.map(bay => {
      const bayBookings = bookings.filter(b => b.bayId === bay._id);
      const totalBookedTime = bayBookings.reduce((sum, b) => sum + b.duration, 0);
      const utilizationPercent = (totalBookedTime / 86400) * 100; // assuming 24h operation
      return {
        bayId: bay._id,
        bayName: bay.name,
        bookingsCount: bayBookings.length,
        utilizationPercent: Math.min(utilizationPercent, 100),
      };
    });

    return utilization;
  },
});