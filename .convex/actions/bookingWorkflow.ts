/**
 * ANOLLA SPEC - AI BOOKING WORKFLOW
 * Ticket 6: AI-Powered Autonomous Booking
 * 
 * Multi-step booking workflow using:
 * - @convex-dev/workflow for durable execution
 * - @convex-dev/workpool for parallel tasks
 */

import { action, internal, internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Workpool } from "@convex-dev/workpool";

// ============================================
// TYPES
// ============================================

const bookingRequest = v.object({
  userId: v.id("users"),
  studioId: v.id("studios"),
  vehicleId: v.id("vehicles"),
  serviceId: v.id("services"),
  bayId: v.optional(v.id("bays")),
  preferredDate: v.number(),
  preferredTime: v.optional(v.string()),
  notes: v.optional(v.string()),
});

// ============================================
// STEP 1: INTAKE
// ============================================

export const intake = internalMutation({
  args: { workflowId: v.id("workflows"), request: bookingRequest },
  handler: async (ctx, { workflowId, request }) => {
    // Validate user exists
    const user = await ctx.db.get(request.userId);
    if (!user) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "User not found",
      });
      return;
    }

    // Validate vehicle
    const vehicle = await ctx.db.get(request.vehicleId);
    if (!vehicle) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Vehicle not found",
      });
      return;
    }

    // Validate service
    const service = await ctx.db.get(request.serviceId);
    if (!service) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Service not found",
      });
      return;
    }

    // Check service is active
    if (!service.isActive) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Service is not available",
      });
      return;
    }

    // Move to next step
    await ctx.runMutation(internal.bookingWorkflow.advance, {
      workflowId,
      nextStep: "availability_check",
      context: { request },
    });
  },
});

// ============================================
// STEP 2: AVAILABILITY CHECK
// ============================================

export const availabilityCheck = action({
  args: { workflowId: v.id("workflows"), request: bookingRequest },
  handler: async (ctx, { workflowId, request }) => {
    const availableSlots = await ctx.runAction(internal.calendar.findAvailableSlots, {
      studioId: request.studioId,
      date: request.preferredDate,
      duration: 60,
      bayId: request.bayId ?? null,
    });

    if (availableSlots.length === 0) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "No available slots found",
      });
      return;
    }

    const slot = availableSlots[0];

    await ctx.runMutation(internal.bookingWorkflow.advance, {
      workflowId,
      nextStep: "pricing",
      context: { request, slot },
    });

    return slot;
  },
});

// ============================================
// STEP 3: PRICING
// ============================================

export const pricing = action({
  args: {
    workflowId: v.id("workflows"),
    request: bookingRequest,
    slot: v.object({ bayId: v.id("bays"), startTime: v.number() }),
  },
  handler: async (ctx, { workflowId, request, slot }) => {
    const price = await ctx.runAction(internal.pricing.calculatePrice, {
      serviceId: request.serviceId,
      vehicleId: request.vehicleId,
      studioId: request.studioId,
      bayId: slot.bayId,
      startTime: slot.startTime,
    });

    await ctx.runMutation(internal.bookingWorkflow.advance, {
      workflowId,
      nextStep: "confirmation",
      context: { request, slot, price },
    });

    return { price, slot };
  },
});

// ============================================
// STEP 4: CONFIRMATION
// ============================================

export const confirmation = mutation({
  args: {
    workflowId: v.id("workflows"),
    request: bookingRequest,
    slot: v.object({ bayId: v.id("bays"), startTime: v.number() }),
    price: v.number(),
  },
  handler: async (ctx, { workflowId, request, slot, price }) => {
    const bookingId = await ctx.db.insert("bookings", {
      userId: request.userId,
      studioId: request.studioId,
      vehicleId: request.vehicleId,
      serviceId: request.serviceId,
      bayId: slot.bayId,
      startTime: slot.startTime,
      duration: 60,
      endTime: slot.startTime + 60 * 60 * 1000,
      price,
      status: "confirmed",
      notes: request.notes ?? "",
      createdAt: Date.now(),
    });

    await ctx.runMutation(internal.bookingWorkflow.complete, {
      workflowId,
      bookingId,
    });

    return bookingId;
  },
});

// ============================================
// WORKFLOW CONTROL
// ============================================

export const fail = internalMutation({
  args: { workflowId: v.id("workflows"), error: v.string() },
  handler: async (ctx, { workflowId, error }) => {
    await ctx.db.patch(workflowId, {
      currentStep: "failed",
      error,
    });
  },
});

export const advance = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    nextStep: v.union(
      v.literal("intake"),
      v.literal("availability_check"),
      v.literal("pricing"),
      v.literal("confirmation"),
      v.literal("complete"),
      v.literal("failed")
    ),
    context: v.optional(v.any()),
  },
  handler: async (ctx, { workflowId, nextStep, context }) => {
    await ctx.db.patch(workflowId, {
      currentStep: nextStep,
    });
  },
});

export const complete = internalMutation({
  args: { workflowId: v.id("workflows"), bookingId: v.id("bookings") },
  handler: async (ctx, { workflowId, bookingId }) => {
    await ctx.db.patch(workflowId, {
      currentStep: "complete",
      bookingId,
    });
  },
});

// ============================================
// PARALLEL NOTIFICATIONS
// ============================================

const notificationPool = new Workpool(components.notificationPool, {
  maxParallelism: 10,
});

/**
 * Send booking confirmation notification
 */
export const sendConfirmation = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.runQuery(internal.bookings.getById, { bookingId });
    if (!booking) return;

    await notificationPool.enqueueAction(
      ctx,
      internal.notifications.sendBookingConfirmed,
      { bookingId }
    );
  },
});