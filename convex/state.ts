import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get the single state document
export const getState = query({
  args: {},
  handler: async (ctx) => {
    const stateDoc = await ctx.db.query("state").first();
    if (!stateDoc) {
      return { state: {} };
    }
    return { state: stateDoc };
  },
});

// Save or overwrite the entire state
export const saveState = mutation({
  args: {
    products: v.any(),
    categories: v.any(),
    builderOptions: v.any(),
    tableTemplates: v.any(),
    deletedProductIds: v.optional(v.array(v.string())),
    deletedCategoryIds: v.optional(v.array(v.string())),
    lastProductsUpdatedAt: v.optional(v.number()),
    lastCategoriesUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("state").first();
    const now = Date.now();

    const stateObj = {
      products: args.products,
      categories: args.categories,
      builderOptions: args.builderOptions,
      tableTemplates: args.tableTemplates,
      deletedProductIds: args.deletedProductIds || [],
      deletedCategoryIds: args.deletedCategoryIds || [],
      productsUpdatedAt: now,
      categoriesUpdatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, stateObj);
    } else {
      await ctx.db.insert("state", stateObj);
    }

    return { ok: true, updatedAt: now };
  },
});

// Update a single key in the state (e.g. products or categories)
export const saveStateValue = mutation({
  args: {
    key: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("state").first();
    const now = Date.now();

    if (!existing) {
      // Create empty state if it doesn't exist
      const stateObj: any = {
        products: [],
        categories: [],
        builderOptions: {},
        tableTemplates: [],
        deletedProductIds: [],
        deletedCategoryIds: [],
        productsUpdatedAt: now,
        categoriesUpdatedAt: now,
      };
      stateObj[args.key] = args.value;
      await ctx.db.insert("state", stateObj);
      return { ok: true, updatedAt: now };
    }

    const patchObj: any = {};
    patchObj[args.key] = args.value;
    if (args.key === "products") {
      patchObj.productsUpdatedAt = now;
    } else if (args.key === "categories") {
      patchObj.categoriesUpdatedAt = now;
    }

    await ctx.db.patch(existing._id, patchObj);
    return { ok: true, updatedAt: now };
  },
});
