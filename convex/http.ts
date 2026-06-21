import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// CORS preflight handler helper
const handlePreflight = () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

// API State endpoints
http.route({
  path: "/api/state",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/state",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const res = await ctx.runQuery(api.state.getState, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/state",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const res = await ctx.runMutation(api.state.saveState, body);
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
    const body = await request.json();
    const res = await ctx.runMutation(api.state.saveStateValue, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// Order endpoints
http.route({
  path: "/api/order",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/order",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const res = await ctx.runMutation(api.orders.saveOrder, body);
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
  handler: httpAction(async (ctx) => {
    const res = await ctx.runQuery(api.orders.getAllOrders, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
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
    const body = await request.json();
    const res = await ctx.runMutation(api.orders.updateOrderStatus, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// Persist cart fallback (persists as a placeholder success response)
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

// Heartbeat endpoint
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

// Auth endpoints
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
    const res = await ctx.runMutation(api.auth.register, body);
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
    const res = await ctx.runMutation(api.auth.login, body);
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
    const res = await ctx.runMutation(api.auth.googleLogin, body);
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
    const res = await ctx.runQuery(api.orders.getUserOrders, { email });
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// Chatbot endpoint
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
    const res = await ctx.runAction(api.chatbot.chatbot, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// Product archive endpoints
http.route({
  path: "/api/product-archive",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/product-archive",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const res = await ctx.runMutation(api.auth.archiveProduct, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/api/product-archive",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const res = await ctx.runQuery(api.auth.getArchivedProducts, {});
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
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
    const body = await request.json();
    const res = await ctx.runMutation(api.auth.restoreArchivedProduct, body);
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: corsHeaders,
    });
  }),
});

// PDF upload file endpoint
http.route({
  path: "/api/pdf-upload",
  method: "OPTIONS",
  handler: httpAction(async () => handlePreflight()),
});

http.route({
  path: "/api/pdf-upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
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
