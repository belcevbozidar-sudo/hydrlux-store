import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Create a new order
export const saveOrder = internalMutation({
  args: {
    order: v.object({
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
      status: v.string(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("orders", args.order);
    return { ok: true, orderId: id };
  },
});

// Get all orders (Admin Dashboard)
export const getAllOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").order("desc").collect();
    return { ok: true, orders };
  },
});

// Get orders by email (User Profile)
export const getUserOrders = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customer.email", args.email))
      .collect();
    return { ok: true, orders };
  },
});

// Update order status (Admin Dashboard)
export const updateOrderStatus = internalMutation({
  args: {
    orderNumber: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orders")
      .filter((q) => q.eq(q.field("orderNumber"), args.orderNumber))
      .first();

    if (!existing) {
      return { ok: false, error: "Order not found" };
    }

    await ctx.db.patch(existing._id, { status: args.status });
    return { ok: true };
  },
});
