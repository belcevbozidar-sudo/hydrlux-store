import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Register custom email/password user
export const register = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .first();

    if (existing) {
      return { ok: false, error: "Потребител с този имейл вече съществува." };
    }

    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: emailLower,
      passwordHash: args.passwordHash,
      createdAt: Date.now(),
    });

    return { ok: true, userId, name: args.name, email: emailLower };
  },
});

// Login custom email/password user
export const login = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .first();

    if (!user || user.passwordHash !== args.passwordHash) {
      return { ok: false, error: "Грешен имейл или парола." };
    }

    return {
      ok: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl || undefined,
    };
  },
});

// Login or register Google OAuth user
export const googleLogin = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    googleId: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailLower))
      .first();

    if (!user) {
      // Register new Google user
      const userId = await ctx.db.insert("users", {
        name: args.name,
        email: emailLower,
        passwordHash: "GOOGLE_OAUTH_USER",
        googleId: args.googleId,
        avatarUrl: args.avatarUrl,
        createdAt: Date.now(),
      });
      return {
        ok: true,
        userId,
        name: args.name,
        email: emailLower,
        avatarUrl: args.avatarUrl,
      };
    } else {
      // Update Google details if missing
      const patchObj: any = {};
      if (!user.googleId) patchObj.googleId = args.googleId;
      if (args.avatarUrl && user.avatarUrl !== args.avatarUrl) patchObj.avatarUrl = args.avatarUrl;

      if (Object.keys(patchObj).length > 0) {
        await ctx.db.patch(user._id, patchObj);
      }

      return {
        ok: true,
        userId: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: args.avatarUrl || user.avatarUrl || undefined,
      };
    }
  },
});

// Archive a product snapshot before deletion
export const archiveProduct = internalMutation({
  args: {
    productId: v.string(),
    data: v.any(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("productArchive", {
      productId: args.productId,
      data: args.data,
      reason: args.reason,
      archivedAt: Date.now(),
    });
    return { ok: true, archiveId: id };
  },
});

// Get all archived products
export const getArchivedProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("productArchive").order("desc").collect();
    return { ok: true, products };
  },
});

// Restore an archived product
export const restoreArchivedProduct = internalMutation({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    const archived = await ctx.db
      .query("productArchive")
      .filter((q) => q.eq(q.field("productId"), args.productId))
      .collect();

    const target = archived.find((r) => r.restoredAt === undefined) || archived[0];

    if (!target) {
      return { ok: false, error: "Архивираният продукт не е намерен." };
    }

    // Mark as restored in archive instead of deleting
    await ctx.db.patch(target._id, { restoredAt: Date.now() });
    return { ok: true };
  },
});
