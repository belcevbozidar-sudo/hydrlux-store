// Convex-backed persistence for products, categories, table templates, carts and orders.
const HydroluxBackend = {
  httpUrl: "https://shiny-bass-730.eu-west-1.convex.site",
  storagePrefix: "hydrolux_",

  async request(path, options = {}) {
    const response = await fetch(`${this.httpUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Convex request failed: ${response.status}`);
    }

    return await response.json();
  },

  async compressString(str) {
    if (typeof CompressionStream === "undefined") {
      return str;
    }
    const stream = new Blob([str]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },

  async decompressString(base64) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("DecompressionStream is not supported in this browser.");
    }
    const responseData = await fetch(`data:application/octet-stream;base64,${base64}`);
    const buffer = await responseData.arrayBuffer();
    const stream = new Blob([buffer]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
    const responseText = new Response(decompressedStream);
    return await responseText.text();
  },

  async getState() {
    const result = await this.request("/api/state");
    const state = result.state || {};
    
    if (state.products && state.products.__compressed) {
      const decompressed = await this.decompressString(state.products.data);
      state.products = JSON.parse(decompressed);
    }
    if (state.categories && state.categories.__compressed) {
      const decompressed = await this.decompressString(state.categories.data);
      state.categories = JSON.parse(decompressed);
    }
    
    return state;
  },

  async saveState(values) {
    const clonedValues = { ...values };
    
    if (clonedValues.products && typeof CompressionStream !== "undefined") {
      const jsonStr = JSON.stringify(clonedValues.products);
      const compressed = await this.compressString(jsonStr);
      clonedValues.products = { __compressed: true, data: compressed };
    }
    if (clonedValues.categories && typeof CompressionStream !== "undefined") {
      const jsonStr = JSON.stringify(clonedValues.categories);
      const compressed = await this.compressString(jsonStr);
      clonedValues.categories = { __compressed: true, data: compressed };
    }

    return await this.request("/api/state", {
      method: "POST",
      body: clonedValues,
    });
  },

  async saveStateValue(key, value) {
    let finalValue = value;
    if ((key === "products" || key === "categories") && value && typeof CompressionStream !== "undefined") {
      const jsonStr = JSON.stringify(value);
      const compressed = await this.compressString(jsonStr);
      finalValue = { __compressed: true, data: compressed };
    }
    return await this.request("/api/state-value", {
      method: "POST",
      body: { key, value: finalValue },
    });
  },

  // Archives a product snapshot before deletion. Append-only on the server.
  async archiveProduct(product, reason = "deleted") {
    if (!product || !product.id) return { ok: false, error: "no product" };
    return await this.request("/api/product-archive", {
      method: "POST",
      body: { productId: String(product.id), data: product, reason },
    });
  },

  async getArchivedProducts() {
    const result = await this.request("/api/product-archive", { method: "GET" });
    return (result && result.products) || [];
  },

  async markArchivedProductRestored(productId) {
    return await this.request("/api/product-archive/restore", {
      method: "POST",
      body: { productId: String(productId) },
    });
  },

  getCartId() {
    const key = `${this.storagePrefix}cart_id`;
    let cartId = localStorage.getItem(key);
    if (!cartId) {
      cartId = `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, cartId);
    }
    return cartId;
  },

  // Uploads a technical-specification PDF into Convex file storage and returns
  // { ok, storageId, url }. The URL is permanent and can be opened directly.
  async uploadPdf(file) {
    const response = await fetch(`${this.httpUrl}/api/pdf-upload`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/pdf",
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`PDF upload failed: ${response.status}`);
    }

    return await response.json();
  },

  async saveCart(items) {
    return await this.request("/api/cart", {
      method: "POST",
      body: {
        cartId: this.getCartId(),
        items,
      },
    });
  },

  async saveOrder(order) {
    return await this.request("/api/order", {
      method: "POST",
      body: { order },
    });
  },

  async hashPassword(password) {
    if (!crypto || !crypto.subtle) {
      // Fallback for environments without crypto support (rare in modern browsers)
      return password;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "hydrolux_salt_123!");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async authRegister(name, email, password) {
    const passwordHash = await this.hashPassword(password);
    return await this.request("/api/auth/register", {
      method: "POST",
      body: { name, email, passwordHash },
    });
  },

  async authLogin(email, password) {
    const passwordHash = await this.hashPassword(password);
    return await this.request("/api/auth/login", {
      method: "POST",
      body: { email, passwordHash },
    });
  },

  async authGoogleLogin(userData) {
    return await this.request("/api/auth/google", {
      method: "POST",
      body: userData,
    });
  },

  async getUserOrders(email) {
    return await this.request(`/api/auth/orders?email=${encodeURIComponent(email)}`, {
      method: "GET",
    });
  },

  async getAllOrders() {
    return await this.request("/api/admin/orders", {
      method: "GET",
    });
  },

  async updateOrderStatus(orderNumber, status) {
    return await this.request("/api/admin/order/status", {
      method: "POST",
      body: { orderNumber, status },
    });
  },
};
