import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

// ============================================
// ANOLLA SPEC - SLICK SCHEDULING SCHEMA V2
// ============================================

// --- ENUMS & TYPE DEFINITIONS ---

// Vehicle classification per Anolla spec
export const vehicleClassEnum = v.union(
  v.literal("compact"),
  v.literal("sedan"),
  v.literal("suv"),
  v.literal("truck"),
  v.literal("van"),
  v.literal("luxury"),
  v.literal("sports")
);

// Dirt level assessment
export const dirtLevelEnum = v.union(
  v.literal("light"),
  v.literal("moderate"),
  v.literal("heavy"),
  v.literal("extreme")
);

// Job type - studio, mobile, or partner
export const jobTypeEnum = v.union(
  v.literal("studio"),
  v.literal("mobile"),
  v.literal("partner")
);

// Booking status
export const bookingStatusEnum = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("no_show")
);

// User roles
export const userRoleEnum = v.union(
  v.literal("customer"),
  v.literal("detailer"),
  v.literal("frontdesk"),
  v.literal("owner"),
  v.literal("admin")
);

// AI data types for RAG
export const aiDataTypeEnum = v.union(
  v.literal("service_embedding"),
  v.literal("user_preference"),
  v.literal("booking_pattern"),
  v.literal("recommendation_log"),
  v.literal("knowledge_base")
);

// Service categories
export const serviceCategoryEnum = v.union(
  v.literal("wash"),
  v.literal("wax"),
  v.literal("interior"),
  v.literal("detailing"),
  v.literal("ceramic"),
  v.literal("ppf"),
  v.literal("tint"),
  v.literal("correction")
);

// Bay types
export const bayTypeEnum = v.union(
  v.literal("standard"),
  v.literal("premium"),
  v.literal("mobile"),
  v.literal("partner")
);

// Pricing rule types
export const pricingRuleTypeEnum = v.union(
  v.literal("time_based"),
  v.literal("demand_based"),
  v.literal("seasonal"),
  v.literal("location_based"),
  v.literal("vehicle_class"),
  v.literal("dirt_level"),
  v.literal("package_discount")
);

// Time-based rule parameters
export const timeBasedRuleParams = v.object({
  dayOfWeek: v.optional(v.array(v.number())), // 0-6, Sunday = 0
  startHour: v.optional(v.number()), // 0-23
  endHour: v.optional(v.number()), // 0-23
  multiplier: v.number(), // e.g., 1.2 for 20% increase
});

// Demand-based rule parameters
export const demandBasedRuleParams = v.object({
  thresholdBookings: v.optional(v.number()), // bookings per hour threshold
  lowDemandMultiplier: v.optional(v.number()),
  highDemandMultiplier: v.optional(v.number()),
});

// Seasonal rule parameters
export const seasonalRuleParams = v.object({
  startDate: v.string(), // ISO date
  endDate: v.string(), // ISO date
  multiplier: v.number(),
  name: v.string(), // e.g., "Summer Special"
});

// Location-based rule parameters
export const locationBasedRuleParams = v.object({
  studioIds: v.optional(v.array(v.id("studios"))),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  multiplier: v.number(),
});

// Vehicle class rule parameters
export const vehicleClassRuleParams = v.object({
  vehicleClass: v.array(vehicleClassEnum),
  multiplier: v.number(),
});

// Dirt level rule parameters
export const dirtLevelRuleParams = v.object({
  dirtLevel: v.array(dirtLevelEnum),
  multiplier: v.number(),
});

// Package discount rule parameters
export const packageDiscountRuleParams = v.object({
  minServices: v.optional(v.number()),
  discountPercentage: v.number(),
});

// Combined pricing parameters union
export const pricingParameters = v.discriminatedUnion("type", [
  v.object({ type: v.literal("time_based"), ...timeBasedRuleParams.fields }),
  v.object({ type: v.literal("demand_based"), ...demandBasedRuleParams.fields }),
  v.object({ type: v.literal("seasonal"), ...seasonalRuleParams.fields }),
  v.object({ type: v.literal("location_based"), ...locationBasedRuleParams.fields }),
  v.object({ type: v.literal("vehicle_class"), ...vehicleClassRuleParams.fields }),
  v.object({ type: v.literal("dirt_level"), ...dirtLevelRuleParams.fields }),
  v.object({ type: v.literal("package_discount"), ...packageDiscountRuleParams.fields }),
]);

// Operating hours structure
export const operatingHoursObject = v.object({
  monday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  tuesday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  wednesday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  thursday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  friday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  saturday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
  sunday: v.object({ open: v.string(), close: v.string(), isClosed: v.optional(v.boolean()) }),
});

// Geospatial location
export const geoLocationObject = v.object({
  type: v.literal("Point"),
  coordinates: v.tuple([v.number(), v.number()]), // [longitude, latitude]
  address: v.string(),
  city: v.string(),
  state: v.string(),
  zipCode: v.string(),
  country: v.optional(v.string()),
});

// Applied discount structure
export const appliedDiscountObject = v.object({
  ruleId: v.id("pricingRules"),
  amount: v.number(), // in cents
  description: v.string(),
});

// Service add-ons
export const serviceAddonObject = v.object({
  serviceId: v.id("services"),
  price: v.number(), // in cents, can override base price
  duration: v.optional(v.number()), // additional minutes
});

// ============================================
// TABLE DEFINITIONS
// ============================================

export default defineSchema({
  // ---------- USERS TABLE ----------
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: userRoleEnum,
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_active", ["isActive"]),

  // ---------- DETAILERS TABLE (NEW - Anolla Spec) ----------
  detailers: defineTable({
    userId: v.id("users"),
    studioId: v.optional(v.id("studios")), // null for mobile/partner detailers
    skills: v.array(v.string()), // e.g., ["ceramic", "ppf", "correction", "interior"]
    certifications: v.array(v.string()), // e.g., ["3M Certified", "XPEL Certified"]
    hourlyRate: v.optional(v.number()), // for mobile pricing
    rating: v.optional(v.number()), // 0-5 stars
    totalJobs: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_studio", ["studioId"])
    .index("by_skills", ["skills"])
    .index("by_active", ["isActive"]),

  // ---------- VEHICLES TABLE (Enhanced) ----------
  vehicles: defineTable({
    ownerId: v.id("users"),
    make: v.string(),
    model: v.string(),
    year: v.number(),
    color: v.string(),
    licensePlate: v.string(),
    vin: v.optional(v.string()),
    
    // Anolla-specific fields
    vehicleClass: vehicleClassEnum,
    trim: v.optional(v.string()),
    mileage: v.optional(v.number()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_license_plate", ["licensePlate"])
    .index("by_vehicle_class", ["vehicleClass"]),

  // ---------- SERVICES TABLE ----------
  services: defineTable({
    name: v.string(),
    description: v.string(),
    baseDuration: v.number(), // in minutes
    basePrice: v.number(), // in cents
    category: serviceCategoryEnum,
    isAddon: v.boolean(), // true if this is an add-on service
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_addon", ["isAddon"]),

  // ---------- PACKAGES TABLE (Enhanced) ----------
  packages: defineTable({
    name: v.string(),
    description: v.string(),
    serviceIds: v.array(v.id("services")),
    totalDuration: v.number(), // in minutes (sum of services)
    
    // Anolla-specific timing fields
    curingTimeHours: v.optional(v.number()), // time needed for coating to cure
    bufferTimeMinutes: v.optional(v.number()), // prep/cleanup time between jobs
    
    basePrice: v.number(), // in cents (sum of services)
    finalPrice: v.number(), // after discounts
    discountPercentage: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"]),

  // ---------- STUDIOS TABLE (Enhanced with Geospatial) ----------
  studios: defineTable({
    name: v.string(),
    
    // Address fields
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    phone: v.string(),
    
    // Geospatial location for distance queries (Anolla spec)
    location: geoLocationObject,
    
    operatingHours: operatingHoursObject,
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_city", ["city"])
    .index("by_state", ["state"])
    .index("by_active", ["isActive"])
    // Note: For geospatial queries, use $cardinalityScore or external service
    // like PostGIS/Stripe for production. Convex supports basic geo via $cardinalityScore.

  // ---------- BAYS TABLE (Enhanced) ----------
  bays: defineTable({
    studioId: v.id("studios"),
    name: v.string(),
    type: bayTypeEnum,
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_studio", ["studioId"])
    .index("by_type", ["type"])
    .index("by_active", ["isActive"]),

  // ---------- PRICING RULES TABLE (Type-Safe) ----------
  pricingRules: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    type: pricingRuleTypeEnum,
    parameters: pricingParameters, // Fully typed discriminated union
    isActive: v.boolean(),
    priority: v.number(), // Higher = applied first
    studioId: v.optional(v.id("studios")), // null = global rule
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_active", ["isActive"])
    .index("by_priority", ["priority"])
    .index("by_studio", ["studioId"]),

  // ---------- BOOKINGS TABLE (Redesigned - No Redundancy) ----------
  bookings: defineTable({
    userId: v.id("users"),
    vehicleId: v.id("vehicles"),
    studioId: v.id("studios"),
    bayId: v.optional(v.id("bays")),
    detailerId: v.optional(v.id("detailers")),
    
    // Job type (Anolla spec)
    jobType: jobTypeEnum,
    
    // Either individual services OR a package - not both
    // Use itemType to discriminate
    itemType: v.union(v.literal("services"), v.literal("package")),
    itemIds: v.array(v.id("services")), // serviceIds or [packageId] depending on itemType
    
    // Anolla-specific vehicle assessment
    dirtLevel: v.optional(dirtLevelEnum),
    
    // Add-on services
    addOns: v.optional(v.array(serviceAddonObject)),
    
    // Timing
    startTime: v.number(), // Unix timestamp (ms)
    duration: v.number(), // total minutes including buffer
    curingTime: v.optional(v.number()), // hours, for ceramic/coatings
    
    endTime: v.number(), // calculated: startTime + duration
    
    status: bookingStatusEnum,
    
    // Pricing
    basePrice: v.number(), // in cents
    addOnPrice: v.optional(v.number()), // additional cents
    totalPrice: v.number(), // final price in cents
    appliedDiscounts: v.optional(v.array(appliedDiscountObject)),
    
    // AI
    aiRecommendation: v.optional(v.string()),
    aiConfidenceScore: v.optional(v.number()), // 0-1
    
    // Notes
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()), // staff only
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_studio", ["studioId"])
    .index("by_bay", ["bayId"])
    .index("by_detailer", ["detailerId"])
    .index("by_start_time", ["startTime"])
    .index("by_status", ["status"])
    .index("by_job_type", ["jobType"])
    .index("by_item_type", ["itemType"])
    .index("by_created_at", ["createdAt"])
    // Compound index for common query
    .index("by_studio_date", ["studioId", "startTime"]),

  // ---------- BOOKING HISTORY TABLE (New - Anolla Spec) ----------
  bookingHistory: defineTable({
    bookingId: v.id("bookings"),
    userId: v.id("users"),
    vehicleId: v.id("vehicles"),
    
    // Snapshot of booking data at time of completion
    serviceSnapshot: v.array(v.string()), // service names
    totalPrice: v.number(), // final price paid
    
    // Timestamps
    bookedAt: v.number(),
    completedAt: v.optional(v.number()),
    
    // Ratings
    customerRating: v.optional(v.number()),
    customerFeedback: v.optional(v.string()),
    
    // Photos (before/after URLs)
    beforePhotos: v.optional(v.array(v.string())),
    afterPhotos: v.optional(v.array(v.string())),
    
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_booking", ["bookingId"])
    .index("by_completed_at", ["completedAt"]),

  // ---------- WARRANTIES TABLE (New - Anolla Spec) ----------
  warranties: defineTable({
    bookingId: v.id("bookings"),
    userId: v.id("users"),
    vehicleId: v.id("vehicles"),
    studioId: v.id("studios"),
    
    warrantyType: v.union(
      v.literal("workmanship"),
      v.literal("product"),
      v.literal("ceramic"),
      v.literal("ppf")
    ),
    
    // Coverage
    coverageDetails: v.string(), // what it covers
    durationMonths: v.number(),
    
    // Status
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("void"),
      v.literal("claimed")
    ),
    
    startDate: v.number(), // when warranty begins
    endDate: v.number(), // calculated: startDate + durationMonths
    
    // Claim info
    claimCount: v.number(),
    lastClaimDate: v.optional(v.number()),
    
    termsUrl: v.optional(v.string()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_booking", ["bookingId"])
    .index("by_status", ["status"])
    .index("by_end_date", ["endDate"]),

  // ---------- AI DATA TABLE (Enhanced with RAG Support) ----------
  aiData: defineTable({
    type: aiDataTypeEnum,
    
    // For embeddings: float32 array stored as typed array
    // RAG vector index: Use external vector DB (Pinecone/Milvus) or
    // Convex's $cardinalityScore for approximate nearest neighbor queries.
    // Production RAG setup:
    // 1. Generate embeddings via OpenAI/Cohere
    // 2. Store in this table with vector field
    // 3. Use external vector DB for similarity search
    // 4. Keep metadata in Convex for joins
    vector: v.optional(v.array(v.float64())), // Embedding vector (1536 dims for OpenAI text-embedding-3-small)
    
    // Semantic metadata for filtering
    metadata: v.object({
      source: v.optional(v.string()), // "services", "knowledge_base", etc.
      title: v.optional(v.string()),
      content: v.optional(v.string()), // Text content for embedding
      tags: v.optional(v.array(v.string())),
      serviceCategory: v.optional(serviceCategoryEnum),
    }),
    
    // Relationships
    relatedUserId: v.optional(v.id("users")),
    relatedBookingId: v.optional(v.id("bookings")),
    relatedServiceId: v.optional(v.id("services")),
    
    // Usage tracking
    queryCount: v.number(),
    lastQueriedAt: v.optional(v.number()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_user", ["relatedUserId"])
    .index("by_booking", ["relatedBookingId"])
    .index("by_service", ["relatedServiceId"])
    .index("by_created_at", ["createdAt"])
    .index("by_query_count", ["queryCount"]),
  
  // NOTE: For production RAG, add a vector index comment:
  // .vectorIndex("by_vector", { vectorField: "vector", dimensions: 1536 })
  // This requires Convex Cloud or external vector DB integration.

  // ---------- ANALYTICS COUNTERS (Using @convex-dev/sharded-counter) ----------
  // The sharded counter component manages these automatically
  // Usage in mutations:
  //   await useCounter(components.shardedCounter, "bookings", bookingId).increment();

  // ---------- SHARDED COUNTERS TABLE (Managed by component) ----------
  // Note: @convex-dev/sharded-counter creates its own internal table
  // This is just a reference - do not modify manually
  
});