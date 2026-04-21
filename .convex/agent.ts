/**
 * ANOLLA SPEC - CONVEX AGENT SETUP WITH OLLAMA
 * 
 * Creates and configures the AI Agent using Ollama gemma4:e4b model.
 * Import this in your Convex actions/queries to use the agent.
 */

import { Agent, createTool } from "@convex-dev/agent";
import { ollama } from "ai-sdk-ollama";
import type { AgentComponent } from "@convex-dev/agent/dist/component/_generated/component";
import type { DataModel } from "./_generated/dataModel";

// Type aliases
type ActionCtx = import("convex/server").ActionCtx;
type QueryCtx = import("convex/server").QueryCtx;
type MutationCtx = import("convex/server").MutationCtx;

// ============================================
// OLLAMA CONFIGURATION
// ============================================

// Ollama server URL (default: localhost:11434)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Model configuration
export const MODEL_CONFIG = {
  chatModel: "gemma4:e4b",
  embeddingModel: "qwen3-embedding:4b",
  temperature: 0.7,
  maxTokens: 4096,
};

// Create Ollama language model
export const ollamaLanguageModel = ollama(MODEL_CONFIG.chatModel);

// Create embedding model (for RAG)
export const ollamaEmbeddingModel = ollama.textEmbeddingModel(MODEL_CONFIG.embeddingModel);

// ============================================
// TOOL DEFINITIONS
// ============================================

/**
 * Example tool: Check booking availability
 * Add more tools as needed for your application
 */
export const bookingTools = {
  checkAvailability: createTool({
    args: {
      studioId: import("convex/values").v.id("studios"),
      date: import("convex/values").v.number(),
      serviceIds: import("convex/values").v.array(import("convex/values").v.id("services")),
    },
    description: "Check available time slots for a booking at a specific studio",
    handler: async (ctx, args) => {
      // Implementation would query the database
      // This is a placeholder
      return {
        availableSlots: [],
        message: "Availability check - implement with actual database queries",
      };
    },
  }),
  
  calculatePrice: createTool({
    args: {
      vehicleClass: import("convex/values").v.string(),
      serviceIds: import("convex/values").v.array(import("convex/values").v.id("services")),
      dirtLevel: import("convex/values").v.optional(import("convex/values").v.string()),
    },
    description: "Calculate the price for a detailing service based on vehicle and services",
    handler: async (ctx, args) => {
      // This would call the pricing action
      return {
        basePrice: 0,
        totalPrice: 0,
        breakdown: {},
      };
    },
  }),
  
  searchServices: createTool({
    args: {
      category: import("convex/values").v.optional(import("convex/values").v.string()),
      studioId: import("convex/values").v.optional(import("convex/values").v.id("studios")),
    },
    description: "Search available detailing services",
    handler: async (ctx, args) => {
      return {
        services: [],
      };
    },
  }),
  
  createBooking: createTool({
    args: {
      userId: import("convex/values").v.id("users"),
      vehicleId: import("convex/values").v.id("vehicles"),
      studioId: import("convex/values").v.id("studios"),
      serviceIds: import("convex/values").v.array(import("convex/values").v.id("services")),
      startTime: import("convex/values").v.number(),
    },
    description: "Create a new booking appointment",
    handler: async (ctx, args) => {
      return {
        bookingId: "",
        confirmationNumber: "",
      };
    },
  }),
};

// ============================================
// AGENT DEFINITION
// ============================================

// System prompt for the Slick Scheduling assistant
const AGENT_INSTRUCTIONS = `You are Slick Scheduling's AI assistant, specializing in auto detailing bookings.

Your role:
- Help customers book appointments for auto detailing services
- Answer questions about services and pricing
- Provide excellent customer service
- Be friendly, professional, and helpful

Capabilities:
- Check booking availability at different studios
- Calculate pricing for services
- Search available services
- Create bookings

Guidelines:
- Always confirm details before taking actions
- Provide clear pricing breakdowns
- Be helpful and friendly
- Ask clarifying questions when needed`;

/**
 * Create the Slick Scheduling agent with Ollama
 * Usage in actions:
 * 
 * export const myAction = action(async (ctx) => {
 *   const agent = getAgent(ctx);
 *   const thread = await agent.createThread(ctx, { userId: userId });
 *   const result = await agent.streamText(ctx, {
 *     threadId: thread.threadId,
 *     message: "I want to book a detail",
 *   });
 *   return result;
 * });
 */
export function getAgent(component: AgentComponent) {
  return new Agent(component, {
    name: "slick-scheduling-assistant",
    languageModel: ollamaLanguageModel,
    instructions: AGENT_INSTRUCTIONS,
    tools: bookingTools,
  });
}

/**
 * Get agent with custom tools
 */
export function getCustomAgent(
  component: AgentComponent, 
  customTools: typeof bookingTools
) {
  return new Agent(component, {
    name: "slick-scheduling-custom",
    languageModel: ollamaLanguageModel,
    instructions: AGENT_INSTRUCTIONS,
    tools: customTools,
  });
}

// Export model config for reference
export { ollama, ollamaLanguageModel, ollamaEmbeddingModel, MODEL_CONFIG };