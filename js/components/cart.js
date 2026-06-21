// Shopping Cart & B2B/B2C Checkout Manager (Euro € Optimized)
const Cart = {
  items: [],

  init() {
    const saved = localStorage.getItem("hydrolux_cart");
    if (saved) {
      try {
        this.items = JSON.parse(saved);
      } catch (e) {
        this.items = [];
      }
    }
    this.updateCartBadge();

    // Register Econt message event listener
    window.addEventListener("message", (event) => {
      if (event.origin !== "https://officelocator.econt.com" && event.origin !== "https://offices.econt.com") {
        return;
      }
      if (event.data && event.data.office) {
        this.onEcontOfficeSelected(event.data.office);
      }
    });
  },

  save() {
    localStorage.setItem("hydrolux_cart", JSON.stringify(this.items));
    this.updateCartBadge();
    if (typeof HydroluxBackend !== "undefined") {
      HydroluxBackend.saveCart(this.items).catch(err => {
        console.warn("Convex cart sync failed", err);
      });
    }
  },

  getVariantCode(product, variant, index = 0) {
    if (!variant) return "CUSTOM-SPEC";

    const preferredKeys = ["code", "sku", "article", "id"];
    for (const key of preferredKeys) {
      if (variant[key] !== undefined && String(variant[key]).trim() !== "") {
        return String(variant[key]).trim();
      }
    }

    const firstFilledValue = Object.values(variant).find(value => String(value ?? "").trim() !== "");
    if (firstFilledValue !== undefined) {
      return String(firstFilledValue).trim();
    }

    return `${product.code || product.id || "product"}-${index + 1}`;
  },

  findVariant(product, variantCode) {
    if (!product.variants || variantCode === "CUSTOM-SPEC") return null;
    return product.variants.find((variant, index) => this.getVariantCode(product, variant, index) === variantCode) || null;
  },

  escapeJsString(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  addItem(product, variantCode, quantity) {
    if (quantity <= 0) return;

    let priceEur = parseFloat(product.priceEur) || 0;
    let variantName = "";
    let specsText = "";

    // If it's a product variant
    if (product.variants && variantCode !== "CUSTOM-SPEC") {
      const variant = this.findVariant(product, variantCode);
      if (variant) {
        priceEur = parseFloat(variant.priceEur) || 0;
        let sizeText = "";
        if (variant.innerDb && parseFloat(variant.innerDb) > 0) {
          sizeText = `ø ${variant.innerDb}мм`;
        } else if (variant.outerDb && parseFloat(variant.outerDb) > 0) {
          sizeText = `Външ. ø ${variant.outerDb}мм`;
        } else if (variant.inch) {
          sizeText = variant.inch;
        } else {
          sizeText = variantCode;
        }
        const inch = (variant.inch && sizeText !== variant.inch) ? ` (${variant.inch})` : "";
        variantName = `Размер: ${sizeText}${inch}`;

        const specs = [];
        if (variant.pressure !== undefined && variant.pressure !== "" && parseFloat(variant.pressure) > 0) specs.push(`Максимално работно налягане: ${variant.pressure} Bar`);
        if (variant.wallDb !== undefined && variant.wallDb !== "") specs.push(`Дебелина на стената: ${variant.wallDb} мм`);
        if (variant.burstDb !== undefined && variant.burstDb !== "") specs.push(`Налягане на разкъсване: ${variant.burstDb}`);
        if (variant.vacuumDb !== undefined && variant.vacuumDb !== "") specs.push(`Вакуум: ${variant.vacuumDb}`);
        if (variant.rangeDb !== undefined && variant.rangeDb !== "") specs.push(`Диапазон: ${variant.rangeDb} мм`);
        if (variant.spacingDb !== undefined && variant.spacingDb !== "") specs.push(`Разстояние между зъбите: ${variant.spacingDb} мм`);
        if (variant.hexDb !== undefined && variant.hexDb !== "") specs.push(`HEX размер: ${variant.hexDb} мм`);
        if (variant.braidsDb !== undefined && variant.braidsDb !== "") specs.push(`Брой вложки: ${variant.braidsDb}`);
        if (variant.sleeveWidthDb !== undefined && variant.sleeveWidthDb !== "") specs.push(`Широчина на ръкава: ${variant.sleeveWidthDb} мм`);
        if (variant.rollLength !== undefined && variant.rollLength !== "" && parseFloat(variant.rollLength) > 0) specs.push(`Дължина на ролката: ${variant.rollLength}м`);
        specsText = specs.join(" | ");
      }
    } else if (product.isCustomHose) {
      variantName = `Конфигуриран маркуч (${product.specsSummary.size})`;
      specsText = `${product.specsSummary.hoseType} | А: ${product.specsSummary.fittingL} | Б: ${product.specsSummary.fittingR} | Защита: ${product.specsSummary.sleeve}`;
    }

    const cartKey = `${product.id}::${variantCode}`;
    const existing = this.items.find(item => item.cartKey === cartKey);

    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({
        cartKey,
        productId: product.id,
        code: (variantCode && variantCode !== "CUSTOM-SPEC") ? variantCode : (product.code || product.id),
        name: product.name,
        variantCode,
        variantName,
        specsText,
        priceEur,
        quantity,
        isCustomHose: !!product.isCustomHose,
        specsSummary: product.specsSummary || null
      });
    }

    this.save();
    this.renderDrawer();
    this.showToast(`Добавено в количката!`);
  },

  removeItem(cartKey) {
    this.items = this.items.filter(item => item.cartKey !== cartKey);
    this.save();
    this.renderDrawer();
    if (typeof App !== "undefined" && App.currentView === "checkout") {
      this.renderCheckoutSummary();
    }
  },

  updateQuantity(cartKey, newQty) {
    const item = this.items.find(item => item.cartKey === cartKey);
    if (item) {
      item.quantity = Math.max(1, parseInt(newQty) || 1);
      this.save();
      this.renderDrawer();
      if (typeof App !== "undefined" && App.currentView === "checkout") {
        this.renderCheckoutSummary();
      }
    }
  },

  clear() {
    this.items = [];
    this.save();
    this.renderDrawer();
  },

  getTotal() {
    let totalEur = 0;
    this.items.forEach(item => {
      totalEur += (parseFloat(item.priceEur) || 0) * (parseInt(item.quantity) || 0);
    });
    return {
      eur: totalEur,
      bgn: totalEur
    };
  },

  updateCartBadge() {
    const inlineBadges = document.querySelectorAll(".cart-count-badge-inline");
    const displayEur = document.getElementById("cart-display-eur");

    let totalItems = 0;
    this.items.forEach(item => {
      totalItems += item.quantity;
    });

    inlineBadges.forEach(b => {
      b.textContent = totalItems;
    });

    const totals = this.getTotal();
    if (displayEur) displayEur.textContent = totals.eur.toFixed(2) + " € (" + (totals.eur * 1.95583).toFixed(2) + " лв.)";

    // Pulse the cart button
    const cartBtn = document.querySelector(".btn-cart-trigger");
    if (cartBtn) {
      cartBtn.classList.add("pulse");
      setTimeout(() => cartBtn.classList.remove("pulse"), 500);
    }
  },

  openDrawer() {
    const drawer = document.getElementById("cart-drawer");
    if (drawer) {
      drawer.classList.add("open");
      document.body.classList.add("no-scroll");
      this.renderDrawer();
    }
  },

  closeDrawer() {
    const drawer = document.getElementById("cart-drawer");
    if (drawer) {
      drawer.classList.remove("open");
      document.body.classList.remove("no-scroll");
    }
  },

  renderDrawer() {
    const container = document.getElementById("cart-items-container");
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div class="empty-cart text-center py-40">
          <div class="empty-cart-icon">🛒</div>
          <h3>Количката е празна</h3>
          <p class="text-muted">Разгледайте нашия богат продуктов асортимент и добавете необходимите продукти.</p>
          <button class="btn btn-primary mt-20" onclick="Cart.closeDrawer(); App.navigate('catalog')">Към Каталога</button>
        </div>
      `;
      document.getElementById("cart-footer-panel").style.display = "none";
      return;
    }

    document.getElementById("cart-footer-panel").style.display = "block";
    const totals = this.getTotal();

    container.innerHTML = this.items.map(item => {
      const cartKey = this.escapeJsString(item.cartKey);
      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-code font-xs text-muted" style="font-weight: 600; margin-bottom: 2px;">Код: ${item.code}</div>
            ${item.variantName ? `<div class="cart-item-variant">${item.variantName}</div>` : ""}
            ${item.specsText ? `<div class="cart-item-specs font-xs text-muted">${item.specsText}</div>` : ""}
            <div class="cart-item-pricing font-small">
              <span class="text-primary font-bold">${formatPrice(item.priceEur).eur}</span>
            </div>
          </div>
          <div class="cart-item-actions">
            <div class="quantity-input-wrapper small">
              <button class="btn btn-secondary btn-icon small" onclick="Cart.updateQuantity('${cartKey}', ${item.quantity - 1})">-</button>
              <input type="number" class="form-control text-center small qty-input" value="${item.quantity}"
                     onchange="Cart.updateQuantity('${cartKey}', this.value)">
              <button class="btn btn-secondary btn-icon small" onclick="Cart.updateQuantity('${cartKey}', ${item.quantity + 1})">+</button>
            </div>
            <button class="btn-delete" onclick="Cart.removeItem('${cartKey}')" title="Премахни">🗑️</button>
          </div>
        </div>
      `;
    }).join("");

    // Update prices in footer panel in both currencies
    document.getElementById("cart-total-bgn").textContent = totals.eur.toFixed(2) + " € (" + (totals.eur * 1.95583).toFixed(2) + " лв.)";
  },

  openCheckout() {
    this.closeDrawer();
    App.navigate('checkout');
    this.renderCheckoutSummary();
    setTimeout(() => {
      this.toggleInvoiceFields("b2c"); // default B2C
    }, 50);
  },

  toggleInvoiceFields(type) {
    const b2bFields = document.getElementById("b2b-invoice-fields");
    if (!b2bFields) return;
    if (type === "b2b") {
      b2bFields.classList.remove("hidden");
      b2bFields.querySelectorAll("input").forEach(i => i.setAttribute("required", "true"));
    } else {
      b2bFields.classList.add("hidden");
      b2bFields.querySelectorAll("input").forEach(i => i.removeAttribute("required"));
    }
  },

  renderCheckoutSummary() {
    const container = document.getElementById("checkout-summary-container");
    if (!container) return;

    const totals = this.getTotal();
    const isUserLoggedIn = typeof Auth !== "undefined" && Auth.currentUser;

    let authPromptHtml = "";
    if (!isUserLoggedIn) {
      authPromptHtml = `
        <div class="checkout-auth-prompt mt-20" style="padding: 16px; background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; text-align: center;">
          <p class="font-small text-muted-dark mb-10" style="font-weight: 500; line-height: 1.4;">
            Имате акаунт? Влезте в него за по-лесно проследяване на поръчките си.
          </p>
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button type="button" class="btn btn-secondary font-small" onclick="Auth.showAuthModal('login')" style="padding: 6px 12px; font-size: 0.82rem; font-weight: 700;">Вход</button>
            <button type="button" class="btn btn-primary font-small" onclick="Auth.showAuthModal('register')" style="padding: 6px 12px; font-size: 0.82rem; font-weight: 700; background-color: var(--accent);">Регистрация</button>
          </div>
          <p class="font-xs text-muted mt-10" style="margin-bottom: 0;">* Влизането не е задължително за завършване на поръчката</p>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="checkout-summary-card">
        <h4>📦 Обобщение на поръчката</h4>
        <div class="checkout-summary-items">
          ${this.items.map(item => {
            const cartKey = this.escapeJsString(item.cartKey);
            return `
              <div class="checkout-summary-item font-small" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px;">
                <div style="flex: 1;">
                  <strong style="display: block;">${item.name}</strong>
                  <div class="text-muted font-xs" style="font-weight: 600;">Код: ${item.code}</div>
                  ${item.variantName ? `<div class="text-muted font-xs">${item.variantName}</div>` : ""}
                  ${item.specsText ? `<div class="text-muted font-xs">${item.specsText}</div>` : ""}
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div class="quantity-input-wrapper small" style="margin-bottom: 0;">
                    <button type="button" class="btn btn-secondary btn-icon small" onclick="Cart.updateQuantity('${cartKey}', ${item.quantity - 1})">-</button>
                    <input type="number" class="form-control text-center small qty-input" value="${item.quantity}" style="width: 40px;"
                           onchange="Cart.updateQuantity('${cartKey}', this.value)">
                    <button type="button" class="btn btn-secondary btn-icon small" onclick="Cart.updateQuantity('${cartKey}', ${item.quantity + 1})">+</button>
                  </div>
                  <div class="text-right" style="min-width: 65px; font-weight: 700; color: var(--text-dark);">${formatPrice(item.priceEur * item.quantity).eur}</div>
                  <button type="button" class="btn-delete" onclick="Cart.removeItem('${cartKey}')" style="background: none; border: none; cursor: pointer; font-size: 0.95rem; padding: 0 4px;" title="Премахни">🗑️</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <div class="divider"></div>
        <div class="checkout-summary-totals">
          <div class="row">
            <span>Общо (с ДДС):</span>
            <strong class="font-large text-primary">${totals.eur.toFixed(2)} € (${(totals.eur * 1.95583).toFixed(2)} лв.)</strong>
          </div>
          <div class="row font-xs text-muted mt-5">
            <span>* Включено ДДС (20%):</span>
            <span>${(totals.eur * 0.2).toFixed(2)} € (${(totals.eur * 0.2 * 1.95583).toFixed(2)} лв.)</span>
          </div>
        </div>
        ${authPromptHtml}
      </div>
    `;
  },

  // Checkout Form Event Handlers
  onDeliveryMethodChange(value) {
    const detailsContainer = document.getElementById("delivery-details-container");
    const addressLabel = document.getElementById("delivery-address-label");
    const addressInput = document.getElementById("checkout-address");
    const cityInput = document.getElementById("checkout-city");
    const postcodeInput = document.getElementById("checkout-postcode");
    const econtBtnContainer = document.getElementById("econt-office-btn-container");

    if (!detailsContainer || !addressInput || !cityInput || !postcodeInput) return;

    detailsContainer.style.display = "block";
    addressInput.setAttribute("required", "true");
    cityInput.setAttribute("required", "true");
    postcodeInput.setAttribute("required", "true");

    if (value === "office") {
      addressLabel.textContent = "Адрес или име на офис на Еконт";
      addressInput.placeholder = "гр. София, Офис Еконт - Младост";
      if (econtBtnContainer) econtBtnContainer.style.display = "block";
    } else {
      addressLabel.textContent = "Точен адрес за доставка";
      addressInput.placeholder = "ул. Примерна №5, вх. А, ап. 2";
      if (econtBtnContainer) econtBtnContainer.style.display = "none";
    }
  },

  onPaymentMethodChange(value) {
    const helper = document.getElementById("payment-method-helper");
    if (!helper) return;

    if (value === "cod") {
      helper.style.display = "block";
      helper.className = "payment-helper-cod";
      helper.style.backgroundColor = "#f0fdf4";
      helper.style.borderColor = "#bbf7d0";
      helper.style.color = "#166534";
      helper.textContent = "💵 Ще платите на куриера при доставка в брой или с карта.";
    } else if (value === "bank") {
      helper.style.display = "block";
      helper.style.backgroundColor = "#eff6ff";
      helper.style.borderColor = "#bfdbfe";
      helper.style.color = "#1e40af";
      helper.textContent = "🏦 Ще получите проформа фактура по имейл с банковите ни детайли за банков превод.";
    } else if (value === "card") {
      helper.style.display = "block";
      helper.style.backgroundColor = "#fdf2f8";
      helper.style.borderColor = "#fbcfe8";
      helper.style.color = "#9d174d";
      helper.textContent = "💳 Сигурно плащане в реално време чрез myPOS Secure Checkout.";
    }
  },

  toggleInvoiceSection(isChecked) {
    const invoiceFields = document.getElementById("invoice-fields-container");
    if (!invoiceFields) return;

    const companyInput = document.getElementById("invoice-company");
    const bulstatInput = document.getElementById("invoice-bulstat");
    const molInput = document.getElementById("invoice-mol");
    const addressInput = document.getElementById("invoice-address");

    if (isChecked) {
      invoiceFields.style.display = "block";
      companyInput.setAttribute("required", "true");
      bulstatInput.setAttribute("required", "true");
      molInput.setAttribute("required", "true");
      addressInput.setAttribute("required", "true");
    } else {
      invoiceFields.style.display = "none";
      companyInput.removeAttribute("required");
      bulstatInput.removeAttribute("required");
      molInput.removeAttribute("required");
      addressInput.removeAttribute("required");
    }
  },

  // myPOS Checkout execution states
  myposPaid: false,
  currentPendingOrder: null,

  cancelMyPOSPayment() {
    const modal = document.getElementById("mypos-modal");
    if (modal) modal.classList.remove("open");
    document.body.classList.remove("no-scroll");
    this.currentPendingOrder = null;
    this.myposPaid = false;
  },

  runSimulatedRedirect() {
    const statusText = document.getElementById("mypos-status-text");
    if (!statusText) return;

    statusText.textContent = "Пренасочване към защитения портал на myPOS...";
    
    setTimeout(() => {
      statusText.textContent = "Изчакване на плащането в портала на myPOS...";
      setTimeout(() => {
        statusText.textContent = "Плащането е успешно авторизирано!";
        setTimeout(() => {
          this.myposPaid = true;
          const modal = document.getElementById("mypos-modal");
          if (modal) modal.classList.remove("open");
          document.body.classList.remove("no-scroll");

          if (this.currentPendingOrder) {
            this.currentPendingOrder.status = "paid";
            this.finalizeSubmit(this.currentPendingOrder);
          }
        }, 1200);
      }, 2000);
    }, 2000);
  },

  closeCheckout() {
    // Navigate away from checkout
    App.navigate("home");
  },

  async submitOrder(event) {
    event.preventDefault();
    const form = event.target;
    
    // Extract customer details
    const name = form.elements["client_name"].value;
    const phone = form.elements["client_phone"].value;
    const email = form.elements["client_email"].value;
    const delivery = form.elements["delivery_method"].value;
    
    let city = "";
    let postcode = "";
    let address = "";
    if (delivery !== "shop") {
      city = form.elements["client_city"].value;
      postcode = form.elements["client_postcode"].value;
      address = form.elements["delivery_address"].value;
    }

    const paymentMethod = form.elements["payment_method"].value;
    const notes = form.elements["order_notes"].value;
    
    // Invoice details
    const wantsInvoice = document.getElementById("wants-invoice-checkbox").checked;
    let invoiceDetails = null;
    if (wantsInvoice) {
      invoiceDetails = {
        companyName: form.elements["invoice_company"].value,
        bulstat: form.elements["invoice_bulstat"].value,
        mol: form.elements["invoice_mol"].value,
        address: form.elements["invoice_address"].value
      };
    }

    const orderNumber = "HL-" + Math.floor(100000 + Math.random() * 900000);
    const totals = this.getTotal();
    const orderedItems = [...this.items];
    
    const order = {
      orderNumber,
      customer: { name, phone, email },
      items: orderedItems,
      totals,
      delivery,
      city,
      postcode,
      address,
      paymentMethod,
      invoiceDetails,
      notes,
      status: paymentMethod === "card" ? "paid" : "new",
      createdAt: Date.now(),
    };

    if (paymentMethod === "card" && !this.myposPaid) {
      // Prompt myPOS simulated window
      this.currentPendingOrder = order;
      const modal = document.getElementById("mypos-modal");
      if (modal) {
        const bgnTotal = totals.eur * 1.95583;
        document.getElementById("mypos-pay-amount").textContent = `${totals.eur.toFixed(2)} € (${bgnTotal.toFixed(2)} лв.)`;
        modal.classList.add("open");
        document.body.classList.add("no-scroll");
        
        // Trigger automated simulation of external myPOS hosted redirect
        this.runSimulatedRedirect();
      }
      return;
    }

    this.finalizeSubmit(order);
  },

  async finalizeSubmit(order) {
    try {
      if (typeof HydroluxBackend !== "undefined") {
        await HydroluxBackend.saveOrder(order);
      }
    } catch (err) {
      console.warn("Convex order save failed", err);
      const pendingOrders = JSON.parse(localStorage.getItem("hydrolux_pending_orders") || "[]");
      pendingOrders.push(order);
      localStorage.setItem("hydrolux_pending_orders", JSON.stringify(pendingOrders));
      alert("Поръчката е приета локално, но не успяхме да я запишем в Convex. Проверете връзката и синхронизирайте отново.");
    }

    // Save order details to localStorage for the thank-you page
    localStorage.setItem("hydrolux_last_order", JSON.stringify(order));
    
    this.clear();
    this.myposPaid = false;
    this.currentPendingOrder = null;

    // Redirect to the new thank you route
    window.location.href = "/thank-you";
  },

  closeSuccess() {
    const successModal = document.getElementById("success-modal");
    if (successModal) {
      successModal.classList.remove("open");
      document.body.classList.remove("no-scroll");
      App.navigate("home");
    }
  },

  showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add("show"), 10);
    
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  openEcontLocator() {
    const modal = document.getElementById("econt-locator-modal");
    const iframe = document.getElementById("econt-locator-iframe");
    const loader = document.getElementById("econt-iframe-loader");

    if (modal && iframe) {
      modal.style.display = "flex";
      if (loader) loader.style.display = "flex";
      iframe.style.display = "none";

      const siteUrl = window.location.origin;
      iframe.src = `https://officelocator.econt.com/?lang=bg&shopUrl=${encodeURIComponent(siteUrl)}`;

      iframe.onload = () => {
        if (loader) loader.style.display = "none";
        iframe.style.display = "block";
      };
    }
  },

  closeEcontLocator() {
    const modal = document.getElementById("econt-locator-modal");
    const iframe = document.getElementById("econt-locator-iframe");
    if (modal) {
      modal.style.display = "none";
    }
    if (iframe) {
      iframe.src = "";
    }
  },

  onEcontOfficeSelected(office) {
    const cityInput = document.getElementById("checkout-city");
    const postcodeInput = document.getElementById("checkout-postcode");
    const addressInput = document.getElementById("checkout-address");

    if (office) {
      const cityName = office.address?.city?.name || "";
      if (cityName && cityInput) {
        cityInput.value = "гр. " + cityName;
      }

      const postcode = office.address?.city?.postCode || office.address?.zip || "";
      if (postcode && postcodeInput) {
        postcodeInput.value = postcode;
      }

      let officeName = office.name || "";
      let fullAddress = office.address?.fullAddress || "";
      
      let displayAddress = officeName;
      if (office.code) {
        displayAddress += " (код: " + office.code + ")";
      }
      if (fullAddress) {
        displayAddress += ", " + fullAddress;
      }

      if (addressInput) {
        addressInput.value = displayAddress;
      }

      this.closeEcontLocator();
    }
  }
};
