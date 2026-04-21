/**
 * ANOLLA SPEC - RAG IMPLEMENTATION
 * Ticket 4: RAG (Retrieval-Augmented Generation)
 * 
 * AI-powered retrieval system for:
 * - Customer service FAQ
 * - Service/Pricing knowledge base
 * - Booking assistance
 * - Studio information
 * 
 * Uses Convex AI infrastructure for embeddings and retrieval.
 */

import { action, mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// RAG DOCUMENT TYPES
// ============================================

// Document categories for different knowledge bases
export const documentCategory = v.union(
  v.literal("faq"),
  v.literal("service"),
  v.literal("pricing"),
  v.literal("booking"),
  v.literal("studio"),
  v.literal("policy"),
  v.literal("troubleshooting")
);

// Input for adding a document
export const ragDocumentInput = v.object({
  title: v.string(),
  content: v.string(),
  category: documentCategory,
  tags: v.optional(v.array(v.string())),
  studioId: v.optional(v.id("studios")),
  serviceId: v.optional(v.id("services")),
  priority: v.optional(v.number()),  // Higher = more relevant
  metadata: v.optional(v.record(v.string(), v.any())),
});

// Input for searching documents
export const searchQueryInput = v.object({
  query: v.string(),
  category: v.optional(documentCategory),
  studioId: v.optional(v.id("studios")),
  limit: v.optional(v.number()),  // Default 5
  minRelevance: v.optional(v.number()),  // 0.0-1.0, default 0.3
});

// ============================================
// RAG CONFIGURATION
// ============================================

// Embedding configuration
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TOKEN_LENGTH = 8000;
const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_MIN_RELEVANCE = 0.3;

// Document priority weights by category
const CATEGORY_PRIORITIES: Record<string, number> = {
  faq: 10,
  service: 8,
  pricing: 7,
  booking: 6,
  studio: 5,
  policy: 4,
  troubleshooting: 3,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate embedding for text (simulated - in production use OpenAI/Anthrophic API)
 * Note: In production, integrate with actual embedding provider
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // Simulate embedding generation (hash-based for demo)
  // In production: use OpenAI embeddings API
  const hash = text.split("").reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  // Generate 1536-dimensional vector (OpenAI ada standard)
  const embedding: number[] = [];
  for (let i = 0; i < 1536; i++) {
    const seed = hash + i;
    embedding.push(Math.sin(seed) * Math.cos(seed / 2));
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / magnitude);
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate keyword match score
 */
function keywordScore(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  
  let matches = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }
  
  return matches / queryWords.length;
}

/**
 * Hybrid score combining semantic and keyword matching
 */
function calculateRelevanceScore(
  query: string,
  embedding: number[],
  storedEmbedding: number[],
  content: string
): number {
  const semanticScore = cosineSimilarity(embedding, storedEmbedding);
  const kwScore = keywordScore(query, content);
  
  // Weight: 70% semantic, 30% keyword
  return (semanticScore * 0.7) + (kwScore * 0.3);
}

// ============================================
// RAG ACTIONS
// ============================================

/**
 * Add a document to the RAG knowledge base
 * Creates embedding and stores in aiData table
 */
export const addRagDocument = mutation({
  args: {
    document: ragDocumentInput,
  },
  handler: async (ctx, args) => {
    const { title, content, category, tags, studioId, serviceId, priority, metadata } = args.document;
    
    // Generate embedding
    const combinedText = `${title}. ${content}`;
    const embedding = await generateEmbedding(combinedText);
    
    // Store in aiData table
    const docId = await ctx.db.insert("aiData", {
      dataType: "rag_document",
      content: combinedText,
      metadata: {
        title,
        category,
        tags: tags ?? [],
        studioId,
        serviceId,
        priority: priority ?? CATEGORY_PRIORITIES[category] ?? 5,
        ...metadata,
      },
      embedding,
      usedAt: Date.now(),
      createdAt: Date.now(),
    });
    
    return docId;
  },
});

/**
 * Add multiple documents in batch
 */
export const addRagDocuments = mutation({
  args: {
    documents: v.array(ragDocumentInput),
  },
  handler: async (ctx, args) => {
    const docIds: string[] = [];
    
    for (const doc of args.documents) {
      const combinedText = `${doc.title}. ${doc.content}`;
      const docId = await ctx.db.insert("aiData", {
        dataType: "rag_document",
        content: combinedText,
        metadata: {
          title: doc.title,
          category: doc.category,
          tags: doc.tags ?? [],
          studioId: doc.studioId,
          serviceId: doc.serviceId,
          priority: doc.priority ?? CATEGORY_PRIORITIES[doc.category] ?? 5,
          ...doc.metadata,
        },
        embedding: await generateEmbedding(combinedText),
        usedAt: Date.now(),
        createdAt: Date.now(),
      });
      docIds.push(docId);
    }
    
    return docIds;
  },
});

/**
 * Search the RAG knowledge base
 * Uses hybrid semantic + keyword search
 */
export const searchKnowledgeBase = action({
  args: {
    searchQuery: searchQueryInput,
  },
  handler: async (ctx, args): Promise<{
    results: {
      id: string;
      title: string;
      content: string;
      category: string;
      relevance: number;
      tags: string[];
    }[];
    answered: boolean;
  }> => {
    const { query, category, studioId, limit = DEFAULT_SEARCH_LIMIT, minRelevance = DEFAULT_MIN_RELEVANCE } = args.searchQuery;
    
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    
    // Get all documents from aiData
    const documents = await ctx.db
      .query("aiData")
      .filter((q) => q.eq(q.field("dataType"), "rag_document"))
      .collect();
    
    // Score and filter documents
    const scoredDocs = documents
      .map((doc) => {
        const metadata = doc.metadata as Record<string, unknown>;
        
        // Filter by category if specified
        if (category && metadata.category !== category) {
          return null;
        }
        
        // Filter by studio if specified
        if (studioId && metadata.studioId !== studioId) {
          return null;
        }
        
        // Calculate relevance
        const embedding = doc.embedding as number[];
        const content = doc.content as string;
        const relevance = calculateRelevanceScore(query, queryEmbedding, embedding, content);
        
        // Apply priority boost
        const priority = (metadata.priority as number) ?? 5;
        const boostedRelevance = relevance + (priority / 100);
        
        return {
          id: doc._id,
          title: metadata.title as string,
          content: doc.content as string,
          category: metadata.category as string,
          relevance: boostedRelevance,
          tags: (metadata.tags as string[]) ?? [],
        };
      })
      .filter((doc): doc is NonNullable<typeof doc> => 
        doc !== null && doc.relevance >= minRelevance
      );
    
    // Sort by relevance and take top results
    scoredDocs.sort((a, b) => b.relevance - a.relevance);
    const results = scoredDocs.slice(0, limit);
    
    return {
      results,
      answered: results.length > 0 && results[0].relevance >= 0.6,
    };
  },
});

/**
 * Get contextual information for AI assistant
 * Retrieves relevant knowledge based on conversation context
 */
export const getContextForAI = action({
  args: {
    context: v.object({
      currentStep: v.string(),  // "booking", "pricing", "faq", "troubleshooting"
      vehicleClass: v.optional(v.string()),
      serviceType: v.optional(v.string()),
      studioId: v.optional(v.id("studios")),
    }),
  },
  handler: async (ctx, args) => {
    const { currentStep, vehicleClass, serviceType, studioId } = args.context;
    
    // Determine relevant categories based on step
    const categoryMap: Record<string, string[]> = {
      booking: ["booking", "policy", "studio"],
      pricing: ["pricing", "service"],
      faq: ["faq", "troubleshooting"],
      troubleshooting: ["troubleshooting", "faq"],
      general: ["service", "pricing", "faq"],
    };
    
    const categories = categoryMap[currentStep] ?? categoryMap.general;
    
    // Get documents from relevant categories
    const documents = await ctx.db
      .query("aiData")
      .filter((q) => q.eq(q.field("dataType"), "rag_document"))
      .collect();
    
    const relevantDocs = documents
      .filter((doc) => {
        const metadata = doc.metadata as Record<string, unknown>;
        return categories.includes(metadata.category as string);
      })
      .sort((a, b) => {
        const priorityA = (a.metadata as Record<string, unknown>).priority as number;
        const priorityB = (b.metadata as Record<string, unknown>).priority as number;
        return (priorityB ?? 5) - (priorityA ?? 5);
      })
      .slice(0, 5)
      .map((doc) => ({
        title: (doc.metadata as Record<string, unknown>).title as string,
        content: doc.content as string,
        category: (doc.metadata as Record<string, unknown>).category as string,
      }));
    
    return {
      contextDocuments: relevantDocs,
      suggestedActions: getSuggestedActions(currentStep, vehicleClass, serviceType),
    };
  },
});

/**
 * Get suggested next actions based on context
 */
function getSuggestedActions(
  currentStep: string,
  vehicleClass?: string,
  serviceType?: string
): string[] {
  const suggestions: Record<string, string[]> = {
    booking: [
      "Check vehicle availability",
      "Show available time slots",
      "Apply current promotions",
    ],
    pricing: [
      "Show price breakdown",
      "Apply vehicle class adjustment",
      "Calculate package discount",
    ],
    faq: [
      "Provide detailed answer",
      "Escalate to support",
      "Show related articles",
    ],
    troubleshooting: [
      "Run diagnostic checklist",
      "Schedule follow-up",
      "Create support ticket",
    ],
    general: [
      "Show service options",
      "Help with booking",
      "Answer questions",
    ],
  };
  
  return suggestions[currentStep] ?? suggestions.general;
}

// ============================================
// RAG MANAGEMENT
// ============================================

/**
 * Delete a document from knowledge base
 */
export const deleteRagDocument = mutation({
  args: {
    documentId: v.id("aiData"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.documentId);
  },
});

/**
 * Update document in knowledge base
 */
export const updateRagDocument = mutation({
  args: {
    documentId: v.id("aiData"),
    updates: v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      priority: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Document not found");
    }
    
    const metadata = doc.metadata as Record<string, unknown>;
    const newContent = args.updates.content ?? doc.content as string;
    const newTitle = args.updates.title ?? metadata.title as string;
    
    // Regenerate embedding if content changed
    let embedding = doc.embedding as number[];
    if (args.updates.content || args.updates.title) {
      embedding = await generateEmbedding(`${newTitle}. ${newContent}`);
    }
    
    await ctx.db.patch(args.documentId, {
      content: newContent,
      metadata: {
        ...metadata,
        ...args.updates,
      },
      embedding,
      usedAt: Date.now(),
    });
  },
});

/**
 * Get knowledge base statistics
 */
export const getKnowledgeBaseStats = query({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("aiData")
      .filter((q) => q.eq(q.field("dataType"), "rag_document"))
      .collect();
    
    const categoryCount: Record<string, number> = {};
    for (const doc of documents) {
      const metadata = doc.metadata as Record<string, unknown>;
      const category = metadata.category as string;
      categoryCount[category] = (categoryCount[category] ?? 0) + 1;
    }
    
    return {
      totalDocuments: documents.length,
      byCategory: categoryCount,
      lastUpdated: documents.length > 0 
        ? Math.max(...documents.map(d => d.createdAt))
        : null,
    };
  },
});

/**
 * Seed default knowledge base for Slick Scheduling
 */
export const seedDefaultKnowledgeBase = mutation({
  args: {
    studioId: v.optional(v.id("studios")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    const defaultDocuments = [
      // FAQs
      {
        title: "How do I book an appointment?",
        content: "You can book an appointment through our online booking system. Select your vehicle type, choose services, pick a date/time, and confirm your booking. You'll receive a confirmation email.",
        category: "faq",
        tags: ["booking", "how-to", "appointment"],
        priority: 10,
      },
      {
        title: "What vehicles do you service?",
        content: "We service all vehicle types including compact cars, sedans, SUVs, trucks, vans, luxury vehicles, and sports cars. Each vehicle class has different pricing based on size and detail requirements.",
        category: "faq",
        tags: ["vehicles", "services", "pricing"],
        priority: 9,
      },
      {
        title: "How long does detailing take?",
        content: "Service duration varies by package and vehicle condition. Basic wash takes 30-45 minutes. Full detail takes 2-4 hours. Deluxe packages with ceramic coating can take 4-6 hours plus curing time.",
        category: "faq",
        tags: ["duration", "time", "services"],
        priority: 9,
      },
      {
        title: "What's included in each package?",
        content: "Our packages range from Basic (exterior wash, interior vacuum) through Premium (full detail, clay treatment, leather conditioning) to Ultimate (ceramic coating, paint correction, engine bay detail). Each package lists specific services included.",
        category: "service",
        tags: ["packages", "services", "details"],
        priority: 8,
      },
      // Pricing
      {
        title: "How is pricing calculated?",
        content: "Pricing depends on vehicle class, selected services, dirt level, and current demand. Larger vehicles and higher dirt levels cost more. We offer dynamic pricing based on studio occupancy and seasonality.",
        category: "pricing",
        tags: ["pricing", "cost", "factors"],
        priority: 10,
      },
      {
        title: "Do you offer discounts?",
        content: "Yes! We offer package discounts (10-20% off), multi-vehicle discounts, and seasonal promotions. Subscribe to our newsletter for exclusive deals. First-time customers receive 15% off.",
        category: "pricing",
        tags: ["discounts", "deals", "offers"],
        priority: 8,
      },
      // Policies
      {
        title: "What is your cancellation policy?",
        content: "You can cancel or reschedule up to 24 hours before your appointment without penalty. Late cancellations (within 24 hours) may incur a $25 fee. No-shows are charged the full service amount.",
        category: "policy",
        tags: ["cancellation", "policy", "refunds"],
        priority: 7,
      },
      {
        title: "Do you offer warranties?",
        content: "Yes, our ceramic coating packages include a 2-5 year warranty depending on the package. Paint protection services include a 1-year warranty. Details vary by service - ask your detailer for specific warranty information.",
        category: "policy",
        tags: ["warranty", "guarantee", "protection"],
        priority: 7,
      },
      // Booking
      {
        title: "Can I schedule recurring appointments?",
        content: "Yes! You can schedule recurring appointments (weekly, bi-weekly, monthly) through your account. Recurring customers receive priority scheduling and a 5% loyalty discount.",
        category: "booking",
        tags: ["recurring", "schedule", "loyalty"],
        priority: 6,
      },
      {
        title: "What if my vehicle is dirtier than expected?",
        content: "Our pricing accounts for light to moderate dirt. For heavily soiled vehicles ($50+), we may need to upgrade your service tier or add an intensive cleaning add-on. We'll always notify you before proceeding with additional charges.",
        category: "booking",
        tags: ["dirt-level", "pricing", "vehicle-condition"],
        priority: 6,
      },
    ];
    
    const docIds: string[] = [];
    
    for (const doc of defaultDocuments) {
      const combinedText = `${doc.title}. ${doc.content}`;
      const embedding = await generateEmbedding(combinedText);
      
      const docId = await ctx.db.insert("aiData", {
        dataType: "rag_document",
        content: combinedText,
        metadata: {
          title: doc.title,
          category: doc.category,
          tags: doc.tags,
          studioId: args.studioId,
          priority: doc.priority,
          isDefault: true,
        },
        embedding,
        usedAt: now,
        createdAt: now,
      });
      docIds.push(docId);
    }
    
    return docIds;
  },
});