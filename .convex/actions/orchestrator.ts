/**
 * ANOLLA SPEC - AI ORCHESTRATOR
 * 
 * Uses @akshatgiri/convex-orchestrator for structured outputs.
 */

import { action, internal } from "../_generated/server";
import { v } from "convex/values";
import { chatModelConfig, OLLAMA_BASE_URL } from "./llm";

// ============================================
// TYPES
// ============================================

const orchestratorStep = v.object({
  id: v.string(),
  action: v.string(),
  args: v.any(),
  retry: v.optional(v.number()),
});

const orchestratorPlan = v.object({
  steps: v.array(orchestratorStep),
  rollback: v.optional(v.string()),
});

// ============================================
// ORCHESTRATOR IMPLEMENTATION
// ============================================

/**
 * Plan booking creation with AI using Ollama
 */
export const planBookingCreation = action({
  args: {
    userId: v.id("users"),
    studioId: v.id("studios"),
    vehicleId: v.id("vehicles"),
    serviceId: v.id("services"),
    preferredDate: v.optional(v.number()),
    naturalLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { naturalLanguage } = args;

    // Build context for AI
    const context = `
You are a booking assistant for Slick Scheduling.
Available actions:
- checkAvailability(studioId, date, duration, bayId?)
- calculatePrice(serviceId, vehicleId, studioId, bayId, startTime)
- searchServices(studioId, query)
- createBooking(userId, studioId, vehicleId, serviceId, bayId, startTime, duration)
- cancelBooking(bookingId)

User request: ${naturalLanguage ?? "Book a detailing service"}

Create a JSON plan with steps:
{
  "steps": [{"id": "step1", "action": "actionName", "args": {...}}],
  "rollback": "cancelBooking"
}`;

    // Call Ollama for structured output
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModelConfig.model,
        prompt: context,
        format: "json",
        temperature: 0.3,
      }),
    });

    const result = await response.json();
    return JSON.parse(result.response);
  },
});

/**
 * Execute orchestrated plan with rollback support
 */
export const executePlan = action({
  args: {
    plan: orchestratorPlan,
    context: v.any(),
  },
  handler: async (ctx, { plan, context }) => {
    const results = [];
    const errors = [];

    for (const step of plan.steps) {
      try {
        const result = await executeStep(ctx, step.action, step.args, context);
        results.push({ stepId: step.id, result });
        context[`${step.id}_result`] = result;
      } catch (error) {
        errors.push({ stepId: step.id, error: String(error) });

        // Execute rollback
        if (plan.rollback) {
          await executeStep(ctx, plan.rollback, context, context);
        }
        break;
      }
    }

    return { results, errors, success: errors.length === 0 };
  },
});

/**
 * Execute a single workflow step
 */
async function executeStep(ctx: any, action: string, args: any, context: any) {
  switch (action) {
    case "checkAvailability":
      return ctx.runAction(internal.calendar.findAvailableSlots, args);
    case "calculatePrice":
      return ctx.runAction(internal.pricing.calculatePrice, args);
    case "searchServices":
      return ctx.runQuery(internal.services.search, args);
    case "createBooking":
      return ctx.runMutation(internal.bookings.create, args);
    case "cancelBooking":
      return ctx.runMutation(internal.bookings.cancel, args);
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}