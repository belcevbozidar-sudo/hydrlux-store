import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Single document table to store categories, products, and configurations
  state: defineTable({
    products: v.any(), // Can be raw array or compressed format { __compressed: true, data: string }
    categories: v.any(),
    builderOptions: v.any(),
    tableTemplates: v.any(),
    deletedProductIds: v.optional(v.array(v.string())),
    deletedCategoryIds: v.optional(v.array(v.string())),
    productsUpdatedAt: v.optional(v.number()),
    categoriesUpdatedAt: v.optional(v.number()),
  }),

  // Customer orders
  orders: defineTable({
    orderNumber: v.string(),
    customer: v.object({
      name: v.string(),
      phone: v.string(),
      email: v.string(),
    }),
    items: v.array(v.any()),
    totals: v.object({
      eur: v.number(),
      bgn: v.number(),
    }),
    delivery: v.string(),
    city: v.string(),
    postcode: v.string(),
    address: v.string(),
    paymentMethod: v.string(),
    invoiceDetails: v.union(v.null(), v.object({
      companyName: v.string(),
      bulstat: v.string(),
      mol: v.string(),
      address: v.string(),
    })),
    notes: v.string(),
    status: v.string(), // "new", "paid", "processing", "completed", "cancelled"
    createdAt: v.number(),
  }).index("by_email", ["customer.email"]),

  // User accounts
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    avatarUrl: v.optional(v.string()),
    googleId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Archived products log
  productArchive: defineTable({
    productId: v.string(),
    data: v.any(),
    reason: v.string(),
    archivedAt: v.number(),
    restoredAt: v.optional(v.number()),
  }),

  // Admin login attempts for security lockout
  adminAttempts: defineTable({
    ip: v.string(),
    clientId: v.string(),
    count: v.number(),
    lastAttempt: v.number(),
  }).index("by_ip", ["ip"]).index("by_clientId", ["clientId"]),

  // Admin active sessions
  adminSessions: defineTable({
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  // Logged-in customer sessions (used to authorise access to a user's own orders)
  userSessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    email: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  // Generic fixed-window rate-limit counters keyed by "<bucket>:<ip>"
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
