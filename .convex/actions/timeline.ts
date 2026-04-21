/**
 * ANOLLA SPEC - BOOKING TIMELINE VIEW
 * Ticket 5: Unified Calendar & Bay Management
 * 
 * Provides timeline/Gantt-style visualization of bookings
 * with drag-and-drop rescheduling support.
 */

import { action, mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// TIMELINE TYPES
// ============================================

const timelineRequestInput = v.object({
  studioId: v.id("studios"),
  startDate: v.number(),
  endDate: v.number(),
  bayIds: v.optional(v.array(v.id("bays"))),
});

const rescheduleInput = v.object({
  bookingId: v.id("bookings"),
  newStartTime: v.number(),
  newBayId: v.optional(v.id("bays")),
});

// ============================================
// QUERIES
// ============================================

/**
 * Get timeline view with bookings positioned on a time axis
 * Returns bookings grouped by bay for Gantt-style display
 */
export const getTimelineView = query({
  args: timelineRequestInput,
  handler: async (ctx, args) => {
    const { studioId, startDate, endDate, bayIds } = args;
    
    // Get bays
    let baysQuery = ctx.db
      .query("bays")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId));
    
    const allBays = await baysQuery.collect();
    const relevantBays = bayIds 
      ? allBays.filter((b) => bayIds.includes(b._id))
      : allBays;
    
    // Get bookings in range
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .collect();
    
    const filteredBookings = allBookings.filter((booking) => {
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      return booking.startTime < endDate && bookingEnd > startDate;
    });
    
    // Group by bay
    const timelineData = relevantBays.map((bay) => {
      const bayBookings = filteredBookings
        .filter((b) => b.bayId === bay._id)
        .map((booking) => ({
          id: booking._id,
          startTime: booking.startTime,
          endTime: booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000),
          duration: booking.duration || 60,
          status: booking.status,
          vehicleInfo: booking.vehicleId ? {
            licensePlate: "Pending", // Would join with vehicles table
          } : null,
          customerInfo: booking.userId ? {
            name: "Pending", // Would join with users table
          } : null,
        }))
        .sort((a, b) => a.startTime - b.startTime);
      
      return {
        bayId: bay._id,
        bayName: bay.name,
        bayType: bay.bayType,
        isActive: bay.isActive,
        bookings: bayBookings,
      };
    });
    
    // Calculate summary
    const summary = {
      totalBookings: filteredBookings.length,
      confirmedCount: filteredBookings.filter((b) => b.status === "confirmed").length,
      pendingCount: filteredBookings.filter((b) => b.status === "pending").length,
      completedCount: filteredBookings.filter((b) => b.status === "completed").length,
      cancelledCount: filteredBookings.filter((b) => b.status === "cancelled").length,
    };
    
    return {
      timelineData,
      summary,
      startDate,
      endDate,
    };
  },
});

/**
 * Get booking details for timeline tooltip/panel
 */
export const getBookingDetails = query({
  args: {
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    const { bookingId } = args;
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    // Get related entities (would be joins in SQL)
    const vehicle = booking.vehicleId 
      ? await ctx.db.get(booking.vehicleId as string)
      : null;
    
    const user = booking.userId 
      ? await ctx.db.get(booking.userId as string)
      : null;
    
    const bay = booking.bayId 
      ? await ctx.db.get(booking.bayId as string)
      : null;
    
    const studio = booking.studioId 
      ? await ctx.db.get(booking.studioId as string)
      : null;
    
    const detailer = booking.detailerId 
      ? await ctx.db.get(booking.detailerId as string)
      : null;
    
    return {
      booking: {
        ...booking,
        endTime: booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000),
      },
      vehicle,
      user,
      bay,
      studio,
      detailer,
    };
  },
});

/**
 * Get conflict information for a proposed booking time
 */
export const getBookingConflicts = query({
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
    
    // Filter to overlapping time range
    const conflicts = bookings
      .filter((booking) => {
        if (excludeBookingId && booking._id === excludeBookingId) {
          return false;
        }
        
        const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
        return booking.startTime < endTime && bookingEnd > startTime;
      })
      .map((booking) => ({
        id: booking._id,
        startTime: booking.startTime,
        endTime: booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000),
        status: booking.status,
      }));
    
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      suggestedAlternative: conflicts.length > 0 
        ? findNextAvailableSlot(startTime, endTime, bookings)
        : null,
    };
  },
});

// ============================================
// ACTIONS & MUTATIONS
// ============================================

/**
 * Reschedule a booking (drag-and-drop in timeline)
 */
export const rescheduleBooking = mutation({
  args: rescheduleInput,
  handler: async (ctx, args) => {
    const { bookingId, newStartTime, newBayId } = args;
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    // Calculate new end time
    const duration = booking.duration || 60;
    const newEndTime = newStartTime + duration * 60 * 1000;
    
    // Check for conflicts if bay changed or time changed significantly
    if (newBayId !== booking.bayId || Math.abs(newStartTime - booking.startTime) > 60000) {
      const targetBayId = newBayId || booking.bayId;
      
      const existingBookings = await ctx.db
        .query("bookings")
        .withIndex("by_bay", (q) => q.eq("bayId", targetBayId))
        .collect();
      
      const hasConflict = existingBookings.some((b) => {
        if (b._id === bookingId) return false;
        
        const bEnd = b.endTime || (b.startTime + (b.duration || 60) * 60 * 1000);
        return b.startTime < newEndTime && bEnd > newStartTime;
      });
      
      if (hasConflict) {
        throw new Error("Cannot reschedule: time slot conflicts with existing booking");
      }
    }
    
    // Update booking
    await ctx.db.patch(bookingId, {
      startTime: newStartTime,
      endTime: newEndTime,
      bayId: newBayId || booking.bayId,
      updatedAt: Date.now(),
    });
    
    return { success: true, bookingId };
  },
});

/**
 * Quick reschedule - find next available slot
 */
export const quickReschedule = mutation({
  args: {
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    const { bookingId } = args;
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    const duration = booking.duration || 60;
    const originalDuration = duration * 60 * 1000;
    
    // Try to find next available slot on same day
    const dayStart = new Date(booking.startTime);
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(booking.startTime);
    dayEnd.setHours(18, 0, 0, 0);
    
    const bayBookings = await ctx.db
      .query("bookings")
      .withIndex("by_bay", (q) => q.eq("bayId", booking.bayId as string))
      .collect();
    
    const dayBookings = bayBookings.filter((b) => {
      const bDate = new Date(b.startTime).toDateString();
      return bDate === dayStart.toDateString() && b._id !== bookingId;
    });
    
    // Find next available slot (try 30-min increments)
    let searchTime = booking.startTime + 30 * 60 * 1000; // Start 30 min later
    
    while (searchTime + originalDuration <= dayEnd.getTime()) {
      const hasConflict = dayBookings.some((b) => {
        const bEnd = b.endTime || (b.startTime + (b.duration || 60) * 60 * 1000);
        return b.startTime < searchTime + originalDuration && bEnd > searchTime;
      });
      
      if (!hasConflict) {
        // Found a slot - reschedule
        await ctx.db.patch(bookingId, {
          startTime: searchTime,
          endTime: searchTime + originalDuration,
          updatedAt: Date.now(),
        });
        
        return { 
          success: true, 
          newStartTime: searchTime,
          message: `Rescheduled to ${new Date(searchTime).toLocaleTimeString()}`,
        };
      }
      
      searchTime += 30 * 60 * 1000;
    }
    
    throw new Error("No available slots found on this day");
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find next available slot after a conflict
 */
function findNextAvailableSlot(
  startTime: number,
  endTime: number,
  bookings: Array<{ startTime: number; endTime?: number; duration?: number }>
): { startTime: number; endTime: number } | null {
  const duration = endTime - startTime;
  const slotDuration = 30 * 60 * 1000; // 30 minutes
  
  let searchTime = endTime;
  const maxSearchTime = startTime + 24 * 60 * 60 * 1000; // Search within 24 hours
  
  while (searchTime < maxSearchTime) {
    const searchEnd = searchTime + duration;
    
    const hasConflict = bookings.some((booking) => {
      const bookingEnd = booking.endTime || (booking.startTime + (booking.duration || 60) * 60 * 1000);
      return booking.startTime < searchEnd && bookingEnd > searchTime;
    });
    
    if (!hasConflict) {
      return { startTime: searchTime, endTime: searchEnd };
    }
    
    searchTime += slotDuration;
  }
  
  return null;
}