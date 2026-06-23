import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Simple fixed-window rate limiter. `key` is typically "<bucket>:<ip>".
// Returns { allowed: boolean, retryAfter: ms-until-window-reset }.
export const hit = internalMutation({
  args: {
    key: v.string(),
    max: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!existing) {
      await ctx.db.insert("rateLimits", { key: args.key, count: 1, windowStart: now });
      return { allowed: true, retryAfter: 0 };
    }

    // Window expired -> reset.
    if (now - existing.windowStart >= args.windowMs) {
      await ctx.db.patch(existing._id, { count: 1, windowStart: now });
      return { allowed: true, retryAfter: 0 };
    }

    if (existing.count >= args.max) {
      return { allowed: false, retryAfter: args.windowMs - (now - existing.windowStart) };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true, retryAfter: 0 };
  },
});
