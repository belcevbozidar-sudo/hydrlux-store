import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Промо кодове (напр. Черен петък). Процентът се пази и проверява САМО на
// сървъра: клиентът праща единствено текста на кода, а отстъпката се смята
// от процента в базата — така никой не може да си „напише" по-голяма отстъпка.
// ---------------------------------------------------------------------------

export const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

export function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Общата проверка, ползвана и от валидацията в количката, и при записа на
// поръчка. Връща { ok: true, promo } или { ok: false, error }.
export async function checkPromo(ctx: any, rawCode: unknown, subtotalEur: number) {
  const code = normalizeCode(rawCode);
  if (!CODE_RE.test(code)) {
    return { ok: false as const, error: "Невалиден промо код." };
  }
  const promo = await ctx.db
    .query("promoCodes")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .first();

  // Един и същ отговор за „няма такъв" и „изключен" — не издаваме кои кодове съществуват.
  if (!promo || !promo.active) {
    return { ok: false as const, error: "Невалиден или неактивен промо код." };
  }
  const now = Date.now();
  if (promo.startsAt && now < promo.startsAt) {
    return { ok: false as const, error: "Този промо код още не е активен." };
  }
  if (promo.expiresAt && now > promo.expiresAt) {
    return { ok: false as const, error: "Промо кодът е изтекъл." };
  }
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    return { ok: false as const, error: "Промо кодът е изчерпан." };
  }
  if (promo.minOrderEur && subtotalEur < promo.minOrderEur) {
    return {
      ok: false as const,
      error: `Промо кодът важи за поръчки над ${promo.minOrderEur.toFixed(2)} €.`,
    };
  }
  return { ok: true as const, promo };
}

// Публична проверка на код (количка / чекаут).
export const validate = internalQuery({
  args: { code: v.string(), subtotalEur: v.number() },
  handler: async (ctx, args) => {
    const res = await checkPromo(ctx, args.code, Number(args.subtotalEur) || 0);
    if (!res.ok) return res;
    const p = res.promo;
    return {
      ok: true,
      code: p.code,
      percent: p.percent,
      minOrderEur: p.minOrderEur ?? 0,
    };
  },
});

// Банерът на сайта: най-новият активен код, за който е включен банер.
export const getBanner = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const promos = await ctx.db.query("promoCodes").collect();
    const live = promos
      .filter(
        (p) =>
          p.active &&
          p.showBanner &&
          (!p.startsAt || now >= p.startsAt) &&
          (!p.expiresAt || now <= p.expiresAt) &&
          (!p.maxUses || p.usedCount < p.maxUses)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const p = live[0];
    if (!p) return { ok: true, banner: null };
    return {
      ok: true,
      banner: {
        code: p.code,
        percent: p.percent,
        text: p.bannerText || "",
        expiresAt: p.expiresAt ?? null,
      },
    };
  },
});

// ---------------------------- Админ ----------------------------------------

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const promos = await ctx.db.query("promoCodes").collect();
    promos.sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, promos };
  },
});

export const save = internalMutation({
  args: {
    code: v.string(),
    percent: v.number(),
    active: v.boolean(),
    showBanner: v.boolean(),
    bannerText: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    minOrderEur: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    if (!CODE_RE.test(code)) {
      return { ok: false, error: "Кодът трябва да е 3–30 символа: латински букви, цифри, - или _." };
    }
    const percent = Number(args.percent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 90) {
      return { ok: false, error: "Процентът трябва да е между 1 и 90." };
    }
    const fields = {
      code,
      percent: round2(percent),
      active: args.active,
      showBanner: args.showBanner,
      bannerText: (args.bannerText ?? "").trim().slice(0, 200) || undefined,
      startsAt: args.startsAt && args.startsAt > 0 ? args.startsAt : undefined,
      expiresAt: args.expiresAt && args.expiresAt > 0 ? args.expiresAt : undefined,
      minOrderEur: args.minOrderEur && args.minOrderEur > 0 ? round2(args.minOrderEur) : undefined,
      maxUses: args.maxUses && args.maxUses > 0 ? Math.floor(args.maxUses) : undefined,
    };

    const existing = await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (existing) {
      await ctx.db.replace(existing._id, {
        ...fields,
        usedCount: existing.usedCount,
        createdAt: existing.createdAt,
      });
      return { ok: true, updated: true };
    }
    await ctx.db.insert("promoCodes", { ...fields, usedCount: 0, createdAt: Date.now() });
    return { ok: true, updated: false };
  },
});

export const remove = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .first();
    if (!existing) return { ok: false, error: "Кодът не е намерен." };
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
