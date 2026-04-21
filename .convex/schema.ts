import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("customer"), v.literal("staff"), v.literal("admin")),
    phone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  vehicles: defineTable({
    ownerId: v.id("users"),
    make: v.string(),
    model: v.string(),
    year: v.number(),
    color: v.string(),
    licensePlate: v.string(),
    vin: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_license_plate", ["licensePlate"]),

  services: defineTable({
    name: v.string(),
    description: v.string(),
    baseDuration: v.number(), // in minutes
    basePrice: v.number(), // in cents
    category: v.string(), // e.g., "wash", "wax", "interior"
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  packages: defineTable({
    name: v.string(),
    description: v.string(),
    serviceIds: v.array(v.id("services")),
    totalDuration: v.number(), // in minutes
    totalPrice: v.number(), // in cents
    discountPercentage: v.optional(v.number()), // for dynamic pricing
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"]),

  studios: defineTable({
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    phone: v.string(),
    operatingHours: v.object({
      monday: v.object({ open: v.string(), close: v.string() }),
      tuesday: v.object({ open: v.string(), close: v.string() }),
      wednesday: v.object({ open: v.string(), close: v.string() }),
      thursday: v.object({ open: v.string(), close: v.string() }),
      friday: v.object({ open: v.string(), close: v.string() }),
      saturday: v.object({ open: v.string(), close: v.string() }),
      sunday: v.object({ open: v.string(), close: v.string() }),
    }),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_city", ["city"])
    .index("by_active", ["isActive"]),

  bays: defineTable({
    studioId: v.id("studios"),
    name: v.string(),
    type: v.string(), // e.g., "standard", "premium"
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_studio", ["studioId"])
    .index("by_active", ["isActive"]),

  pricingRules: defineTable({
    name: v.string(),
    type: v.union(v.literal("time_based"), v.literal("demand_based"), v.literal("seasonal"), v.literal("location_based")),
    parameters: v.any(), // JSON object with rule-specific params
    isActive: v.boolean(),
    priority: v.number(), // for ordering application
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_active", ["isActive"])
    .index("by_priority", ["priority"]),

  bookings: defineTable({
    userId: v.id("users"),
    vehicleId: v.id("vehicles"),
    serviceIds: v.array(v.id("services")),
    packageId: v.optional(v.id("packages")),
    studioId: v.id("studios"),
    bayId: v.optional(v.id("bays")),
    startTime: v.number(), // Unix timestamp
    duration: v.number(), // in minutes, for variable duration
    endTime: v.number(), // calculated
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("no_show")
    ),
    totalPrice: v.number(), // in cents, calculated
    appliedDiscounts: v.optional(v.array(v.object({
      ruleId: v.id("pricingRules"),
      amount: v.number(),
      description: v.string(),
    }))),
    notes: v.optional(v.string()),
    aiRecommendation: v.optional(v.string()), // AI-generated suggestions
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_studio", ["studioId"])
    .index("by_bay", ["bayId"])
    .index("by_start_time", ["startTime"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),

  aiData: defineTable({
    type: v.union(v.literal("service_embedding"), v.literal("user_preference"), v.literal("booking_pattern"), v.literal("recommendation_log")),
    data: v.any(), // JSON for embeddings, preferences, etc.
    relatedUserId: v.optional(v.id("users")),
    relatedBookingId: v.optional(v.id("bookings")),
    relatedServiceId: v.optional(v.id("services")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_user", ["relatedUserId"])
    .index("by_booking", ["relatedBookingId"])
    .index("by_service", ["relatedServiceId"])
    .index("by_created_at", ["createdAt"]),

  // Sharded counters for analytics
  bookingCounters: defineTable({
    _id: v.id("bookingCounters"),
    counter: v.shardedCounter(),
  }),

  studioCounters: defineTable({
    studioId: v.id("studios"),
    counter: v.shardedCounter(),
  })
    .index("by_studio", ["studioId"]),
});