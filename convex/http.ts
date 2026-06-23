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

// Helper to verify admin auth token
async function verifySessionToken(ctx: any, request: Request): Promise<boolean> {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return false;
  }
  const session = await ctx.runQuery(internal.adminAuth.verifySession, { token });
  return session.ok === true;
}

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
    // PUBLIC SUBMIT endpoint
    const body = await request.json();
    const res = await ctx.runMutation(internal.orders.saveOrder, body);
    return new Response(JSON.stringify(res), {
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
    const body = await request.json();
    const res = await ctx.runMutation(internal.auth.googleLogin, body);
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
    const url = new URL(request.url);
    const email = url.searchParams.get("email") || "";
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
// FILE UPLOAD ENDPOINT
// ==========================================================================
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
      const url = await ctx.storage.getUrl(storageId);
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
