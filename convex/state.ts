import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// How many automatic snapshots to keep. Each one carries the full (compressed)
// products + categories blob -- currently several hundred KB apiece -- so this
// must stay small enough that reading MAX_BACKUPS+1 of them in one function
// call comfortably clears Convex's 16MB-per-execution read limit even as the
// catalog grows. 15 was chosen with that headroom in mind; raising it without
// moving the payload out of this table risks the exact "Too many bytes read"
// failure this comment replaces.
const MAX_BACKUPS = 15;

// Copies the CURRENT state document into stateBackups before it gets
// overwritten, then trims at most one snapshot beyond MAX_BACKUPS. Called
// right before every save and every restore, so there is always a snapshot
// of "what it looked like a moment ago" — and a trail of when each change
// happened.
async function backupCurrentState(ctx: any, existing: any) {
  if (!existing) return;

  await ctx.db.insert("stateBackups", {
    products: existing.products,
    categories: existing.categories,
    builderOptions: existing.builderOptions,
    tableTemplates: existing.tableTemplates,
    productsUpdatedAt: existing.productsUpdatedAt,
    categoriesUpdatedAt: existing.categoriesUpdatedAt,
    createdAt: Date.now(),
  });

  // Bounded to MAX_BACKUPS+1 whole documents -- reading everything via
  // .collect() here is what previously blew the 16MB read cap once enough
  // backups had piled up, failing every save with an opaque Convex error.
  // Deleting only the single oldest one per save keeps each call's read
  // small and self-corrects within a few saves if the count ever gets ahead.
  const recent = await ctx.db.query("stateBackups").withIndex("by_createdAt").order("desc").take(MAX_BACKUPS + 1);
  if (recent.length > MAX_BACKUPS) {
    await ctx.db.delete(recent[recent.length - 1]._id);
  }
}

// Get the single state document
export const getState = internalQuery({
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
export const saveState = internalMutation({
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

    // Optimistic-concurrency check: the caller sends the productsUpdatedAt /
    // categoriesUpdatedAt it last read. If the stored value has moved on
    // since then, someone else (another tab, another device) saved in the
    // meantime — silently overwriting their work here is exactly the bug
    // that made edits appear to "revert on their own". Refuse instead.
    if (existing) {
      const productsConflict =
        args.lastProductsUpdatedAt !== undefined &&
        existing.productsUpdatedAt !== undefined &&
        existing.productsUpdatedAt !== args.lastProductsUpdatedAt;
      const categoriesConflict =
        args.lastCategoriesUpdatedAt !== undefined &&
        existing.categoriesUpdatedAt !== undefined &&
        existing.categoriesUpdatedAt !== args.lastCategoriesUpdatedAt;

      if (productsConflict || categoriesConflict) {
        return {
          ok: false,
          error: "conflict",
          message:
            "Друго устройство или отворен раздел на панела е записал промени междувременно. " +
            "За да не изтриете тези промени, презаредете страницата и приложете отново вашата редакция.",
        };
      }
    }

    await backupCurrentState(ctx, existing);

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
export const saveStateValue = internalMutation({
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

    if (args.key === "products" || args.key === "categories") {
      await backupCurrentState(ctx, existing);
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

// Lightweight list of available backups (no product/category payloads) for
// the admin panel's "Резервни копия" screen.
export const listBackups = internalQuery({
  args: {},
  handler: async (ctx) => {
    const backups = await ctx.db.query("stateBackups").withIndex("by_createdAt").order("desc").take(MAX_BACKUPS);
    return {
      backups: backups.map((b) => ({
        id: b._id,
        createdAt: b.createdAt,
        productsUpdatedAt: b.productsUpdatedAt,
        categoriesUpdatedAt: b.categoriesUpdatedAt,
        productCount: Array.isArray(b.products) ? b.products.length : null,
      })),
    };
  },
});

// Restores a previous snapshot as the live state. The state that was live
// right before the restore is itself backed up first, so a restore can
// always be undone the same way.
export const restoreBackup = internalMutation({
  args: {
    backupId: v.id("stateBackups"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db.get(args.backupId);
    if (!backup) {
      return { ok: false, error: "not_found", message: "Това резервно копие вече не съществува." };
    }

    const existing = await ctx.db.query("state").first();
    const now = Date.now();

    await backupCurrentState(ctx, existing);

    const stateObj = {
      products: backup.products,
      categories: backup.categories,
      builderOptions: backup.builderOptions,
      tableTemplates: backup.tableTemplates,
      deletedProductIds: existing?.deletedProductIds || [],
      deletedCategoryIds: existing?.deletedCategoryIds || [],
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
