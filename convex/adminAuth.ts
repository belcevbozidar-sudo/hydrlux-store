import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Prefer the ADMIN_PASSWORD_HASH environment variable (set in the Convex
// dashboard) so the secret is not hard-coded in source control. Falls back to
// the previous baked-in hash so existing deployments keep working until the
// env var is configured.
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  "278bd7484de825592160c7eb2db3a7190b0341b85073aa23142a5a09bc44b422";
const LOCKOUT_TIME = 60 * 60 * 1000; // 1 hour in ms
const MAX_ATTEMPTS = 3;

// Helper to generate SHA-256 hash using the Web Crypto API
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// Helper to generate secure random UUID
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

// Helper to check lockout status
async function getLockout(ctx: any, ip: string, clientId: string) {
  const now = Date.now();

  if (ip && ip !== "unknown") {
    const ipAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_ip", (q: any) => q.eq("ip", ip))
      .first();
    if (ipAttempt && ipAttempt.count >= MAX_ATTEMPTS && (now - ipAttempt.lastAttempt) < LOCKOUT_TIME) {
      return { locked: true, remaining: LOCKOUT_TIME - (now - ipAttempt.lastAttempt) };
    }
  }

  if (clientId && clientId !== "unknown") {
    const clientAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_clientId", (q: any) => q.eq("clientId", clientId))
      .first();
    if (clientAttempt && clientAttempt.count >= MAX_ATTEMPTS && (now - clientAttempt.lastAttempt) < LOCKOUT_TIME) {
      return { locked: true, remaining: LOCKOUT_TIME - (now - clientAttempt.lastAttempt) };
    }
  }

  return { locked: false, remaining: 0 };
}

// Helper to record failed attempt
async function recordFailedAttempt(ctx: any, ip: string, clientId: string) {
  const now = Date.now();

  if (ip && ip !== "unknown") {
    const ipAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_ip", (q: any) => q.eq("ip", ip))
      .first();

    if (ipAttempt) {
      const isOld = (now - ipAttempt.lastAttempt) >= LOCKOUT_TIME;
      const newCount = isOld ? 1 : ipAttempt.count + 1;
      await ctx.db.patch(ipAttempt._id, { count: newCount, lastAttempt: now });
    } else {
      await ctx.db.insert("adminAttempts", { ip, clientId, count: 1, lastAttempt: now });
    }
  }

  if (clientId && clientId !== "unknown") {
    const clientAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_clientId", (q: any) => q.eq("clientId", clientId))
      .first();

    if (clientAttempt) {
      const isOld = (now - clientAttempt.lastAttempt) >= LOCKOUT_TIME;
      const newCount = isOld ? 1 : clientAttempt.count + 1;
      await ctx.db.patch(clientAttempt._id, { count: newCount, lastAttempt: now });
    } else {
      await ctx.db.insert("adminAttempts", { ip, clientId, count: 1, lastAttempt: now });
    }
  }
}

// Helper to clear attempts on success
async function resetAttempts(ctx: any, ip: string, clientId: string) {
  if (ip && ip !== "unknown") {
    const ipAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_ip", (q: any) => q.eq("ip", ip))
      .first();
    if (ipAttempt) {
      await ctx.db.patch(ipAttempt._id, { count: 0 });
    }
  }

  if (clientId && clientId !== "unknown") {
    const clientAttempt = await ctx.db
      .query("adminAttempts")
      .withIndex("by_clientId", (q: any) => q.eq("clientId", clientId))
      .first();
    if (clientAttempt) {
      await ctx.db.patch(clientAttempt._id, { count: 0 });
    }
  }
}

// Mutation to perform admin login
export const adminLogin = internalMutation({
  args: {
    password: v.string(),
    clientId: v.string(),
    ip: v.string(),
    rememberMe: v.boolean(),
  },
  handler: async (ctx, args) => {
    // 1. Check lockout status
    const lockout = await getLockout(ctx, args.ip, args.clientId);
    if (lockout.locked) {
      const minutes = Math.ceil(lockout.remaining / 60000);
      return { ok: false, error: `Твърде много неуспешни опити. Моля, изчакайте още ${minutes} минути.`, lockout: true };
    }

    // 2. Verify password
    const hashed = await sha256(args.password);
    if (hashed !== ADMIN_PASSWORD_HASH) {
      await recordFailedAttempt(ctx, args.ip, args.clientId);
      const currentIpAttempt = (args.ip && args.ip !== "unknown") 
        ? await ctx.db
            .query("adminAttempts")
            .withIndex("by_ip", (q: any) => q.eq("ip", args.ip))
            .first()
        : null;
      const count = currentIpAttempt ? currentIpAttempt.count : 1;
      const left = Math.max(0, MAX_ATTEMPTS - count);
      return { ok: false, error: `Грешна парола! Остават ви още ${left} опита.`, attemptsLeft: left };
    }

    // 3. Clear attempts on success
    await resetAttempts(ctx, args.ip, args.clientId);

    // 4. Generate token
    const token = generateUUID();

    // 5. Store session
    const now = Date.now();
    const expiresAt = args.rememberMe ? undefined : now + 2 * 60 * 60 * 1000; // 2 hours if not "remember me"
    
    await ctx.db.insert("adminSessions", {
      token,
      createdAt: now,
      expiresAt,
    });

    return { ok: true, token };
  },
});

// Query to check session token validity
export const verifySession = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (!session) {
      return { ok: false };
    }

    const now = Date.now();
    if (session.expiresAt && now > session.expiresAt) {
      return { ok: false };
    }

    return { ok: true };
  },
});
