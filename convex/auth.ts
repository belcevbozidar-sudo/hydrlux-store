import { internalQuery, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Customer sessions live for 30 days.
const USER_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

// The public OAuth client id. Override via the GOOGLE_CLIENT_ID env var.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "319386067027-lvi2v05qt8sca7ppr3s8ukqk8oak530q.apps.googleusercontent.com";

function generateToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

// Issues a fresh session row for a logged-in customer and returns the token.
async function createUserSession(ctx: any, userId: any, email: string): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await ctx.db.insert("userSessions", {
    token,
    userId,
    email,
    createdAt: now,
    expiresAt: now + USER_SESSION_TTL,
  });
  return token;
}

// ---------------------------------------------------------------------------
// Password storage.
//
// The browser sends a fast SHA-256 of the password (this wire format is kept
// unchanged so nothing on the client breaks). On the server we additionally
// run that value through PBKDF2-HMAC-SHA256 with a random per-user salt before
// storing it. This means a database leak no longer exposes anything usable:
// the stored value is a slow, salted hash that cannot be replayed to log in.
//
// Stored format:  pbkdf2$<iterations>$<saltHex>$<hashHex>
// Legacy records (plain 64-char SHA-256 hex) are verified the old way and then
// transparently upgraded on the next successful login — so no existing user
// ever has to reset their password and nobody notices a change.
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 150000;

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function randomSaltHex(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison to avoid leaking match progress via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(clientHash: string, saltHex: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientHash),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}

// Produces the value to persist for a freshly supplied client hash.
async function hashForStorage(clientHash: string): Promise<string> {
  const saltHex = randomSaltHex();
  const hash = await pbkdf2(clientHash, saltHex, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hash}`;
}

// Verifies a client hash against a stored value. When `upgrade` is returned the
// caller should persist it (legacy record being migrated to the new format).
async function verifyPassword(
  clientHash: string,
  stored: string
): Promise<{ ok: boolean; upgrade?: string }> {
  if (stored === "GOOGLE_OAUTH_USER") return { ok: false };

  if (stored.startsWith("pbkdf2$")) {
    const parts = stored.split("$");
    const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
    const saltHex = parts[2] || "";
    const expected = parts[3] || "";
    const actual = await pbkdf2(clientHash, saltHex, iterations);
    return { ok: timingSafeEqual(actual, expected) };
  }

  // Legacy: stored value is the plain client SHA-256 hash.
  if (timingSafeEqual(stored, clientHash)) {
    return { ok: true, upgrade: await hashForStorage(clientHash) };
  }
  return { ok: false };
}

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

    const safeName = String(args.name ?? "").slice(0, 200).trim() || "Потребител";
    const storedHash = await hashForStorage(args.passwordHash);
    const userId = await ctx.db.insert("users", {
      name: safeName,
      email: emailLower,
      passwordHash: storedHash,
      createdAt: Date.now(),
    });

    const token = await createUserSession(ctx, userId, emailLower);
    return { ok: true, userId, name: safeName, email: emailLower, token };
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

    if (!user) {
      return { ok: false, error: "Грешен имейл или парола." };
    }

    const verdict = await verifyPassword(args.passwordHash, user.passwordHash);
    if (!verdict.ok) {
      return { ok: false, error: "Грешен имейл или парола." };
    }

    // Transparently migrate a legacy hash to the stronger stored format.
    if (verdict.upgrade) {
      await ctx.db.patch(user._id, { passwordHash: verdict.upgrade });
    }

    const token = await createUserSession(ctx, user._id, user.email);
    return {
      ok: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl || undefined,
      token,
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
      const token = await createUserSession(ctx, userId, emailLower);
      return {
        ok: true,
        userId,
        name: args.name,
        email: emailLower,
        avatarUrl: args.avatarUrl,
        token,
      };
    } else {
      // Update Google details if missing
      const patchObj: any = {};
      if (!user.googleId) patchObj.googleId = args.googleId;
      if (args.avatarUrl && user.avatarUrl !== args.avatarUrl) patchObj.avatarUrl = args.avatarUrl;

      if (Object.keys(patchObj).length > 0) {
        await ctx.db.patch(user._id, patchObj);
      }

      const token = await createUserSession(ctx, user._id, user.email);
      return {
        ok: true,
        userId: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: args.avatarUrl || user.avatarUrl || undefined,
        token,
      };
    }
  },
});

// Verify a customer session token and return the bound email/userId.
export const verifyUserSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session) return { ok: false };
    if (session.expiresAt && Date.now() > session.expiresAt) return { ok: false };

    return { ok: true, email: session.email, userId: session.userId };
  },
});

// Server-side verification of a Google Sign-In credential (ID token / JWT).
// The browser cannot be trusted to send a valid identity, so we validate the
// token directly with Google before creating or accessing any account.
export const googleVerify = internalAction({
  args: { credential: v.string() },
  handler: async (ctx, args) => {
    if (!args.credential || args.credential.length > 4096) {
      return { ok: false, error: "Невалиден Google токен." };
    }

    let payload: any;
    try {
      const resp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(args.credential)}`
      );
      if (!resp.ok) {
        return { ok: false, error: "Неуспешна верификация на Google токен." };
      }
      payload = await resp.json();
    } catch {
      return { ok: false, error: "Грешка при връзка с Google." };
    }

    // Validate audience (token was actually issued for our app), issuer and
    // that the email was verified by Google.
    const audOk = payload.aud === GOOGLE_CLIENT_ID;
    const issOk = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";

    if (!audOk || !issOk || !emailVerified || !payload.email || !payload.sub) {
      return { ok: false, error: "Google профилът не може да бъде потвърден." };
    }

    const result = await ctx.runMutation(internal.auth.googleLogin, {
      name: String(payload.name || "Google Потребител").slice(0, 200),
      email: String(payload.email).slice(0, 254),
      googleId: String(payload.sub).slice(0, 128),
      avatarUrl: payload.picture ? String(payload.picture).slice(0, 1024) : undefined,
    });

    return result;
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
