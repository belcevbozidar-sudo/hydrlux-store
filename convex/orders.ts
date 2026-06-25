import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Input-sanitisation helpers. The /api/order endpoint is public and
// unauthenticated, so every field here must be treated as hostile input and
// clamped to sane bounds before it touches the database / admin dashboard.
// ---------------------------------------------------------------------------
const MAX_ITEMS = 100;
const EMAIL_RE = /^[^\s@]{1,128}@[^\s@]{1,128}\.[^\s@]{1,64}$/;

function clampStr(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

// Order numbers end up inside an inline onchange="..." handler in the admin
// dashboard, so restrict them to an unambiguously safe charset.
function safeOrderNumber(value: unknown): string {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || `ORD-${Date.now()}`;
}

function safeMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Cap to a generous ceiling to reject absurd / overflow values.
  return Math.min(n, 100_000_000);
}

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
    const o = args.order;

    // Reject obviously malformed contact details.
    const email = clampStr(o.customer.email, 254).toLowerCase().trim();
    if (o.delivery !== "quick_order" && !EMAIL_RE.test(email)) {
      return { ok: false, error: "Невалиден имейл адрес." };
    }

    if (!Array.isArray(o.items) || o.items.length === 0 || o.items.length > MAX_ITEMS) {
      return { ok: false, error: "Невалидна поръчка." };
    }

    // Build a sanitised, length-capped copy. Crucially, `status` is forced to
    // "new" here so a client can never submit an order pre-marked as paid, and
    // every free-text field is clamped to stop storage abuse.
    const sanitized = {
      orderNumber: safeOrderNumber(o.orderNumber),
      customer: {
        name: clampStr(o.customer.name, 200),
        phone: clampStr(o.customer.phone, 40),
        email,
      },
      items: o.items.slice(0, MAX_ITEMS).map((item: any) => ({
        ...item,
        name: clampStr(item?.name, 300),
        code: item?.code !== undefined ? clampStr(item.code, 80) : item?.code,
        variantName: item?.variantName !== undefined ? clampStr(item.variantName, 200) : item?.variantName,
        specsText: item?.specsText !== undefined ? clampStr(item.specsText, 500) : item?.specsText,
        productId: item?.productId !== undefined ? clampStr(item.productId, 120) : item?.productId,
        quantity: Math.max(0, Math.min(100000, Math.floor(Number(item?.quantity) || 0))),
        priceEur: safeMoney(item?.priceEur),
      })),
      totals: {
        eur: safeMoney(o.totals.eur),
        bgn: safeMoney(o.totals.bgn),
      },
      delivery: clampStr(o.delivery, 40),
      city: clampStr(o.city, 120),
      postcode: clampStr(o.postcode, 20),
      address: clampStr(o.address, 400),
      paymentMethod: clampStr(o.paymentMethod, 40),
      invoiceDetails: o.invoiceDetails
        ? {
            companyName: clampStr(o.invoiceDetails.companyName, 200),
            bulstat: clampStr(o.invoiceDetails.bulstat, 40),
            mol: clampStr(o.invoiceDetails.mol, 200),
            address: clampStr(o.invoiceDetails.address, 400),
          }
        : null,
      notes: clampStr(o.notes, 2000),
      status: "new",
      createdAt: Date.now(),
    };

    const id = await ctx.db.insert("orders", sanitized);
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
