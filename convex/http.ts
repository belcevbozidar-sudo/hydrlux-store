import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const noCacheHeaders = {
  ...corsHeaders,
  "Cache-Control": "no-cache, no-store, must-revalidate, private",
  "Pragma": "no-cache",
  "Expires": "0",
};

// CORS preflight handler helper
const handlePreflight = () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

// Helper to extract the actual client IP reliably, preventing spoofing
function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // The load balancer appends the client's TCP IP to the end of the chain.
      // So the last element is the non-spoofable connection source.
      return parts[parts.length - 1];
    }
  }

  return "unknown";
}

// Helper to extract a Bearer token from the Authorization header
function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.substring(7).trim();
}

// Helper to verify admin auth token
async function verifySessionToken(ctx: any, request: Request): Promise<boolean> {
  const token = getBearerToken(request);
  if (!token) return false;
  const session = await ctx.runQuery(internal.adminAuth.verifySession, { token });
  return session.ok === true;
}

// Helper to verify a customer session token; returns the bound email or null.
async function verifyUserToken(ctx: any, request: Request): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const session = await ctx.runQuery(internal.auth.verifyUserSession, { token });
  return session.ok === true ? session.email : null;
}

// Helper: fixed-window per-IP rate limiting. Returns true when the request is
// allowed, false when the caller has exceeded the bucket's limit.
async function rateLimitOk(
  ctx: any,
  request: Request,
  bucket: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const ip = getClientIp(request);
  const res = await ctx.runMutation(internal.rateLimit.hit, {
    key: `${bucket}:${ip}`,
    max,
    windowMs,
  });
  return res.allowed === true;
}

const tooManyRequests = () =>
  new Response(JSON.stringify({ ok: false, error: "Твърде много заявки. Моля, опитайте по-късно." }), {
    status: 429,
    headers: corsHeaders,
  });

// ==========================================================================
// ADMIN AUTHENTICATION ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/admin/login",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/admin/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    
    const ip = getClientIp(request);
               
    const res = await ctx.runMutation(internal.adminAuth.adminLogin, {
      password: body.password || "",
      clientId: body.clientId || "unknown",
      ip: ip,
      rememberMe: body.rememberMe || false,
    });
    
    if (!res.ok) {
      // 1-second delay for failed logins to mitigate brute force speed
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/admin/verify",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/admin/verify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorized = await verifySessionToken(ctx, request);
    return new Response(JSON.stringify({ ok: authorized }), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// API STATE ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/state",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/state",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // PUBLIC READ endpoint
    const res = await ctx.runQuery(internal.state.getState, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: noCacheHeaders,
    });
  }),
});

http.route({
  path: "/api/state",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED WRITE endpoint
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.state.saveState, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/state-value",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/state-value",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED WRITE endpoint
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.state.saveStateValue, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// ORDER ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/order",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/order",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // PUBLIC SUBMIT endpoint - rate limited to curb spam / abuse.
    if (!(await rateLimitOk(ctx, request, "order", 10, 60 * 1000))) {
      return tooManyRequests();
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.orders.saveOrder, body);
    
    if (res.ok) {
      try {
        const order = body.order;
        const isQuick = order.delivery === "quick_order";
        const title = isQuick 
          ? `⚡ Бърза поръчка ${order.orderNumber}`
          : `📦 Нова поръчка ${order.orderNumber}`;
        const tags = isQuick ? "zap,shopping_bags" : "shopping_bags";
        
        let ntfyMessage = `Клиент: ${order.customer?.name || "Неизвестен"}\n`;
        ntfyMessage += `Телефон: ${order.customer?.phone || "Неизвестен"}\n`;
        if (order.customer?.email) ntfyMessage += `Имейл: ${order.customer.email}\n`;
        ntfyMessage += `Доставка: ${order.delivery || "Неизвестно"}\n`;
        
        if (!isQuick && (order.city || order.address)) {
          ntfyMessage += `Адрес: ${order.postcode || ""} ${order.city || ""}, ${order.address || ""}\n`;
        }
        
        ntfyMessage += `\nПродукти:\n`;
        if (Array.isArray(order.items)) {
          for (const item of order.items) {
            const variantInfo = item.variantName ? ` (${item.variantName})` : "";
            const specsInfo = item.specsText ? `\nСпец: ${item.specsText}` : "";
            const priceText = item.priceEur !== undefined ? Number(item.priceEur).toFixed(2) : "0.00";
            ntfyMessage += `- ${item.name || ""}${variantInfo} x${item.quantity || 1} - ${priceText} EUR${specsInfo}\n`;
          }
        }
        
        const totalEur = order.totals?.eur !== undefined ? Number(order.totals.eur).toFixed(2) : "0.00";
        ntfyMessage += `\nОбщо: ${totalEur} EUR`;
        if (order.notes) ntfyMessage += `\nБележка:\n${order.notes}`;
        
        const url = new URL("https://ntfy.sh/hydrolux-orders-alert-2026");
        url.searchParams.append("title", title);
        url.searchParams.append("tags", tags);
        url.searchParams.append("priority", "high");
        
        await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          body: ntfyMessage,
        });
      } catch (err) {
        console.error("Failed to send Ntfy notification for order:", err);
      }
    }

    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/inquiry",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/inquiry",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Rate limit to prevent spam
    if (!(await rateLimitOk(ctx, request, "inquiry", 10, 60 * 1000))) {
      return tooManyRequests();
    }
    
    const body = await request.json();
    const { type, name, phone, email, subject, message, details } = body;
    
    // Format Ntfy message
    let title = "";
    let tags = "";
    let ntfyMessage = `Клиент: ${name || "Неизвестен"}\n`;
    ntfyMessage += `Телефон: ${phone || "Неизвестен"}\n`;
    if (email) ntfyMessage += `Имейл: ${email}\n`;
    
    if (type === "product") {
      title = `❓ Въпрос за продукт: ${subject || "Без тема"}`;
      tags = "question,speech_balloon";
      if (message) ntfyMessage += `\nВъпрос:\n${message}`;
    } else if (type === "contact") {
      title = `✉️ Ново запитване / Контакт`;
      tags = "incoming_envelope,speech_balloon";
      if (message) ntfyMessage += `\nСъобщение:\n${message}`;
    } else if (type === "builder") {
      title = `⚙️ Запитване за маркуч (Конфигуратор)`;
      tags = "nut_and_bolt,hammer_and_wrench";
      if (details) ntfyMessage += `\nСпецификация:\n${details}\n`;
      if (message) ntfyMessage += `\nБележка:\n${message}`;
    } else {
      title = `Форма: ${subject || "Запитване"}`;
      tags = "memo";
      if (message) ntfyMessage += `\nСъобщение:\n${message}`;
    }
    
    // Send to Ntfy
    try {
      const url = new URL("https://ntfy.sh/hydrolux-orders-alert-2026");
      url.searchParams.append("title", title);
      if (tags) url.searchParams.append("tags", tags);
      url.searchParams.append("priority", "high");
      
      await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: ntfyMessage,
      });
    } catch (err) {
      console.error("Failed to send Ntfy notification for inquiry:", err);
    }
    
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/admin/orders",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/admin/orders",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // SECURED GET orders list
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const res = await ctx.runQuery(internal.orders.getAllOrders, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: noCacheHeaders,
    });
  }),
});

http.route({
  path: "/api/admin/order/status",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/admin/order/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED POST update order status
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.orders.updateOrderStatus, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// CART & HEARTBEAT ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/cart",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/cart",
  method: "POST",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/heartbeat",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/heartbeat",
  method: "POST",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// USER AUTH ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/auth/register",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/auth/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await rateLimitOk(ctx, request, "register", 10, 60 * 1000))) {
      return tooManyRequests();
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.auth.register, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/auth/login",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/auth/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Rate limit login to slow credential-stuffing / brute force.
    if (!(await rateLimitOk(ctx, request, "login", 10, 60 * 1000))) {
      return tooManyRequests();
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.auth.login, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/auth/google",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/auth/google",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await rateLimitOk(ctx, request, "google", 20, 60 * 1000))) {
      return tooManyRequests();
    }
    const body = await request.json();
    // The browser sends the raw Google credential (ID token); it is verified
    // server-side before any account is created or accessed.
    const res = await ctx.runAction(internal.auth.googleVerify, {
      credential: body.credential || "",
    });
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/auth/orders",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/auth/orders",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // SECURED: a customer may only read their OWN orders. The email is taken
    // from the verified session token, never from a client-supplied parameter,
    // which closes the previous IDOR that exposed every customer's PII.
    const email = await verifyUserToken(ctx, request);
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const res = await ctx.runQuery(internal.orders.getUserOrders, { email });
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: noCacheHeaders,
    });
  }),
});

// ==========================================================================
// CHATBOT ENDPOINT
// ==========================================================================
http.route({
  path: "/api/chatbot",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/chatbot",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Rate limit to prevent LLM cost abuse / DoS via the public chatbot.
    if (!(await rateLimitOk(ctx, request, "chatbot", 15, 60 * 1000))) {
      return tooManyRequests();
    }
    const body = await request.json();
    const res = await ctx.runAction(internal.chatbot.chatbot, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// PRODUCT ARCHIVE ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/product-archive",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/product-archive",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED product archive
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.auth.archiveProduct, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/product-archive",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // SECURED get archive
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const res = await ctx.runQuery(internal.auth.getArchivedProducts, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: noCacheHeaders,
    });
  }),
});

http.route({
  path: "/api/product-archive/restore",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/product-archive/restore",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED restore product
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const body = await request.json();
    const res = await ctx.runMutation(internal.auth.restoreArchivedProduct, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// ==========================================================================
// FILE UPLOAD AND SERVING ENDPOINTS
// ==========================================================================
http.route({
  path: "/api/file",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/file",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const storageId = url.searchParams.get("storageId");
    if (!storageId) {
      return new Response(JSON.stringify({ error: "Missing storageId parameter" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    try {
      const blob = await ctx.storage.get(storageId);
      if (!blob) {
        return new Response(JSON.stringify({ error: "File not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      return new Response(blob, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": blob.type || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

http.route({
  path: "/api/pdf-upload",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/pdf-upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // SECURED pdf/image file upload
    if (!(await verifySessionToken(ctx, request))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    try {
      const blob = await request.blob();
      const storageId = await ctx.storage.store(blob);
      const requestUrl = new URL(request.url);
      const baseUrl = requestUrl.origin;
      const url = `${baseUrl}/api/file?storageId=${storageId}`;
      return new Response(JSON.stringify({ ok: true, storageId, url }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

export default http;
