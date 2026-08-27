"use node";

// One-off maintenance helpers, runnable only from the Convex CLI
// (`npx convex run adminTools:...`). They are internalActions, so they are not
// reachable over HTTP and cannot be triggered from the site or the panel.
//
// Deleting a product through the admin panel archives it first, then rewrites
// the catalog. These helpers do exactly the same, for cases where the panel is
// not usable — the product still lands in "Архив (изтрити)" and stays
// restorable, and state.saveStateValue snapshots the catalog before writing.

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import zlib from "zlib";

function compressString(str: string): string {
  return zlib.gzipSync(Buffer.from(str, "utf-8")).toString("base64");
}

function decompressString(base64: string): string {
  return zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf-8");
}

export const deleteProductById = internalAction({
  args: {
    productId: v.string(),
    // Guard against a mistyped id silently deleting the wrong row: the caller
    // must also state the code it expects to find on that product.
    expectedCode: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const stateResult = await ctx.runQuery(internal.state.getState, {});
    const state: any = stateResult.state;
    if (!state || !state.products) {
      return { ok: false, error: "no_state" };
    }

    let products = state.products;
    let isCompressed = false;
    if (products && products.__compressed) {
      products = JSON.parse(decompressString(products.data));
      isCompressed = true;
    }
    if (!Array.isArray(products)) {
      return { ok: false, error: "products_not_array" };
    }

    const target = products.find((p: any) => p && p.id === args.productId);
    if (!target) {
      return { ok: false, error: "not_found", productId: args.productId };
    }
    if (String(target.code) !== args.expectedCode) {
      return {
        ok: false,
        error: "code_mismatch",
        expected: args.expectedCode,
        actual: String(target.code),
      };
    }

    const summary = {
      id: target.id,
      code: target.code,
      name: target.name,
      variantCount: Array.isArray(target.variants) ? target.variants.length : 0,
      remainingProducts: products.length - 1,
    };

    if (args.dryRun) {
      return { ok: true, dryRun: true, wouldDelete: summary };
    }

    // Archive BEFORE removing, exactly as the panel does — if this throws, the
    // catalog is left untouched.
    const archived = await ctx.runMutation(internal.auth.archiveProduct, {
      productId: String(target.id),
      data: target,
      reason: "deleted",
    });

    const remaining = products.filter((p: any) => p && p.id !== args.productId);

    const deletedProductIds: string[] = Array.isArray(state.deletedProductIds)
      ? state.deletedProductIds.map(String)
      : [];
    if (!deletedProductIds.includes(String(args.productId))) {
      deletedProductIds.push(String(args.productId));
    }

    const finalValue = isCompressed
      ? { __compressed: true, data: compressString(JSON.stringify(remaining)) }
      : remaining;

    await ctx.runMutation(internal.state.saveStateValue, {
      key: "products",
      value: finalValue,
    });
    await ctx.runMutation(internal.state.saveStateValue, {
      key: "deletedProductIds",
      value: deletedProductIds,
    });

    return { ok: true, deleted: summary, archiveId: (archived as any).archiveId };
  },
});
