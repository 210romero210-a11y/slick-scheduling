/**
 * ANOLLA SPEC - PRICING RULE HELPERS
 * Ticket 3: Dynamic Pricing Engine
 * 
 * Helpers for managing and applying pricing rules.
 */

import { query, mutation, action } from "../../convex/_generated/server";
import { v } from "convex/values";
import { calculatePrice, priceCalculationInput } from "./pricing";

// ============================================
// PRICING RULE TYPES
// ============================================

// Pricing rule from schema
interface PricingRule {
  _id: string;
  name: string;
  description?: string;
  type: string;
  parameters: Record<string, unknown>;
  isActive: boolean;
  priority: number;
  studioId?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all active pricing rules
 */
export const getActivePricingRules = query({
  args: { studioId: v.optional(v.id("studios")) },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("pricingRules")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    if (args.studioId) {
      return rules.filter(
        (r) => !r.studioId || r.studioId === args.studioId
      );
    }
    
    return rules;
  },
});

/**
 * Get pricing rule by ID
 */
export const getPricingRule = query({
  args: { ruleId: v.id("pricingRules") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.ruleId);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new pricing rule
 */
export const createPricingRule = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("time_based"),
      v.literal("demand_based"),
      v.literal("seasonal"),
      v.literal("location_based"),
      v.literal("vehicle_class"),
      v.literal("dirt_level"),
      v.literal("package_discount")
    ),
    parameters: v.any(),  // Rule-specific parameters
    priority: v.number(),
    studioId: v.optional(v.id("studios")),
  },
  handler: async (ctx, args) => {
    const { name, description, type, parameters, priority, studioId } = args;
    
    const ruleId = await ctx.db.insert("pricingRules", {
      name,
      description,
      type,
      parameters,
      isActive: true,
      priority,
      studioId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return ruleId;
  },
});

/**
 * Update a pricing rule
 */
export const updatePricingRule = mutation({
  args: {
    ruleId: v.id("pricingRules"),
    updates: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      parameters: v.optional(v.any()),
      isActive: v.optional(v.boolean()),
      priority: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const { ruleId, updates } = args;
    
    await ctx.db.patch(ruleId, {
      ...updates,
      updatedAt: Date.now(),
    });
    
    return ruleId;
  },
});

/**
 * Delete a pricing rule (soft delete)
 */
export const deletePricingRule = mutation({
  args: { ruleId: v.id("pricingRules") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ruleId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// QUICK PRICE ESTIMATE (FOR UI)
// ============================================

/**
 * Quick price estimate for display without full Action overhead
 * Uses database queries directly
 */
export const getQuickPriceEstimate = query({
  args: {
    vehicleClass: priceCalculationInput.fields.vehicleClass,
    serviceIds: v.array(v.id("services")),
  },
  handler: async (ctx, args) => {
    const { vehicleClass, serviceIds } = args;
    
    // Get base prices
    let basePrice = 0;
    for (const sid of serviceIds) {
      const svc = await ctx.db.get(sid);
      if (svc) {
        basePrice += svc.basePrice;
      }
    }
    
    // Apply vehicle class multiplier
    const multipliers: Record<string, number> = {
      compact: 0.9, sedan: 1.0, suv: 1.15,
      truck: 1.3, van: 1.25, luxury: 1.5, sports: 1.4,
    };
    
    const multiplier = multipliers[vehicleClass] ?? 1.0;
    const estimated = Math.round(basePrice * multiplier);
    
    return {
      basePrice,
      estimated,
      includes: ["Base service price", "Vehicle class adjustment"],
      note: "Final price calculated at booking time",
    };
  },
});

// ============================================
// DEFAULT RULES SEEDER
// ============================================

/**
 * Seed default pricing rules for a studio
 */
export const seedDefaultPricingRules = mutation({
  args: { studioId: v.id("studios") },
  handler: async (ctx, args) => {
    const { studioId } = args;
    const now = Date.now();
    
    // Default rules to create
    const defaultRules = [
      {
        name: "Weekend Premium",
        description: "Premium pricing on weekends",
        type: "time_based" as const,
        parameters: { dayOfWeek: [0, 6], multiplier: 1.15 },
        priority: 1,
      },
      {
        name: "Peak Season",
        description: "Summer peak season pricing",
        type: "seasonal" as const,
        parameters: { months: [5, 6, 7], multiplier: 1.25 },
        priority: 2,
      },
      {
        name: "Package Discount",
        description: "Discount for package bookings",
        type: "package_discount" as const,
        parameters: { discountPercentage: 10 },
        priority: 3,
      },
      {
        name: "Truck Surcharge",
        description: "Extra charges for trucks",
        type: "vehicle_class" as const,
        parameters: { vehicleClass: ["truck", "van"], multiplier: 1.3 },
        priority: 4,
      },
      {
        name: "Heavy Dirt Premium",
        description: "Extra work for heavy dirt",
        type: "dirt_level" as const,
        parameters: { dirtLevel: ["heavy", "extreme"], multiplier: 1.35 },
        priority: 5,
      },
    ];
    
    const createdIds: string[] = [];
    
    for (const rule of defaultRules) {
      const id = await ctx.db.insert("pricingRules", {
        ...rule,
        studioId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      createdIds.push(id);
    }
    
    return createdIds;
  },
});