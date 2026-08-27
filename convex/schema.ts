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
    // Bound to the authenticated customer who placed the order (when logged in).
    // Order history is queried by this id — NOT by email — so that registering
    // someone else's email address grants no access to their orders.
    userId: v.optional(v.id("users")),
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
  }).index("by_email", ["customer.email"]).index("by_userId", ["userId"]),

  // User accounts
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    avatarUrl: v.optional(v.string()),
    googleId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Automatic snapshots of `state`, taken right before every overwrite (and
  // before every restore). Gives the admin panel something to roll back to
  // and a timeline of when the catalog actually changed.
  stateBackups: defineTable({
    products: v.any(),
    categories: v.any(),
    builderOptions: v.any(),
    tableTemplates: v.any(),
    productsUpdatedAt: v.optional(v.number()),
    categoriesUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

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

  // Дневни посещения: по един ред на посетител за ден (Europe/Sofia).
  // Уникални посетители за деня = броят редове; прегледи = сборът от views.
  siteVisits: defineTable({
    day: v.string(),        // "YYYY-MM-DD"
    visitorId: v.string(),
    views: v.number(),
    firstSeen: v.number(),
    lastSeen: v.number(),
  }).index("by_day", ["day"]).index("by_day_visitor", ["day", "visitorId"]),

  // Generic fixed-window rate-limit counters keyed by "<bucket>:<ip>"
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
