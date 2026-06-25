"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { matches } from "./matches";
import zlib from "zlib";

function compressString(str: string): string {
  const buffer = Buffer.from(str, "utf-8");
  const compressed = zlib.gzipSync(buffer);
  return compressed.toString("base64");
}

function decompressString(base64: string): string {
  const buffer = Buffer.from(base64, "base64");
  const decompressed = zlib.gunzipSync(buffer);
  return decompressed.toString("utf-8");
}

export const migrateBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Starting batch image migration...");
    
    // 1. Fetch current state
    const stateResult = await ctx.runQuery(internal.state.getState, {});
    const state = stateResult.state;
    if (!state || !state.products) {
      console.log("No state or products found in database.");
      return { ok: false, migrated: 0, message: "No state or products found" };
    }

    let products = state.products;
    let isCompressed = false;
    if (products && products.__compressed) {
      products = JSON.parse(decompressString(products.data));
      isCompressed = true;
    }

    if (!Array.isArray(products)) {
      console.log("Products is not an array.");
      return { ok: false, migrated: 0, message: "Invalid products format" };
    }

    // Build map of matches
    const matchMap = new Map(matches.map(m => [m.dbImg, m.waybackUrl]));

    // Find images that need to be migrated in this batch
    const pendingImages = new Set<string>();
    for (const product of products) {
      if (Array.isArray(product.images)) {
        for (const imgUrl of product.images) {
          if (imgUrl && imgUrl.includes('hydrolux.bg') && !imgUrl.includes('/api/file') && matchMap.has(imgUrl)) {
            pendingImages.add(imgUrl);
          }
        }
      }
    }

    console.log(`Total remaining images needing recovery: ${pendingImages.size}`);
    if (pendingImages.size === 0) {
      console.log("All matching images are already migrated!");
      return { ok: true, migrated: 0, message: "All matching images migrated" };
    }

    // Take a batch of up to 20 images
    const batchImages = Array.from(pendingImages).slice(0, 20);
    console.log(`Migrating batch of ${batchImages.length} images...`);

    let successCount = 0;
    let failCount = 0;
    const uploadCache = new Map<string, string>();

    for (const imgUrl of batchImages) {
      const waybackUrl = matchMap.get(imgUrl)!;
      console.log(`Downloading ${waybackUrl}...`);
      try {
        const res = await fetch(waybackUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          }
        });
        if (!res.ok) {
          console.error(`Failed to download ${waybackUrl}: HTTP ${res.status}`);
          failCount++;
          continue;
        }
        const blob = await res.blob();
        const storageId = await ctx.storage.store(blob);
        const newUrl = `/api/file?storageId=${storageId}`;
        uploadCache.set(imgUrl, newUrl);
        successCount++;
        console.log(`Uploaded successfully: ${newUrl}`);
      } catch (err: any) {
        console.error(`Error downloading ${waybackUrl}:`, err.message);
        failCount++;
      }
    }

    if (successCount > 0) {
      // Apply updates to products
      for (const product of products) {
        if (Array.isArray(product.images)) {
          for (let i = 0; i < product.images.length; i++) {
            const currentUrl = product.images[i];
            if (uploadCache.has(currentUrl)) {
              product.images[i] = uploadCache.get(currentUrl)!;
            }
          }
        }
      }

      console.log("Saving updated products state back to database...");
      let finalValue = products;
      if (isCompressed) {
        finalValue = {
          __compressed: true,
          data: compressString(JSON.stringify(products))
        };
      }
      await ctx.runMutation(internal.state.saveStateValue, {
        key: "products",
        value: finalValue
      });
      console.log("State updated successfully!");
    }

    return {
      ok: true,
      migrated: successCount,
      failed: failCount,
      remaining: pendingImages.size - successCount - failCount
    };
  }
});
