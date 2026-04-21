/**
 * ANOLLA SPEC - BOOKING ACTIONS WITH DYNAMIC PRICING
 * Ticket 3: Dynamic Pricing Engine Integration
 * 
 * Booking actions that integrate with calculatePrice.
 */

import { mutation, action } from "../../convex/_generated/server";
import { v } from "convex/values";
import { calculatePrice, priceCalculationInput } from "./pricing";

/**
 * Create a new booking with dynamic pricing
 */
export const createBooking = mutation({
  args: {
    userId: v.id("users"),
    vehicleId: v.id("vehicles"),
    serviceIds: v.array(v.id("services")),
    packageId: v.optional(v.id("packages")),
    studioId: v.id("studios"),
    bayId: v.optional(v.id("bays")),
    detailerId: v.optional(v.id("detailers")),
    startTime: v.number(),
    duration: v.number(),
    dirtLevel: priceCalculationInput.fields.dirtLevel,
    jobType: priceCalculationInput.fields.jobType,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { 
      userId, vehicleId, serviceIds, packageId, studioId, bayId, 
      detailerId, startTime, duration, dirtLevel, jobType, notes 
    } = args;
    
    // Get vehicle class from vehicle
    const vehicle = await ctx.db.get(vehicleId);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    
    // Calculate price using the dynamic pricing engine
    const priceResult = await calculatePrice(ctx, {
      vehicleClass: vehicle.vehicleClass,
      dirtLevel,
      serviceIds,
      packageId,
      studioId,
      bayId,
      serviceDate: Math.floor(startTime / 1000),  // Convert ms to seconds
      jobType,
    });
    
    // Create the booking with calculated price
    const bookingId = await ctx.db.insert("bookings", {
      userId,
      vehicleId,
      studioId,
      bayId,
      detailerId,
      jobType,
      itemType: packageId ? "package" : "services",
      itemIds: packageId ? [] : serviceIds,
      dirtLevel,
      startTime,
      duration,
      endTime: startTime + duration * 60 * 1000,
      status: "pending",
      basePrice: priceResult.basePrice,
      totalPrice: priceResult.finalPrice,
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return {
      bookingId,
      price: priceResult.finalPrice,
      breakdown: priceResult.breakdown,
    };
  },
});

/**
 * Update booking pricing (recalculate)
 */
export const recalculateBookingPrice = mutation({
  args: {
    bookingId: v.id("bookings"),
    newDirtLevel: v.optional(priceCalculationInput.fields.dirtLevel),
    newDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { bookingId, newDirtLevel, newDate } = args;
    
    // Get existing booking
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    // Get vehicle for class
    const vehicle = await ctx.db.get(booking.vehicleId);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    
    // Recalculate price
    const priceResult = await calculatePrice(ctx, {
      vehicleClass: vehicle.vehicleClass,
      dirtLevel: newDirtLevel ?? booking.dirtLevel ?? "moderate",
      serviceIds: booking.itemIds,
      packageId: booking.packageId,
      studioId: booking.studioId,
      bayId: booking.bayId,
      serviceDate: newDate 
        ? Math.floor(newDate / 1000) 
        : Math.floor(booking.startTime / 1000),
      jobType: booking.jobType,
    });
    
    // Update booking
    await ctx.db.patch(bookingId, {
      dirtLevel: newDirtLevel ?? booking.dirtLevel,
      startTime: newDate ?? booking.startTime,
      basePrice: priceResult.basePrice,
      totalPrice: priceResult.finalPrice,
      updatedAt: Date.now(),
    });
    
    return {
      price: priceResult.finalPrice,
      breakdown: priceResult.breakdown,
    };
  },
});

/**
 * Confirm booking ( Locks in price)
 */
export const confirmBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    const { bookingId } = args;
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      throw new Error("Booking cannot be confirmed");
    }
    
    await ctx.db.patch(bookingId, {
      status: "confirmed",
      updatedAt: Date.now(),
    });
    
    return bookingId;
  },
});

/**
 * Cancel booking
 */
export const cancelBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { bookingId, reason } = args;
    
    const booking = await ctx.db.get(bookingId);
    if (!booking) {
      throw new Error("Booking not found");
    }
    
    await ctx.db.patch(bookingId, {
      status: "cancelled",
      notes: reason ? `${booking.notes ?? ""}\n\nCancellation: ${reason}` : booking.notes,
      updatedAt: Date.now(),
    });
    
    return bookingId;
  },
});

// ============================================
// BOOKING QUERIES WITH PRICING
// ============================================

/**
 * Get booking with price details
 */
export const getBookingWithPrice = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    
    // Get related data
    const vehicle = await ctx.db.get(booking.vehicleId);
    const studio = await ctx.db.get(booking.studioId);
    const bay = booking.bayId ? await ctx.db.get(booking.bayId) : null;
    
    return {
      ...booking,
      vehicle,
      studio,
      bay,
    };
  },
});