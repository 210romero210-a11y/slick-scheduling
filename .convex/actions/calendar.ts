/**
 * ANOLLA SPEC - UNIFIED CALENDAR & BAY MANAGEMENT
 * Ticket 5: Unified Calendar & Bay Management
 * 
 * Provides unified calendar views with bay availability:
 * - Day/Week/Month calendar views
 * - Real-time bay status tracking
 * - Booking timeline visualization
 * - Conflict detection and resolution
 * - Drag-and-drop scheduling
 */

import { action, mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// CALENDAR TYPES
// ============================================

// Calendar view types
export const calendarViewType = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month")
);

// Bay status types
export const bayStatusType = v.union(
  v.literal("available"),
  v.literal("occupied"),
  v.literal("maintenance"),
  v.literal("reserved")
);

// Time slot representation
const timeSlotInput = v.object({
  startTime: v.number(),  // Unix timestamp (ms)
  endTime: v.number(),    // Unix timestamp (ms)
  bayId: v.id("bays"),
});

// Calendar day representation
const calendarDayInput = v.object({
  date: v.number(),  // Unix timestamp for the day
  studioId: v.id("studios"),
});

// ============================================
// CONFIGURATION
// ============================================

// Operating hours (in 24-hour format)
const DEFAULT_OPENING_HOUR = 8;   // 8 AM
const DEFAULT_CLOSING_HOUR = 18;  // 6 PM
const SLOT_DURATION_MINUTES = 30; // 30-minute slots

// ============================================
// QUERIES
// ============================================

/**
 * Get calendar view for a specific date range
 * Returns bookings organized by day for the given view
 */
export const getCalendarView = query({
  args: {
    studioId: v.id("studios"),
    startDate: v.number(),  // Unix timestamp
    endDate: v.number(),    // Unix timestamp
    viewType: calendarViewType,
    bayId: v.optional(v.id("bays")),
  },
  handler: async (ctx, args) => {
    const { studioId, startDate, endDate, viewType, bayId } = args;
    
    // Query bookings in the date range
    let bookingsQuery = ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId));
    
    const allBookings = await bookingsQuery.collect();
    
    // Filter by date range and optional bay
    const filteredBookings = allBookings.filter((booking) => {
      const bookingStart = booking.startTime;
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      
      // Check date range overlap
      const overlaps = bookingStart < endDate && bookingEnd > startDate;
      
      // Filter by bay if specified
      if (bayId && booking.bayId !== bayId) {
        return false;
      }
      
      return overlaps;
    });
    
    // Group bookings by day
    const bookingsByDay = groupBookingsByDay(filteredBookings, viewType, startDate, endDate);
    
    return {
      bookingsByDay,
      viewType,
      startDate,
      endDate,
    };
  },
});

/**
 * Get bay availability for a specific time range
 */
export const getBayAvailability = query({
  args: {
    studioId: v.id("studios"),
    startTime: v.number(),
    endTime: v.number(),
    bayId: v.optional(v.id("bays")),
  },
  handler: async (ctx, args) => {
    const { studioId, startTime, endTime, bayId } = args;
    
    // Get all bays for the studio
    const bays = await ctx.db
      .query("bays")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    const relevantBays = bayId ? bays.filter((b) => b._id === bayId) : bays;
    
    // Get all bookings that overlap with the time range
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    const overlappingBookings = allBookings.filter((booking) => {
      const bookingStart = booking.startTime;
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      return bookingStart < endTime && bookingEnd > startTime;
    });
    
    // Calculate availability for each bay
    const availability = relevantBays.map((bay) => {
      const bayBookings = overlappingBookings.filter((b) => b.bayId === bay._id);
      
      // Generate time slots
      const slots = generateTimeSlots(startTime, endTime, bay._id, bayBookings);
      
      return {
        bayId: bay._id,
        bayName: bay.name,
        bayType: bay.bayType,
        status: bay.isActive ? "available" : "maintenance",
        slots,
        bookedCount: bayBookings.length,
        totalCapacity: bay.maxCapacity || 1,
      };
    });
    
    return availability;
  },
});

/**
 * Get bay status summary for dashboard
 */
export const getBayStatusSummary = query({
  args: {
    studioId: v.id("studios"),
  },
  handler: async (ctx, args) => {
    const { studioId } = args;
    
    // Get all bays
    const bays = await ctx.db
      .query("bays")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    // Get today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    const todayBookings = allBookings.filter((booking) => {
      return booking.startTime >= today.getTime() && booking.startTime < tomorrow.getTime();
    });
    
    // Calculate summary
    const summary = {
      totalBays: bays.length,
      availableBays: bays.filter((b) => b.isActive).length,
      occupiedBays: 0,
      maintenanceBays: bays.filter((b) => !b.isActive).length,
      todayBookings: todayBookings.length,
      upcomingBookings: todayBookings.filter((b) => b.startTime > Date.now()).length,
    };
    
    // Count currently occupied (bookings that overlap with now) - deduplicate by bayId
    const now = Date.now();
    const occupiedBayIds = new Set<string>();
    todayBookings.forEach((b) => {
      const endTime = getBookingEnd(b);
      if (b.startTime <= now && endTime > now) {
        occupiedBayIds.add(b.bayId);
      }
    });
    summary.occupiedBays = occupiedBayIds.size;
    
    return summary;
  },
});

/**
 * Get time slots for a specific bay on a specific date
 */
export const getTimeSlots = query({
  args: {
    bayId: v.id("bays"),
    date: v.number(),  // Unix timestamp for the day
  },
  handler: async (ctx, args) => {
    const { bayId, date } = args;
    
    // Get the bay
    const bay = await ctx.db.get(bayId);
    if (!bay) {
      throw new Error("Bay not found");
    }
    
    // Calculate start and end of day
    const dayStart = new Date(date);
    dayStart.setHours(DEFAULT_OPENING_HOUR, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(DEFAULT_CLOSING_HOUR, 0, 0, 0);
    
    // Get bookings for this bay on this day
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_bay", (q) => q.eq("bayId", bayId))
      .collect();
    
    const dayBookings = allBookings.filter((booking) => {
      const bookingEnd = getBookingEnd(booking);
      // Check for overlap with day (bookings that start before dayEnd AND end after dayStart)
      return booking.startTime < dayEnd.getTime() && bookingEnd > dayStart.getTime();
    });
    
    // Generate slots
    const slots = generateTimeSlots(dayStart.getTime(), dayEnd.getTime(), bayId, dayBookings);
    
    return {
      bayId,
      bayName: bay.name,
      date: dayStart.getTime(),
      slots,
    };
  },
});

// ============================================
// ACTIONS
// ============================================

/**
 * Check if a time slot is available
 */
export const checkSlotAvailability = action({
  args: {
    bayId: v.id("bays"),
    startTime: v.number(),
    endTime: v.number(),
    excludeBookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    const { bayId, startTime, endTime, excludeBookingId } = args;
    
    // Get all bookings for this bay
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_bay", (q) => q.eq("bayId", bayId))
      .collect();
    
    // Check for conflicts
    const conflicts = bookings.filter((booking) => {
      // Skip the booking being edited
      if (excludeBookingId && booking._id === excludeBookingId) {
        return false;
      }
      
      const bookingStart = booking.startTime;
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      
      // Check for overlap
      return bookingStart < endTime && bookingEnd > startTime;
    });
    
    return {
      available: conflicts.length === 0,
      conflicts: conflicts.length,
      conflictingBookings: conflicts.map((b) => ({
        id: b._id,
        startTime: b.startTime,
        endTime: b.endTime,
      })),
    };
  },
});

/**
 * Find available slots for a booking request
 */
export const findAvailableSlots = action({
  args: {
    studioId: v.id("studios"),
    date: v.number(),
    duration: v.number(),  // Duration in minutes
    bayId: v.optional(v.id("bays")),
  },
  handler: async (ctx, args) => {
    const { studioId, date, duration, bayId } = args;
    
    const dayStart = new Date(date);
    dayStart.setHours(DEFAULT_OPENING_HOUR, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(DEFAULT_CLOSING_HOUR, 0, 0, 0);
    
    // Get relevant bays
    let bays;
    if (bayId) {
      const specificBay = await ctx.db.get(bayId);
      bays = specificBay ? [specificBay] : [];
    } else {
      bays = await ctx.db
        .query("bays")
        .withIndex("by_studio", (q) => q.eq("studioId", studioId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }
    
    // Get all bookings for the day
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    const dayBookings = allBookings.filter((booking) => {
      return booking.startTime >= dayStart.getTime() && booking.startTime < dayEnd.getTime();
    });
    
    const availableSlots: Array<{
      bayId: string;
      bayName: string;
      startTime: number;
      endTime: number;
    }> = [];
    
    // Check each bay for available slots
    for (const bay of bays) {
      const bayBookings = dayBookings.filter((b) => b.bayId === bay._id);
      const slots = generateAvailableSlots(
        dayStart.getTime(),
        dayEnd.getTime(),
        duration * 60 * 1000, // Convert to ms
        bay._id,
        bayBookings
      );
      
      for (const slot of slots) {
        availableSlots.push({
          bayId: bay._id,
          bayName: bay.name,
          startTime: slot.start,
          endTime: slot.end,
        });
      }
    }
    
    // Sort by start time
    availableSlots.sort((a, b) => a.startTime - b.startTime);
    
    return {
      date: dayStart.getTime(),
      duration,
      availableSlots,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Update bay status (for manual override)
 */
export const updateBayStatus = mutation({
  args: {
    bayId: v.id("bays"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { bayId, isActive } = args;
    
    await ctx.db.patch(bayId, {
      isActive,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get booking end time (derived from startTime + duration or endTime)
 */
export function getBookingEnd(booking: { startTime: number; endTime?: number; duration?: number }): number {
  return booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
}

/**
 * Check if two bookings overlap
 */
function bookingsOverlap(
  a: { startTime: number; endTime?: number; duration?: number },
  bStart: number,
  bEnd: number
): boolean {
  const aEnd = getBookingEnd(a);
  return a.startTime < bEnd && aEnd > bStart;
}

/**
 * Group bookings by day based on view type
 */
function groupBookingsByDay(
  bookings: Array<{
    _id: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    [key: string]: unknown;
  }>,
  viewType: string,
  startDate: number,
  endDate: number
): Record<string, typeof bookings> {
  const result: Record<string, typeof bookings> = {};
  
  // Generate date keys based on view type
  const current = new Date(startDate);
  while (current.getTime() < endDate) {
    let dateKey: string;
    let nextDate: Date;
    
    switch (viewType) {
      case "day":
        dateKey = current.toISOString().split("T")[0];
        nextDate = new Date(current);
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case "week":
        // Group by week start (Sunday)
        const dayOfWeek = current.getDay();
        const weekStart = new Date(current);
        weekStart.setDate(current.getDate() - dayOfWeek);
        dateKey = weekStart.toISOString().split("T")[0];
        nextDate = new Date(weekStart);
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "month":
        dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
        nextDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      default:
        dateKey = current.toISOString().split("T")[0];
        nextDate = new Date(current);
        nextDate.setDate(nextDate.getDate() + 1);
    }
    
    // Filter bookings for this period
    result[dateKey] = bookings.filter((booking) => {
      const bookingDate = new Date(booking.startTime);
      switch (viewType) {
        case "day":
          return bookingDate.toISOString().split("T")[0] === dateKey;
        case "week":
          const wStart = new Date(dateKey);
          const wEnd = new Date(wStart);
          wEnd.setDate(wEnd.getDate() + 7);
          return booking.startTime >= wStart.getTime() && booking.startTime < wEnd.getTime();
        case "month":
          return `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, "0")}` === dateKey;
        default:
          return true;
      }
    });
    
    current.setTime(nextDate.getTime());
  }
  
  return result;
}

/**
 * Generate time slots for a bay
 */
function generateTimeSlots(
  startTime: number,
  endTime: number,
  bayId: string,
  bookings: Array<{
    _id: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status?: string;
    [key: string]: unknown;
  }>
): Array<{
  id: string;
  startTime: number;
  endTime: number;
  status: string;
  bookingId?: string;
}> {
  const slots: Array<{
    id: string;
    startTime: number;
    endTime: number;
    status: string;
    bookingId?: string;
  }> = [];
  
  const slotDuration = SLOT_DURATION_MINUTES * 60 * 1000;
  let currentTime = startTime;
  
  while (currentTime < endTime) {
    const slotEnd = currentTime + slotDuration;
    
    // Find if any booking occupies this slot
    const occupyingBooking = bookings.find((booking) => {
      const bookingStart = booking.startTime;
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      return bookingStart < slotEnd && bookingEnd > currentTime;
    });
    
    slots.push({
      id: `${bayId}-${currentTime}`,
      startTime: currentTime,
      endTime: slotEnd,
      status: occupyingBooking ? "occupied" : "available",
      bookingId: occupyingBooking?._id,
    });
    
    currentTime = slotEnd;
  }
  
  return slots;
}

/**
 * Generate available slots for a duration
 */
function generateAvailableSlots(
  startTime: number,
  endTime: number,
  duration: number,
  bayId: string,
  bookings: Array<{ startTime: number; endTime?: number; duration?: number }>
): Array<{ start: number; end: number }> {
  const slots: Array<{ start: number; end: number }> = [];
  
  let currentTime = startTime;
  const slotDuration = SLOT_DURATION_MINUTES * 60 * 1000;
  
  while (currentTime + duration <= endTime) {
    const slotEnd = currentTime + duration;
    
    // Check for conflicts
    const hasConflict = bookings.some((booking) => {
      const bookingStart = booking.startTime;
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      return bookingStart < slotEnd && bookingEnd > currentTime;
    });
    
    if (!hasConflict) {
      slots.push({ start: currentTime, end: slotEnd });
    }
    
    currentTime += slotDuration;
  }
  
  return slots;
}