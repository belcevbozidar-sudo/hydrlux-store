import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Записва посещение за текущия ден. Един ред на посетител за ден — при
// повторно отваряне на сайта се увеличава само броячът на прегледите.
export const recordVisit = internalMutation({
  args: {
    visitorId: v.string(),
    day: v.string(),
  },
  handler: async (ctx, args) => {
    const visitorId = args.visitorId.slice(0, 64);
    const day = args.day.slice(0, 10);
    const now = Date.now();

    const existing = await ctx.db
      .query("siteVisits")
      .withIndex("by_day_visitor", (q) => q.eq("day", day).eq("visitorId", visitorId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        views: existing.views + 1,
        lastSeen: now,
      });
      return { ok: true, newVisitor: false };
    }

    await ctx.db.insert("siteVisits", {
      day,
      visitorId,
      views: 1,
      firstSeen: now,
      lastSeen: now,
    });
    return { ok: true, newVisitor: true };
  },
});

// Обобщение по дни за последните N дни (по подразбиране 30).
export const getDailyStats = internalQuery({
  args: {
    fromDay: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("siteVisits")
      .withIndex("by_day", (q) => q.gte("day", args.fromDay))
      .collect();

    const byDay = new Map<string, { day: string; visitors: number; views: number }>();
    for (const row of rows) {
      const entry = byDay.get(row.day) || { day: row.day, visitors: 0, views: 0 };
      entry.visitors += 1;
      entry.views += row.views;
      byDay.set(row.day, entry);
    }

    const days = Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
    return { ok: true, days };
  },
});
