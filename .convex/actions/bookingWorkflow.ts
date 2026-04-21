/**
 * ANOLLA SPEC - AI BOOKING WORKFLOW
 * Ticket 6: AI-Powered Autonomous Booking
 * 
 * Orchestrates multi-step booking process using:
 * - @convex-dev/workflow for durable multi-step processes
 * - @convex-dev/workpool for parallel tasks
 * - @convex-dev/agent for AI decision making
 * - Convex Orchestrator for structured outputs
 */

import { action, internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Workpool } from "@convex-dev/workpool";
import { Workflow } from "@convex-dev/workflow";
import { Id } from "./_generated/dataModel";

// ============================================
// WORKFLOW CONFIGURATION
// ============================================

const bookingWorkflowConfig = {
  name: "bookingWorkflow",
  maxParallelism: 5,
};

// ============================================
// TYPES
// ============================================

const bookingStatusEnum = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("no_show")
);

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

const workflowState = v.object({
  currentStep: v.union(
    v.literal("intake"),
    v.literal("availability_check"),
    v.literal("pricing"),
    v.literal("confirmation"),
    v.literal("complete"),
    v.literal("failed")
  ),
  attempts: v.number(),
  error: v.optional(v.string()),
  bookingId: v.optional(v.id("bookings")),
});

// ============================================
// WORKFLOW IMPLEMENTATION
// ============================================

/**
 * Step 1: Intake - Validate and prepare booking request
 */
const intakeStep = internalMutation({
  args: { workflowId: v.id("_workflows"), request: bookingRequest },
  handler: async (ctx, { workflowId, request }) => {
    // Validate user exists
    const user = await ctx.db.get(request.userId);
    if (!user) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "User not found"
      });
      return;
    }

    // Validate vehicle
    const vehicle = await ctx.db.get(request.vehicleId);
    if (!vehicle) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Vehicle not found"
      });
      return;
    }

    // Validate service
    const service = await ctx.db.get(request.serviceId);
    if (!service) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Service not found"
      });
      return;
    }

    // Check service is active
    if (!service.isActive) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "Service is not available"
      });
      return;
    }

    // Move to next step
    await ctx.runMutation(internal.bookingWorkflow.advance, {
      workflowId,
      nextStep: "availability_check"
    });
  },
});

/**
 * Step 2: Availability Check - Find available slots
 */
const availabilityCheckStep = action({
  args: { workflowId: v.id("_workflows"), request: bookingRequest },
  handler: async (ctx, { workflowId, request }) => {
    // Query available slots using calendar action
    const availableSlots = await ctx.runAction(internal.calendar.findAvailableSlots, {
      studioId: request.studioId,
      date: request.preferredDate,
      duration: 60, // Default 1 hour
      bayId: request.bayId ?? null,
    });

    if (availableSlots.length === 0) {
      await ctx.runMutation(internal.bookingWorkflow.fail, {
        workflowId,
        error: "No available slots found for the requested date"
      });
      return;
    }

    // Use first available slot
    const slot = availableSlots[0];

    await ctx.runMutation(internal.bookingWorkflow.advance, {
      workflowId,
      nextStep: "pricing",
      context: { slot },
    });

    return slot;
  },
});

/**
 * Step 3: Pricing - Calculate dynamic price
 */
const pricingStep = action({
  args: {
    workflowId: v.id("_workflows"),
    request: bookingRequest,
    slot: v.object({ bayId: v.id("bays"), startTime: v.number() }),
  },
  handler: async (ctx, { workflowId, request, slot }) => {
    // Calculate dynamic price
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
      context: { price, slot },
    });

    return { price, slot };
  },
});

/**
 * Step 4: Confirmation - Create booking
 */
const confirmationStep = mutation({
  args: {
    workflowId: v.id("_workflows"),
    request: bookingRequest,
    slot: v.object({ bayId: v.id("bays"), startTime: v.number() }),
    price: v.number(),
  },
  handler: async (ctx, { workflowId, request, slot, price }) => {
    // Create booking
    const bookingId = await ctx.db.insert("bookings", {
      userId: request.userId,
      studioId: request.studioId,
      vehicleId: request.vehicleId,
      serviceId: request.serviceId,
      bayId: slot.bayId,
      startTime: slot.startTime,
      duration: 60, // Default 1 hour
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

/**
 * Fail workflow
 */
const failStep = internalMutation({
  args: { workflowId: v.id("_workflows"), error: v.string() },
  handler: async (ctx, { workflowId, error }) => {
    await ctx.db.patch(workflowId, {
      currentStep: "failed",
      error,
    });
  },
});

/**
 * Advance to next step
 */
const advanceStep = internalMutation({
  args: {
    workflowId: v.id("_workflows"),
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
    await ctx.db.patch(workflowId, { currentStep: nextStep });
  },
});

/**
 * Complete workflow
 */
const completeStep = internalMutation({
  args: { workflowId: v.id("_workflows"), bookingId: v.id("bookings") },
  handler: async (ctx, { workflowId, bookingId }) => {
    await ctx.db.patch(workflowId, {
      currentStep: "complete",
      bookingId,
    });
  },
});

// ============================================
// PUBLIC API
// ============================================

/**
 * Start AI-powered booking workflow
 */
export const startBookingWorkflow = action({
  args: bookingRequest,
  handler: async (ctx, request) => {
    // Create workflow instance
    const workflow = new Workflow(ctx, components.bookingWorkflow);

    const workflowId = await workflow.create({
      currentStep: "intake",
      attempts: 0,
    });

    // Start intake step
    await ctx.runMutation(internal.bookingWorkflow.intake, {
      workflowId,
      request,
    });

    return workflowId;
  },
});

/**
 * Get workflow status
 */
export const getWorkflowStatus = query({
  args: { workflowId: v.id("_workflows") },
  handler: async (ctx, { workflowId }) => {
    const workflow = await ctx.db.get(workflowId);
    if (!workflow) return null;

    return {
      currentStep: workflow.currentStep,
      attempts: workflow.attempts,
      error: workflow.error,
      bookingId: workflow.bookingId,
    };
  },
});

/**
 * Cancel booking workflow
 */
export const cancelBookingWorkflow = mutation({
  args: { workflowId: v.id("_workflows") },
  handler: async (ctx, { workflowId }) => {
    const workflow = new Workflow(ctx, components.bookingWorkflow);
    await workflow.cancel(ctx, workflowId);

    await ctx.db.patch(workflowId, {
      currentStep: "failed",
      error: "Cancelled by user",
    });
  },
});

// ============================================
// PARALLEL TASK WORKPOOL
// ============================================

const notificationPool = new Workpool(components.notificationPool, {
  maxParallelism: 10,
});

/**
 * Send booking confirmation notification
 */
export const sendBookingConfirmation = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.runQuery(internal.bookings.getById, { bookingId });
    if (!booking) return;

    // Queue notification
    await notificationPool.enqueueAction(ctx, internal.notifications.sendBookingConfirmed, {
      bookingId,
    });
  },
});

export {}; // Ensure module exports something