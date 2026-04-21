/**
 * ANOLLA SPEC - AI ASSISTANT ORCHESTRATOR
 * Ticket 4: AI Assistant with RAG
 * 
 * Orchestrates AI interactions using:
 * - RAG for knowledge retrieval
 * - Convex Actions for tool calling
 * - Session management for context
 */

import { action, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { searchKnowledgeBase, getContextForAI } from "./rag";

// ============================================
// CONVEX-JINA EMBEDDINGS
// ============================================

// Note: For production, configure convex-jina component
// import { jinaReader } from "convex-jina";

// ============================================
// CONVERSATION TYPES
// ============================================

// Conversation session
interface ConversationSession {
  _id: string;
  userId?: string;
  sessionId: string;
  messages: Message[];
  context: ConversationContext;
  createdAt: number;
  updatedAt: number;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

interface ConversationContext {
  currentStep: string;
  vehicleClass?: string;
  serviceType?: string;
  studioId?: string;
  bookingId?: string;
  extractedSlots: Record<string, unknown>;
}

// ============================================
// INPUT SCHEMAS
// ============================================

export const sendMessageInput = v.object({
  sessionId: v.string(),
  message: v.string(),
  userId: v.optional(v.id("users")),
  context: v.optional(v.object({
    vehicleClass: v.optional(v.string()),
    studioId: v.optional(v.id("studios")),
  })),
});

export const createSessionInput = v.object({
  userId: v.optional(v.id("users")),
  initialContext: v.optional(v.object({
    vehicleClass: v.optional(v.string()),
    serviceType: v.optional(v.string()),
    studioId: v.optional(v.id("studios")),
  })),
});

// ============================================
// ORCHESTRATOR PROMPTS
// ============================================

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are Slick Scheduling's AI assistant, specializing in auto detailing bookings.

Your role:
- Help customers book appointments
- Answer questions about services and pricing
- Troubleshoot issues
- Provide excellent customer service

Capabilities:
- Search knowledge base for accurate information
- Check booking availability
- Calculate pricing
- Create bookings
- Manage existing appointments

Guidelines:
- Be friendly and professional
- Use the customer's name if available
- Confirm details before taking actions
- Provide clear pricing breakdowns
- Always offer to help with anything else

Response format:
- Keep responses concise but informative
- Use bullet points for multiple items
- Include pricing when relevant
- End with a helpful question or next step`;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract intent from user message
 */
function extractIntent(message: string): {
  intent: string;
  entities: Record<string, string>;
  confidence: number;
} {
  const lower = message.toLowerCase();
  
  // Booking intents
  if (lower.includes("book") || lower.includes("schedule") || lower.includes("appointment")) {
    return {
      intent: "booking",
      entities: extractBookingEntities(message),
      confidence: 0.9,
    };
  }
  
  // Pricing intents
  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much") || lower.includes("quote")) {
    return {
      intent: "pricing",
      entities: extractPricingEntities(message),
      confidence: 0.85,
    };
  }
  
  // FAQ intents
  if (lower.includes("what") || lower.includes("how") || lower.includes("when") || lower.includes("where")) {
    return {
      intent: "faq",
      entities: {},
      confidence: 0.7,
    };
  }
  
  // Cancellation intents
  if (lower.includes("cancel") || lower.includes("reschedule")) {
    return {
      intent: "cancellation",
      entities: {},
      confidence: 0.9,
    };
  }
  
  // Confirmation intents
  if (lower.includes("confirm") || lower.includes("yes") || lower.includes("correct")) {
    return {
      intent: "confirmation",
      entities: {},
      confidence: 0.8,
    };
  }
  
  return {
    intent: "general",
    entities: {},
    confidence: 0.5,
  };
}

/**
 * Extract booking-related entities
 */
function extractBookingEntities(message: string): Record<string, string> {
  const entities: Record<string, string> = {};
  const lower = message.toLowerCase();
  
  // Vehicle class
  const vehicleClasses = ["compact", "sedan", "suv", "truck", "van", "luxury", "sports"];
  for (const vc of vehicleClasses) {
    if (lower.includes(vc)) {
      entities.vehicleClass = vc;
      break;
    }
  }
  
  // Service type
  if (lower.includes("wash")) entities.serviceType = "wash";
  else if (lower.includes("detail")) entities.serviceType = "detail";
  else if (lower.includes("coating") || lower.includes("ceramic")) entities.serviceType = "coating";
  else if (lower.includes("polish") || lower.includes("wax")) entities.serviceType = "polish";
  
  return entities;
}

/**
 * Extract pricing-related entities
 */
function extractPricingEntities(message: string): Record<string, string> {
  const entities: Record<string, string> = {};
  const lower = message.toLowerCase();
  
  if (lower.includes("suv") || lower.includes("truck")) {
    entities.vehicleClass = lower.includes("truck") ? "truck" : "suv";
  }
  
  return entities;
}

/**
 * Determine next step based on intent and context
 */
function determineNextStep(intent: string, context: ConversationContext): string {
  const steps = {
    booking: ["get_vehicle", "get_services", "get_date", "get_studio", "confirm_booking"],
    pricing: ["get_vehicle", "get_services", "provide_quote"],
    faq: ["search_knowledge", "provide_answer"],
    cancellation: ["get_booking_id", "confirm_cancellation"],
    confirmation: ["validate_details", "execute_action"],
    general: ["greet", "offer_help"],
  };
  
  return steps[intent as keyof typeof steps]?.[0] ?? "greet";
}

/**
 * Generate response based on intent and context
 */
async function generateResponse(
  intent: string,
  message: string,
  context: ConversationContext,
  knowledgeResults: { results: { title: string; content: string }[] }
): Promise<string> {
  // In production, this would call an LLM
  // For now, we'll use template-based responses
  
  switch (intent) {
    case "booking":
      return generateBookingResponse(message, context, knowledgeResults);
    case "pricing":
      return generatePricingResponse(message, context, knowledgeResults);
    case "faq":
      return generateFaqResponse(knowledgeResults);
    case "cancellation":
      return "I can help you cancel or reschedule your appointment. Could you please provide your booking confirmation number?";
    case "confirmation":
      return "Great! I'll proceed with that. Let me confirm the details with you.";
    default:
      return generateGeneralResponse(message, context);
  }
}

/**
 * Generate booking flow response
 */
function generateBookingResponse(
  message: string,
  context: ConversationContext,
  knowledge: { results: { title: string; content: string }[] }
): string {
  if (!context.extractedSlots.vehicleClass) {
    return "I'd be happy to help you book an appointment! First, what type of vehicle do you have? We service compact cars, sedans, SUVs, trucks, vans, luxury vehicles, and sports cars.";
  }
  
  if (!context.extractedSlots.serviceType) {
    return `Great! I see you have a ${context.extractedSlots.vehicleClass}. What service would you like? We offer basic washes, full details, ceramic coating, and more. Would you like me to show you our service options and pricing?`;
  }
  
  return "Let me check available time slots for your booking. What date and time would work best for you?";
}

/**
 * Generate pricing response
 */
function generatePricingResponse(
  message: string,
  context: ConversationContext,
  knowledge: { results: { title: string; content: string }[] }
): string {
  const pricingInfo = knowledge.results.find(r => 
    r.title.toLowerCase().includes("pricing")
  );
  
  if (pricingInfo) {
    return pricingInfo.content + "\n\nWould you like me to calculate a specific quote for you? If so, please tell me your vehicle type and which services you're interested in.";
  }
  
  return "Our pricing depends on your vehicle class, selected services, and current demand. Could you tell me what type of vehicle you have and which services you're interested in?";
}

/**
 * Generate FAQ response
 */
function generateFaqResponse(knowledge: { results: { title: string; content: string }[] }): string {
  if (knowledge.results.length === 0) {
    return "I'm not sure I have that information handy. Let me find out more about that for you. Is there something specific you'd like to know about our services?";
  }
  
  const topResult = knowledge.results[0];
  return `${topResult.title}\n\n${topResult.content}`;
}

/**
 * Generate general response
 */
function generateGeneralResponse(message: string, context: ConversationContext): string {
  const lower = message.toLowerCase();
  
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! Welcome to Slick Scheduling. How can I help you today? I can assist with booking appointments, answering questions about our services, or managing existing bookings.";
  }
  
  if (lower.includes("thank")) {
    return "You're welcome! Is there anything else I can help you with today?";
  }
  
  if (lower.includes("bye") || lower.includes("goodbye")) {
    return "Thank you for using Slick Scheduling! Have a great day, and we look forward to seeing your vehicle soon!";
  }
  
  return "I'm here to help! You can ask me about:\n- Booking appointments\n- Our services and pricing\n- Vehicle types we service\n- Cancellations or rescheduling\n\nWhat would you like to know?";
}

// ============================================
// AI ORCHESTRATOR ACTIONS
// ============================================

/**
 * Create a new conversation session
 */
export const createConversationSession = mutation({
  args: createSessionInput,
  handler: async (ctx, args) => {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    
    const context: ConversationContext = {
      currentStep: "greet",
      vehicleClass: args.initialContext?.vehicleClass,
      serviceType: args.initialContext?.serviceType,
      studioId: args.initialContext?.studioId,
      extractedSlots: {},
    };
    
    const session: Omit<ConversationSession, "_id"> = {
      userId: args.userId,
      sessionId,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
          timestamp: now,
        },
        {
          role: "assistant",
          content: "Hello! Welcome to Slick Scheduling. How can I help you today?",
          timestamp: now,
        },
      ],
      context,
      createdAt: now,
      updatedAt: now,
    };
    
    const sessionId_db = await ctx.db.insert("aiData", {
      dataType: "conversation_session",
      content: JSON.stringify(session),
      metadata: {
        userId: args.userId,
        sessionId,
        isActive: true,
      },
      usedAt: now,
      createdAt: now,
    });
    
    return { sessionId, welcomeMessage: session.messages[1].content };
  },
});

/**
 * Send a message to the AI assistant
 */
export const sendMessage = action({
  args: sendMessageInput,
  handler: async (ctx, args): Promise<{
    response: string;
    sessionId: string;
    suggestedActions?: string[];
  }> => {
    const { sessionId, message, userId, context: userContext } = args;
    
    // Get session from aiData
    const sessions = await ctx.db
      .query("aiData")
      .filter((q) => 
        q.and(
          q.eq(q.field("dataType"), "conversation_session"),
          q.eq(q.field("metadata.sessionId"), sessionId)
        )
      )
      .collect();
    
    const sessionDoc = sessions[0];
    if (!sessionDoc) {
      return {
        response: "Session not found. Please start a new conversation.",
        sessionId,
      };
    }
    
    const session: ConversationSession = JSON.parse(sessionDoc.content as string);
    const now = Date.now();
    
    // Add user message
    session.messages.push({
      role: "user",
      content: message,
      timestamp: now,
    });
    
    // Extract intent
    const { intent, entities, confidence } = extractIntent(message);
    
    // Update context
    session.context = {
      ...session.context,
      ...userContext,
      currentStep: determineNextStep(intent, session.context),
      extractedSlots: {
        ...session.context.extractedSlots,
        ...entities,
      },
    };
    
    // Get relevant knowledge from RAG
    const searchQuery = message.length > 20 ? message : `${intent} ${Object.values(entities).join(" ")}`;
    const knowledgeResults = await searchKnowledgeBase(ctx, {
      searchQuery: {
        query: searchQuery,
        category: intent === "faq" ? "faq" : undefined,
        studioId: session.context.studioId,
        limit: 3,
        minRelevance: 0.3,
      },
    });
    
    // Generate response
    const response = await generateResponse(
      intent,
      message,
      session.context,
      knowledgeResults
    );
    
    // Add assistant response
    session.messages.push({
      role: "assistant",
      content: response,
      timestamp: now,
    });
    
    session.updatedAt = now;
    
    // Update session in database
    await ctx.db.patch(sessionDoc._id, {
      content: JSON.stringify(session),
      usedAt: now,
    });
    
    // Get suggested actions
    const contextForAI = await getContextForAI(ctx, {
      context: {
        currentStep: session.context.currentStep,
        vehicleClass: session.context.vehicleClass,
        serviceType: session.context.serviceType,
        studioId: session.context.studioId,
      },
    });
    
    return {
      response,
      sessionId,
      suggestedActions: contextForAI.suggestedActions,
    };
  },
});

/**
 * Get conversation history
 */
export const getConversationHistory = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("aiData")
      .filter((q) => 
        q.and(
          q.eq(q.field("dataType"), "conversation_session"),
          q.eq(q.field("metadata.sessionId"), args.sessionId)
        )
      )
      .collect();
    
    if (sessions.length === 0) {
      return null;
    }
    
    const session: ConversationSession = JSON.parse(sessions[0].content as string);
    const messages = session.messages.slice(-(args.limit ?? 20));
    
    return messages.filter(m => m.role !== "system");
  },
});

/**
 * End conversation session
 */
export const endConversationSession = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("aiData")
      .filter((q) => 
        q.and(
          q.eq(q.field("dataType"), "conversation_session"),
          q.eq(q.field("metadata.sessionId"), args.sessionId)
        )
      )
      .collect();
    
    if (sessions.length > 0) {
      await ctx.db.patch(sessions[0]._id, {
        metadata: {
          ...sessions[0].metadata,
          isActive: false,
        },
        usedAt: Date.now(),
      });
    }
    
    return { success: true };
  },
});