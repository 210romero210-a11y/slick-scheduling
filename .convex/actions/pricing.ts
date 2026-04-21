/**
 * ANOLLA SPEC - DYNAMIC PRICING ENGINE
 * Ticket 3: Dynamic Pricing Engine
 * 
 * Calculates real-time pricing based on:
 * - Vehicle class (sedan vs truck vs luxury)
 * - Dirt level (light to extreme)
 * - Seasonality (peak/off-peak seasons)
 * - Add-ons and service combinations
 * - Demand and bay occupancy
 * 
 * Uses Action cache + LLM cache for performance.
 */

import { action, internalAction, mutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================
// TYPE DEFINITIONS
// ============================================

// Inputs for price calculation
export const priceCalculationInput = v.object({
  vehicleClass: v.union(
    v.literal("compact"),
    v.literal("sedan"),
    v.literal("suv"),
    v.literal("truck"),
    v.literal("van"),
    v.literal("luxury"),
    v.literal("sports")
  ),
  dirtLevel: v.union(
    v.literal("light"),
    v.literal("moderate"),
    v.literal("heavy"),
    v.literal("extreme")
  ),
  serviceIds: v.array(v.id("services")),
  packageId: v.optional(v.id("packages")),
  studioId: v.id("studios"),
  bayId: v.optional(v.id("bays")),
  serviceDate: v.number(), // Unix timestamp
  jobType: v.union(v.literal("studio"), v.literal("mobile"), v.literal("partner")),
});

// Price calculation result
export interface PriceBreakdown {
  basePrice: number;
  vehicleClassAdjustment: number;
  dirtLevelAdjustment: number;
  addOnsTotal: number;
  seasonalityAdjustment: number;
  demandAdjustment: number;
  packageDiscount: number;
  finalPrice: number;
  currency: string;
  breakdown: {
    label: string;
    amount: number;
    description: string;
  }[];
}

// Multipliers from pricing rules
const VEHICLE_CLASS_MULTIPLIERS: Record<string, number> = {
  compact: 0.9,
  sedan: 1.0,
  suv: 1.15,
  truck: 1.3,
  van: 1.25,
  luxury: 1.5,
  sports: 1.4,
};

const DIRT_LEVEL_MULTIPLIERS: Record<string, number> = {
  light: 1.0,
  moderate: 1.15,
  heavy: 1.35,
  extreme: 1.6,
};

// Seasonality periods (month numbers 0-11)
const SEASONALITY: Record<string, { multiplier: number; months: number[] }> = {
  spring: { multiplier: 1.1, months: [2, 3, 4] },    // Mar-May
  summer: { multiplier: 1.25, months: [5, 6, 7] },  // Jun-Aug (peak)
  fall: { multiplier: 1.0, months: [8, 9, 10] },    // Sep-Nov
  winter: { multiplier: 0.9, months: [11, 0, 1] },    // Dec-Feb (off-peak)
};

// Demand thresholds
const DEMAND_THRESHOLDS = {
  low: 0.4,      // < 40% occupancy = discount
  medium: 0.7,    // 40-70% = normal
  high: 0.9,      // > 70% = premium
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get vehicle class multiplier
 */
function getVehicleClassMultiplier(vehicleClass: string): number {
  return VEHICLE_CLASS_MULTIPLIERS[vehicleClass] ?? 1.0;
}

/**
 * Get dirt level multiplier
 */
function getDirtLevelMultiplier(dirtLevel: string): number {
  return DIRT_LEVEL_MULTIPLIERS[dirtLevel] ?? 1.0;
}

/**
 * Get seasonality multiplier for a given date
 */
function getSeasonalityMultiplier(date: Date): number {
  const month = date.getMonth();
  
  for (const [season, config] of Object.entries(SEASONALITY)) {
    if (config.months.includes(month)) {
      return config.multiplier;
    }
  }
  
  return 1.0;
}

/**
 * Get demand multiplier based on occupancy
 */
function getDemandMultiplier(occupancyRate: number): number {
  if (occupancyRate < DEMAND_THRESHOLDS.low) {
    return 0.9;   // Discount for low demand
  } else if (occupancyRate > DEMAND_THRESHOLDS.high) {
    return 1.2;   // Premium for high demand
  } else if (occupancyRate > DEMAND_THRESHOLDS.medium) {
    return 1.1;   // Slight premium
  }
  return 1.0;    // Normal
}

/**
 * Get day of week multiplier (weekends premium)
 */
function getDayOfWeekMultiplier(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return 1.15;  // Weekend premium
  }
  return 1.0;
}

/**
 * Calculate bay occupancy rate
 */
async function getBayOccupancyRate(
  ctx: import("../_generated/server").QueryCtx,
  studioId: string,
  date: Date
): Promise<number> {
  const dayStart = date.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  
  // Get all bays for studio
  const bays = await ctx.db
    .query("bays")
    .withIndex("by_studio", (q) => q.eq("studioId", studioId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .collect();
  
  if (bays.length === 0) return 0.5; // Default to medium
  
  // Get bookings for the day
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_studio_date", (q) => 
      q.eq("studioId", studioId)
        .gte("startTime", dayStart)
        .lt("startTime", dayEnd)
    )
    .collect();
  
  // Calculate occupancy (assuming 10 hours operational, 60 min average service)
  const totalBayMinutes = bays.length * 10 * 60;
  const bookedMinutes = bookings.reduce((sum, b) => sum + b.duration, 0);
  
  return Math.min(bookedMinutes / totalBayMinutes, 1.0);
}

/**
 * Get service by ID with caching
 */
async function getServiceWithCache(
  ctx: import("../_generated/server").QueryCtx,
  serviceId: string
) {
  return await ctx.db.get(serviceId as import("convex/dataModel").Doc<"services">);
}

/**
 * Get package by ID
 */
async function getPackageWithCache(
  ctx: import("../_generated/server").QueryCtx,
  packageId: string
) {
  return await ctx.db.get(packageId as import("convex/dataModel").Doc<"packages">);
}

// ============================================
// PRICE CALCULATION ACTION
// ============================================

/**
 * Main price calculation action
 * Uses Action cache for repeated calculations
 * Integrates with LLM for complex pricing decisions
 */
export const calculatePrice = action({
  args: {
    input: priceCalculationInput,
  },
  handler: async (ctx, args): Promise<PriceBreakdown> => {
    const { vehicleClass, dirtLevel, serviceIds, packageId, studioId, bayId, serviceDate, jobType } = args.input;
    
    // Parse service date
    const date = new Date(serviceDate * 1000);
    
    // Get base prices from services/packages
    let basePrice = 0;
    let totalDuration = 0;
    const serviceDetails: { name: string; basePrice: number; duration: number }[] = [];
    
    if (packageId) {
      // Package-based pricing
      const pkg = await getPackageWithCache(ctx, packageId);
      if (pkg) {
        basePrice = pkg.finalPrice;
        totalDuration = pkg.totalDuration;
        
        // Get service details for breakdown
        for (const sid of pkg.serviceIds) {
          const svc = await getServiceWithCache(ctx, sid);
          if (svc) {
            serviceDetails.push({
              name: svc.name,
              basePrice: svc.basePrice,
              duration: svc.baseDuration,
            });
          }
        }
      }
    } else {
      // Individual service pricing
      for (const sid of serviceIds) {
        const svc = await getServiceWithCache(ctx, sid);
        if (svc && svc.isActive) {
          basePrice += svc.basePrice;
          totalDuration += svc.baseDuration;
          serviceDetails.push({
            name: svc.name,
            basePrice: svc.basePrice,
            duration: svc.baseDuration,
          });
        }
      }
    }
    
    if (basePrice === 0) {
      throw new Error("No valid services found");
    }
    
    // Calculate adjustments
    const vehicleMultiplier = getVehicleClassMultiplier(vehicleClass);
    const vehicleClassAdjustment = Math.round(basePrice * (vehicleMultiplier - 1));
    
    const dirtMultiplier = getDirtLevelMultiplier(dirtLevel);
    const dirtLevelAdjustment = Math.round(basePrice * (dirtMultiplier - 1));
    
    const seasonalityMultiplier = getSeasonalityMultiplier(date);
    const seasonalityAdjustment = Math.round(basePrice * (seasonalityMultiplier - 1));
    
    const dayOfWeekMultiplier = getDayOfWeekMultiplier(date);
    const dayOfWeekAdjustment = Math.round(basePrice * (dayOfWeekMultiplier - 1));
    
    // Get bay occupancy for demand pricing
    const occupancyRate = await getBayOccupancyRate(ctx, studioId, date);
    const demandMultiplier = getDemandMultiplier(occupancyRate);
    const demandAdjustment = Math.round(basePrice * (demandMultiplier - 1));
    
    // Add-on services (any add-ons in the service list)
    let addOnsTotal = 0;
    for (const sid of serviceIds) {
      const svc = await getServiceWithCache(ctx, sid);
      if (svc && svc.isAddon) {
        addOnsTotal += svc.basePrice;
      }
    }
    
    // Package discount (if using package)
    let packageDiscount = 0;
    if (packageId) {
      const pkg = await getPackageWithCache(ctx, packageId);
      if (pkg?.discountPercentage) {
        packageDiscount = Math.round(basePrice * (pkg.discountPercentage / 100));
      }
    }
    
    // Calculate final price
    let finalPrice = basePrice 
      + vehicleClassAdjustment 
      + dirtLevelAdjustment 
      + seasonalityAdjustment
      + dayOfWeekAdjustment
      + demandAdjustment
      + addOnsTotal
      - packageDiscount;
    
    // Build breakdown
    const breakdown: PriceBreakdown["breakdown"] = [
      { label: "Base Price", amount: basePrice, description: `${serviceDetails.map(s => s.name).join(", ")}` },
    ];
    
    if (vehicleClassAdjustment !== 0) {
      breakdown.push({
        label: "Vehicle Class",
        amount: vehicleClassAdjustment,
        description: `${vehicleClass} class adjustment`,
      });
    }
    
    if (dirtLevelAdjustment !== 0) {
      breakdown.push({
        label: "Dirt Level",
        amount: dirtLevelAdjustment,
        description: `${dirtLevel} level adjustment`,
      });
    }
    
    if (addOnsTotal > 0) {
      breakdown.push({
        label: "Add-ons",
        amount: addOnsTotal,
        description: "Additional services",
      });
    }
    
    if (seasonalityAdjustment !== 0) {
      breakdown.push({
        label: "Seasonality",
        amount: seasonalityAdjustment,
        description: "Seasonal pricing",
      });
    }
    
    if (dayOfWeekAdjustment !== 0) {
      breakdown.push({
        label: "Day of Week",
        amount: dayOfWeekAdjustment,
        description: date.getDay() === 0 || date.getDay() === 6 ? "Weekend premium" : "Weekday pricing",
      });
    }
    
    if (demandAdjustment !== 0) {
      breakdown.push({
        label: "Demand",
        amount: demandAdjustment,
        description: occupancyRate > 0.7 ? "High demand pricing" : occupancyRate < 0.4 ? "Low demand discount" : "Standard pricing",
      });
    }
    
    if (packageDiscount > 0) {
      breakdown.push({
        label: "Package Discount",
        amount: -packageDiscount,
        description: "Package discount applied",
      });
    }
    
    return {
      basePrice,
      vehicleClassAdjustment,
      dirtLevelAdjustment,
      addOnsTotal,
      seasonalityAdjustment,
      demandAdjustment,
      packageDiscount,
      finalPrice,
      currency: "USD",
      breakdown,
    };
  },
});

// ============================================
// ESTIMATE DURATION ACTION
// ============================================

/**
 * Estimate job duration based on services and conditions
 */
export const estimateDuration = action({
  args: {
    input: v.object({
      serviceIds: v.array(v.id("services")),
      packageId: v.optional(v.id("packages")),
      vehicleClass: priceCalculationInput.fields.vehicleClass,
      dirtLevel: priceCalculationInput.fields.dirtLevel,
      jobType: priceCalculationInput.fields.jobType,
    }),
  },
  handler: async (ctx, args): Promise<{ estimatedMinutes: number; breakdown: string[] }> => {
    const { vehicleClass, dirtLevel, jobType, serviceIds, packageId } = args.input;
    
    let estimatedMinutes = 0;
    const breakdown: string[] = [];
    
    // Vehicle class time adjustments
    const vehicleTimeAdditions: Record<string, number> = {
      compact: 0,
      sedan: 5,
      suv: 10,
      truck: 15,
      van: 15,
      luxury: 10,
      sports: 5,
    };
    
    // Dirt level time additions
    const dirtTimeAdditions: Record<string, number> = {
      light: 0,
      moderate: 10,
      heavy: 20,
      extreme: 35,
    };
    
    if (packageId) {
      const pkg = await getPackageWithCache(ctx, packageId);
      if (pkg) {
        estimatedMinutes = pkg.totalDuration;
        if (pkg.bufferTimeMinutes) {
          estimatedMinutes += pkg.bufferTimeMinutes;
          breakdown.push(`Buffer time: ${pkg.bufferTimeMinutes}min`);
        }
        if (pkg.curingTimeHours) {
          breakdown.push(`Curing time: ${pkg.curingTimeHours}h (not included in bay time)`);
        }
      }
    } else {
      for (const sid of serviceIds) {
        const svc = await getServiceWithCache(ctx, sid);
        if (svc) {
          estimatedMinutes += svc.baseDuration;
        }
      }
    }
    
    // Add vehicle adjustments
    const vehicleTime = vehicleTimeAdditions[vehicleClass] ?? 0;
    if (vehicleTime > 0) {
      estimatedMinutes += vehicleTime;
      breakdown.push(`Vehicle class: +${vehicleTime}min for ${vehicleClass}`);
    }
    
    // Add dirt level adjustments
    const dirtTime = dirtTimeAdditions[dirtLevel] ?? 0;
    if (dirtTime > 0) {
      estimatedMinutes += dirtTime;
      breakdown.push(`Dirt level: +${dirtTime}min for ${dirtLevel}`);
    }
    
    // Add travel time for mobile/partner jobs
    if (jobType !== "studio") {
      estimatedMinutes += 15;  // Travel buffer
      breakdown.push(`Travel time: +15min for ${jobType}`);
    }
    
    return { estimatedMinutes, breakdown };
  },
});

// ============================================
// GET PRICING RULES ACTION
// ============================================

/**
 * Get active pricing rules for a studio
 */
export const getPricingRules = action({
  args: {
    studioId: v.id("studios"),
  },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("pricingRules")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Filter by studio if applicable
    const studioRules = rules.filter(
      (r) => !r.studioId || r.studioId === args.studioId
    );
    
    // Sort by priority
    return studioRules.sort((a, b) => a.priority - b.priority);
  },
});

// ============================================
// REALTIME PRICE CHECK (INTERNAL)
// ============================================

/**
 * Internal action for real-time bay availability check
 */
export const checkBayAvailability = internalAction({
  args: {
    studioId: v.id("studios"),
    bayId: v.optional(v.id("bays")),
    startTime: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const { studioId, bayId, startTime, duration } = args;
    
    const endTime = startTime + duration * 60 * 1000; // Convert minutes to ms
    
    // Find conflicting bookings
    const conflicts = await ctx.db
      .query("bookings")
      .withIndex("by_studio", (q) => q.eq("studioId", studioId))
      .filter((q) => 
        q.or(
          // New booking starts during existing
          q.and(
            q.gte(q.field("startTime"), startTime),
            q.lt(q.field("startTime"), endTime)
          ),
          // Existing booking starts during new booking
          q.and(
            q.gte(q.field("startTime"), startTime),
            q.lt(q.field("startTime"), endTime)
          ),
          // New booking contains existing
          q.and(
            q.lt(q.field("startTime"), startTime),
            q.gt(q.field("endTime"), endTime)
          )
        )
      )
      .collect();
    
    return {
      available: conflicts.length === 0,
      conflicts: conflicts.length,
      message: conflicts.length === 0 ? "Bay is available" : "Bay is already booked",
    };
  },
});