// Hydrolux Premium Store SPA Routing & App Orchestrator
const App = {
  currentView: "home",

  async init() {
    if (typeof Auth !== "undefined") {
      Auth.init();
    }

    // 1. Initialize Components
    Cart.init();
    this.updateWishlistCount();
    
    // 2. Render UI immediately using local/seed state for instant FCP/LCP
    this.renderAllUI();
    
    // 3. Setup event listeners
    this.setupSearchSuggestions();
    this.route();
    window.addEventListener("hashchange", () => this.route());
    this.updateHeroStats();
    this.initScrollHeader();

    // 4. Background revalidate after Convex resolves
    if (CONFIG.ready) {
      CONFIG.ready.then(() => {
        // Re-render UI with latest synced server state in the background
        this.renderAllUI();
        this.updateWishlistCount();
      }).catch(err => {
        console.error("Error waiting for server config load:", err);
      });
    }
    this.startHeartbeat();
  },

  startHeartbeat() {
    if (typeof HydroluxBackend === "undefined") return;

    let sessionId = sessionStorage.getItem("hydrolux_session_id");
    if (!sessionId) {
      sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2);
      sessionStorage.setItem("hydrolux_session_id", sessionId);
    }

    const sendHeartbeat = () => {
      fetch(`${HydroluxBackend.httpUrl}/api/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(err => console.warn("Failed to send heartbeat:", err));
    };

    // Defer the first heartbeat until the page is idle so this analytics call
    // doesn't compete with rendering / the LCP image during initial load.
    const startBeating = () => {
      sendHeartbeat();
      setInterval(sendHeartbeat, 20000);
    };
    if (document.readyState === "complete") {
      startBeating();
    } else {
      window.addEventListener("load", () => {
        if ("requestIdleCallback" in window) {
          requestIdleCallback(startBeating, { timeout: 3000 });
        } else {
          setTimeout(startBeating, 1500);
        }
      }, { once: true });
    }
  },

  renderAllUI() {
    this.renderQuickCategories();
    this.renderSearchCategories();
    this.renderHeaderNavDropdown();
    this.renderHomeCategories();
    if (typeof Catalog !== "undefined") {
      Catalog.renderSidebar();
      Catalog.applyFiltersAndRender();
    }
    this.renderFeaturedProductsHome();
  },

  renderFeaturedProductsHome() {
    const grid = document.getElementById("home-featured-products-grid");
    const specialSection = document.getElementById("home-special-section");
    const specialGrid = document.getElementById("home-special-products-grid");
    if (!grid) return;

    const wishlist = this.getWishlist();

    // 1. Render Popular Products
    const popularProductIds = [
      "hydraulic-hose-2sn",
      "fitting-90-bsp",
      "pu-spiral-hose",
      "quick-coupling-isoa"
    ];
    const sourceProducts = CONFIG.products && CONFIG.products.length > 0 ? CONFIG.products : (CONFIG.featuredProducts || []);
    let featured = popularProductIds.map(id => sourceProducts.find(p => p.id === id)).filter(Boolean);

    if (featured.length === 0) {
      const targets = [
        { key: "2SN", fallbackCode: "2SN" },
        { key: "BSP", fallbackCode: "BSP" },
        { key: "спирала", fallbackCode: "SPIRAL" },
        { key: "бърза връзка", fallbackCode: "ISOA" }
      ];
      featured = targets.map(t => {
        let found = sourceProducts.find(p => p.code && p.code.toUpperCase().includes(t.fallbackCode));
        if (!found) {
          found = sourceProducts.find(p => p.name && p.name.toLowerCase().includes(t.key.toLowerCase()));
        }
        return found;
      }).filter(Boolean);
    }

    if (featured.length === 0) {
      featured = sourceProducts.slice(0, 4);
    }

    grid.innerHTML = featured.map(p => {
      const prices = (p.variants || []).map(v => parseFloat(v.priceEur) || 0);
      const positivePrices = prices.filter(pr => pr > 0);
      const minPrice = positivePrices.length > 0 ? Math.min(...positivePrices) : 0;
      const isTopSale = p.id === "pu-spiral-hose";
      const badgeText = isTopSale ? "Топ продажба" : "В наличност";
      const badgeClass = isTopSale ? "badge-orange" : "badge-green";
      const isFav = wishlist.includes(p.id);

      return `
        <div class="product-card card" onclick="Catalog.openProductDetails('${p.id}')">
          <div class="product-badge ${badgeClass}">${badgeText}</div>
          
          <button class="wishlist-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); App.toggleFavorite('${p.id}', this)" title="Любими" aria-label="Добави в любими">
            <svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>

          <div class="product-card-img-wrapper">
            <img src="${p.images[0]}" alt="${p.name} - ${p.brand} | Хидролукс Груп" class="product-card-img" onerror="this.src='assets/air_hoses.webp'" width="240" height="240" loading="lazy">
          </div>
          <div class="product-card-body">
            <h4 class="product-card-title">${p.name}</h4>
            
            ${(p.homeSpecs && p.homeSpecs.length > 0) ? `
            <div class="product-card-specs">
              ${p.homeSpecs.map(spec => `
                <div class="spec-item">
                  <span class="spec-checkmark">✓</span>
                  <span class="spec-label">${spec.key}:</span>
                  <span class="spec-value">${spec.value}</span>
                </div>
              `).join("")}
            </div>
            ` : ""}
            
            <div class="product-card-price-row">
              <span class="price-bgn font-medium text-primary font-bold">
                ${formatPrice(minPrice, p.unit === "м").eur}
              </span>
            </div>
            
            <button class="btn-buy-now btn-accent mt-15" onclick="event.stopPropagation(); App.buyProductDirect('${p.id}')">
              <svg class="cart-icon" viewBox="0 0 24 24" width="16" height="16">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
              </svg>
              Добави в количка
            </button>
          </div>
        </div>
      `;
    }).join("");

    // 2. Render Special Offers
    if (specialSection && specialGrid) {
      const specialProducts = CONFIG.products.filter(p => p.isSpecial === true || p.isSpecial === "true");
      if (specialProducts.length > 0) {
        specialSection.style.display = "block";
        specialGrid.innerHTML = specialProducts.map(p => {
          const prices = (p.variants || []).map(v => parseFloat(v.priceEur) || 0);
          const positivePrices = prices.filter(pr => pr > 0);
          const minPrice = positivePrices.length > 0 ? Math.min(...positivePrices) : 0;
          const badgeText = p.specialOfferLabel || this.getSpecialOfferLabel(p);
          const isFav = wishlist.includes(p.id);

          return `
            <div class="product-card card" onclick="Catalog.openProductDetails('${p.id}')">
              <div class="product-badge badge-orange">${badgeText}</div>
              
              <button class="wishlist-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); App.toggleFavorite('${p.id}', this)" title="Любими" aria-label="Добави в любими">
                <svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>

              <div class="product-card-img-wrapper">
                <img src="${p.images[0]}" alt="${p.name} - ${p.brand} | Хидролукс Груп" class="product-card-img" onerror="this.src='assets/air_hoses.webp'" width="240" height="240" loading="lazy">
              </div>
              <div class="product-card-body">
                <h4 class="product-card-title">${p.name}</h4>
                
                ${(p.homeSpecs && p.homeSpecs.length > 0) ? `
                <div class="product-card-specs">
                  ${p.homeSpecs.map(spec => `
                    <div class="spec-item">
                      <span class="spec-checkmark">✓</span>
                      <span class="spec-label">${spec.key}:</span>
                      <span class="spec-value">${spec.value}</span>
                    </div>
                  `).join("")}
                </div>
                ` : (p.specs && p.specs.length > 0) ? `
                <div class="product-card-specs">
                  ${p.specs.slice(0, 3).map(spec => `
                    <div class="spec-item">
                      <span class="spec-checkmark">✓</span>
                      <span class="spec-label">${spec.key}:</span>
                      <span class="spec-value">${spec.value}</span>
                    </div>
                  `).join("")}
                </div>
                ` : ""}
                
                <div class="product-card-price-row">
                  <span class="price-bgn font-medium text-primary font-bold">
                    ${formatPrice(minPrice, p.unit === "м").eur}
                  </span>
                </div>
                
                <button class="btn-buy-now btn-accent mt-15" onclick="event.stopPropagation(); App.buyProductDirect('${p.id}')">
                  <svg class="cart-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>
                  </svg>
                  Добави в количка
                </button>
              </div>
            </div>
          `;
        }).join("");
      } else {
        specialSection.style.display = "none";
      }
    }
  },

  getWishlist() {
    try {
      return JSON.parse(localStorage.getItem("hydrolux_wishlist")) || [];
    } catch (e) {
      return [];
    }
  },

  saveWishlist(list) {
    localStorage.setItem("hydrolux_wishlist", JSON.stringify(list));
    this.updateWishlistCount();
  },

  updateWishlistCount() {
    const list = this.getWishlist();
    // Wishlist header icon badge
    const badge = document.getElementById("wishlist-badge") || document.querySelector(".header-actions button:nth-child(2) .header-action-badge");
    if (badge) {
      badge.textContent = list.length;
    }
  },

  toggleFavorite(productId, btn) {
    let wishlist = this.getWishlist();
    const index = wishlist.indexOf(productId);
    let isActive = false;
    
    if (index === -1) {
      wishlist.push(productId);
      isActive = true;
      Cart.showToast("Добавено в любими! ❤️");
    } else {
      wishlist.splice(index, 1);
      isActive = false;
      Cart.showToast("Премахнато от любими.");
    }
    
    this.saveWishlist(wishlist);
    
    // Synchronize the active class on all favorite buttons representing this product in the page
    document.querySelectorAll(`button[onclick*="App.toggleFavorite('${productId}'"]`).forEach(b => {
      if (isActive) b.classList.add("active");
      else b.classList.remove("active");
    });

    // Also sync the big center overlay buttons
    document.querySelectorAll(`button[onclick*="App.toggleFavorite('${productId}'"]`).forEach(b => {
      if (isActive) b.classList.add("active");
      else b.classList.remove("active");
    });
    
    // If we are currently viewing the wishlist page, refresh the layout!
    if (typeof Catalog !== "undefined" && Catalog.filterWishlist) {
      Catalog.applyFiltersAndRender();
    }
  },

  buyProductDirect(productId) {
    const product = CONFIG.products.find(p => p.id === productId);
    if (product && product.variants && product.variants.length > 0) {
      Cart.addItem(product, product.variants[0].code, 1);
      Cart.openDrawer();
    }
  },

  getSpecialOfferLabel(product) {
    if (product.specialOfferLabel) return product.specialOfferLabel;
    if (product.specialOfferType === "hot") return "ГОРЕЩА ОФЕРТА";
    if (product.specialOfferType === "other" && product.specialOfferText) return product.specialOfferText;
    return "СЕЗОННО НАМАЛЕНИЕ";
  },

  renderHomeCategories() {
    const carousel = document.getElementById("home-categories-carousel");
    if (!carousel) return;

    const getCatImg = (cat) => {
      const mapping = {
        "73": "assets/cat_73.jpg",
        "74": "assets/cat_74.jpg",
        "168": "assets/cat_168.jpg",
        "60": "assets/cat_air_hoses.webp",
        "61": "assets/cat_fuel_oil_hoses.webp",
        "62": "assets/cat_coolant_hoses.webp",
        "63": "assets/cat_silicone_hoses.webp",
        "64": "assets/cat_pvc_hoses.webp",
        "70": "assets/cat_polyurethane_hoses.webp",
        "69": "assets/cat_hose_accessories.webp",
        "68": "assets/cat_food_hoses.webp",
        "66": "assets/cat_gas_hoses.webp",
        "65": "assets/cat_hydraulic_fittings.webp",
        "59": "assets/cat_water_hoses.webp",
        "71": "assets/cat_pneumatic_tubes.webp",
        "72": "assets/logo.webp",
        "67": "assets/cat_67.jpg",
        "154": "assets/cat_154.jpg"
      };
      const mapped = mapping[String(cat.id)];
      if (mapped) return mapped;
      if (cat.image && !cat.image.includes("hydrolux.bg")) return cat.image;
      return "assets/logo.webp";
    };

    carousel.innerHTML = CONFIG.categories.map((c, i) => {
      const imageSrc = getCatImg(c);
      const cleanImageSrc = imageSrc.replace(/\s+/g, '%20');

      // The first few carousel cards are above the fold, so load them eagerly
      // (the first with high priority) — they're the LCP candidate. Lazy-loading
      // them would deprioritize the largest visible image and delay LCP.
      const eager = i < 4;
      const loadingAttr = eager ? 'loading="eager"' : 'loading="lazy"';
      const priorityAttr = i === 0 ? ' fetchpriority="high"' : '';

      return `
        <div class="category-card-6" onclick="Catalog.selectCategory('${c.id}')">
          <div class="category-card-6-img-wrapper">
            <img src="${cleanImageSrc}" alt="Категория: ${c.name} - Хидролукс Груп" onerror="this.onerror=null; this.src='assets/logo.webp'" width="300" height="345" ${loadingAttr}${priorityAttr} decoding="async">
          </div>
          <div class="category-card-6-body">
            <h3 class="category-card-6-title">${c.name}</h3>
            <div class="category-card-6-footer">
              <span class="category-card-6-arrow">➔</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  renderQuickCategories() {
    const grid = document.querySelector(".quick-categories-grid");
    if (!grid) return;
    
    // Display the first 8 main categories or all of them
    const categories = CONFIG.categories.slice(0, 8);
    grid.innerHTML = categories.map(c => `
      <div class="category-card card" onclick="Catalog.selectCategory('${c.id}')">
        <span class="cat-icon">${c.icon || '📦'}</span>
        <h4>${c.name}</h4>
      </div>
    `).join("");
  },

  renderSearchCategories() {
    const select = document.getElementById("search-category-dropdown");
    if (!select) return;
    
    let html = '<option value="">Всички категории</option>';
    CONFIG.categories.forEach(c => {
      html += `<option value="${c.id}">${c.name}</option>`;
    });
    select.innerHTML = html;
  },

  renderHeaderNavDropdown() {
    const menu = document.getElementById("categories-nav-dropdown-menu");
    if (!menu) return;

    menu.innerHTML = `
      <a class="nav-dropdown-item" onclick="Catalog.selectCategory('')" style="grid-column: span 3; font-weight: 800; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; margin-bottom: 4px;">
        Всички категории
      </a>
      ${CONFIG.categories.map(cat => `
        <a class="nav-dropdown-item" onclick="Catalog.selectCategory('${cat.id}')">
          ${cat.name}
        </a>
      `).join("")}
    `;
  },

  setupSearchSuggestions() {
    const searchInput = document.getElementById("search-input-blue");
    const wrapper = document.querySelector(".search-bar-wrapper");
    if (!searchInput || !wrapper) return;

    // Create suggestions dropdown element dynamically if it doesn't exist
    let dropdown = document.getElementById("search-suggestions-dropdown");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.id = "search-suggestions-dropdown";
      dropdown.className = "search-suggestions-dropdown";
      wrapper.appendChild(dropdown);
    }

    // Input event for real-time autocomplete
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim().toLowerCase();
      
      // Keep main Catalog search query in sync
      Catalog.searchQuery = e.target.value;
      if (this.currentView === "catalog") {
        Catalog.applyFiltersAndRender();
      }

      if (query.length < 2) {
        dropdown.style.display = "none";
        return;
      }

      // Filter Categories
      const matchingCats = CONFIG.categories.filter(c => 
        c.name.toLowerCase().includes(query)
      );

      // Filter Products (including name, brand, code, tags, and variant codes!)
      const matchingProds = CONFIG.products.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        p.tags.some(t => t.toLowerCase().includes(query)) ||
        p.variants.some(v => v.code.toLowerCase().includes(query))
      );

      if (matchingCats.length === 0 && matchingProds.length === 0) {
        dropdown.innerHTML = `<div class="search-no-suggestions">Няма намерени съвпадения за "${e.target.value}"</div>`;
        dropdown.style.display = "block";
        return;
      }

      let html = "";

      // 1. Categories Section
      if (matchingCats.length > 0) {
        html += `
          <div class="search-suggestions-section">
            <div class="search-suggestions-section-title">Категории</div>
            ${matchingCats.map(c => `
              <div class="search-suggestion-item" onclick="App.handleCategorySuggestionClick('${c.id}')">
                <span style="font-size: 1.2rem;">${c.icon || '📦'}</span>
                <div class="search-suggestion-info">
                  <span class="search-suggestion-name">${c.name}</span>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }

      // 2. Products Section
      if (matchingProds.length > 0) {
        html += `
          <div class="search-suggestions-section">
            <div class="search-suggestions-section-title">Продукти</div>
            ${matchingProds.map(p => {
              const prices = p.variants.map(v => v.priceEur);
              const minPrice = Math.min(...prices);
              const coverImg = p.images[0] || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop";
              
              const subText = `Код: ${p.code}${p.brand ? ` | Марка: ${p.brand}` : ""}`;

              return `
                <div class="search-suggestion-item" onclick="App.handleProductSuggestionClick('${p.id}')">
                  <img src="${coverImg}" alt="${p.name} - ${p.brand}" class="search-suggestion-img" onerror="this.src='assets/air_hoses.webp'" width="40" height="40" loading="lazy">
                  <div class="search-suggestion-info">
                    <span class="search-suggestion-name">${p.name}</span>
                    <span class="search-suggestion-meta">${subText}</span>
                  </div>
                  <div class="search-suggestion-price">${formatPrice(minPrice, p.unit === "м").eur}</div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      dropdown.innerHTML = html;
      dropdown.style.display = "block";
    });

    // Close suggestions dropdown on click outside
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });

    // Re-open on focus if query is already present
    searchInput.addEventListener("focus", (e) => {
      if (e.target.value.trim().length >= 2) {
        dropdown.style.display = "block";
      }
    });
  },

  handleCategorySuggestionClick(catId) {
    Catalog.selectCategory(catId);
    const dropdown = document.getElementById("search-suggestions-dropdown");
    if (dropdown) dropdown.style.display = "none";
  },

  handleProductSuggestionClick(prodId) {
    this.navigate(`product-detail/${prodId}`);
    const dropdown = document.getElementById("search-suggestions-dropdown");
    if (dropdown) dropdown.style.display = "none";
  },

  // Switch SPA views smoothly
  navigate(viewId) {
    window.location.hash = `#${viewId}`;
  },

  // Lazily injects a script once and resolves when it has loaded. Used to keep
  // heavy, rarely-used bundles (admin panel, hose builder) out of the critical
  // path for normal customers — they only download when that view is opened.
  ensureScript(src) {
    if (!this._loadedScripts) this._loadedScripts = {};
    if (this._loadedScripts[src]) return this._loadedScripts[src];
    const promise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => {
        delete this._loadedScripts[src];
        reject(new Error(`Failed to load ${src}`));
      };
      document.body.appendChild(el);
    });
    this._loadedScripts[src] = promise;
    return promise;
  },

  route() {
    let hash = window.location.hash.substring(1);
    if (!hash) hash = "home";

    // Separate params if any, e.g. product-detail/semperit-plw-20
    const parts = hash.split("/");
    const mainView = parts[0];

    // Trigger full catalog load immediately if entering catalog or product pages
    if (["catalog", "product-detail", "wishlist"].includes(mainView)) {
      if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
        CONFIG.loadCatalog();
      }
    }
    const viewParam = parts[1];
    
    // Hide all views
    document.querySelectorAll(".spa-view").forEach(v => {
      v.classList.remove("active");
    });

    // Remove active class from navigation links
    document.querySelectorAll(".nav-link").forEach(l => {
      l.classList.remove("active");
    });

    // Close drawers/menus
    Cart.closeDrawer();
    this.toggleMobileMenu(false);

    // Show selected view
    let targetView = document.getElementById(`${mainView}-view`);
    if (mainView === "wishlist") {
      targetView = document.getElementById("catalog-view");
    }
    if (targetView) {
      targetView.classList.add("active");
      this.currentView = mainView === "wishlist" ? "catalog" : mainView;

      // Update active nav link
      const navLink = document.querySelector(`.nav-link[onclick*="navigate('${mainView}')"]`);
      if (navLink) navLink.classList.add("active");

      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Run view-specific inits and update SEO metadata
      if (mainView === "builder") {
        this.ensureScript("js/components/builder.js")
          .then(() => HoseBuilder.render())
          .catch(err => console.error("Failed to load builder:", err));
        this.updateSEO(
          "Интерактивен конфигуратор на маркучи | Хидролукс Груп",
          "Конфигурирайте и поръчайте маркучи за високо налягане по индивидуален размер. Лесен избор на накрайници и спирали с изчисляване на цена в реално време.",
          "#builder"
        );
        this.updateSchema({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Интерактивен конфигуратор на маркучи",
          "provider": {
            "@type": "LocalBusiness",
            "name": "Хидролукс Груп"
          },
          "description": "Сглобете и конфигурирайте собствен маркуч по индивидуални размери с бързи калкулации на цената."
        });
      } else if (mainView === "admin") {
        this.ensureScript("js/admin.js")
          .then(() => Admin.init())
          .catch(err => console.error("Failed to load admin panel:", err));
        this.updateSEO("Административен панел | Хидролукс Груп", "Административен панел на Хидролукс Груп.", "#admin");
        this.updateSchema(null);
      } else if (mainView === "checkout") {
        Cart.renderCheckoutSummary();
        this.updateSEO("Завършване на поръчката | Хидролукс Груп", "Сигурно финализиране на Вашата поръчка за хидравлични и пневматични решения в онлайн магазина на Хидролукс.", "#checkout");
        this.updateSchema(null);
      } else if (mainView === "catalog") {
        Catalog.filterWishlist = false;
        const subParam = parts[2];
        const subsubParam = parts[3];
        if (viewParam) {
          Catalog.activeCategory = viewParam;
          Catalog.activeSubcategory = subParam || null;
          Catalog.activeSubSubcategory = subsubParam || null;
        } else {
          Catalog.activeCategory = null;
          Catalog.activeSubcategory = null;
          Catalog.activeSubSubcategory = null;
        }
        Catalog.renderSidebar();
        Catalog.applyFiltersAndRender();

        this.updateSEO(
          "Продуктов каталог | Маркучи, Хидравлика & Пневматика | Хидролукс Груп",
          "Разгледайте нашия продуктов каталог с маркучи за въздух, вода, гориво, силиконови съединения, хидравлични накрайници, бързи връзки и други от Хидролукс.",
          hash
        );
        this.updateSchema(null);
      } else if (mainView === "wishlist") {
        Catalog.filterWishlist = true;
        Catalog.activeCategory = null;
        Catalog.activeSubcategory = null;
        Catalog.activeSubSubcategory = null;
        Catalog.searchQuery = "";
        
        Catalog.renderSidebar();
        Catalog.applyFiltersAndRender();

        this.updateSEO(
          "Любими продукти | Хидролукс Груп",
          "Вашите любими и запазени продукти в Хидролукс Груп.",
          "#wishlist"
        );
        this.updateSchema(null);
      } else if (mainView === "services") {
        this.updateSEO(
          "Сервиз, услуги и техническа консултация в Монтана | Хидролукс Груп",
          "Професионално запресоване на маркучи, ремонт на хидравлични цилиндри и пневматични системи в нашия специализиран сервиз в град Монтана на ул. Индустриална 32г.",
          "#services"
        );
        this.updateSchema(this.getLocalBusinessSchema());
      } else if (mainView === "about") {
        this.updateSEO(
          "За нас | Хидролукс Груп - Лидер в Хидравликата & Пневматиката",
          "Научете повече за историята, мисията и екипа от професионалисти на Хидролукс Груп. Работим с водещи световни марки от 2019 г.",
          "#about"
        );
        this.updateSchema(null);
      } else if (mainView === "contacts") {
        this.updateSEO(
          "Контакти | Свържете се с нас | Хидролукс Груп Монтана",
          "Свържете се с екипа на Хидролукс Груп в Монтана. Телефон: 0892 483 337, имейл: hydroluxgroup@gmail.com, адрес: ул. Индустриална 32Г.",
          "#contacts"
        );
        this.updateSchema(this.getLocalBusinessSchema());
      } else if (mainView === "product-detail") {
        if (viewParam) {
          // If product page is loaded directly via URL, initialize it (avoiding navigate recursion)
          Catalog.openProductDetails(viewParam, false);
        } else {
          // Fallback to catalog
          this.navigate("catalog");
        }
      } else if (mainView === "home") {
        this.updateSEO(
          "Хидролукс Груп | Маркучи за високо налягане, Хидравлика и Пневматика Монтана",
          "Хидролукс Груп град Монтана предлага производство и запресоване на маркучи за високо налягане, хидравлика, пневматика, фитинги и уплътнения. Професионален сервиз от 2019 г.",
          ""
        );
        this.updateSchema(this.getLocalBusinessSchema());
      }
    } else {
      // Fallback
      document.getElementById("home-view").classList.add("active");
      this.currentView = "home";
      this.updateSEO(
        "Хидролукс Груп | Маркучи за високо налягане, Хидравлика и Пневматика Монтана",
        "Хидролукс Груп град Монтана предлага производство и запресоване на маркучи за високо налягане, хидравлика, пневматика, фитинги и уплътнения. Професионален сервиз от 2019 г.",
        ""
      );
      this.updateSchema(this.getLocalBusinessSchema());
    }
  },

  toggleMobileMenu(forceState) {
    const nav = document.getElementById("main-nav-links");
    if (!nav) return;
    if (forceState !== undefined) {
      if (forceState) nav.classList.add("open");
      else nav.classList.remove("open");
    } else {
      nav.classList.toggle("open");
    }
  },

  updateHeroStats() {
    // Dynamically display date/year in footer
    const yearEl = document.getElementById("footer-current-year");
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  },

  // Dynamic SEO meta tags and OG updates
  updateSEO(title, description, hashPath) {
    document.title = title;

    const metaDesc = document.getElementById("meta-description");
    if (metaDesc) {
      metaDesc.setAttribute("content", description);
    }

    const canonicalLink = document.getElementById("canonical-link");
    if (canonicalLink) {
      const fullUrl = `https://hydrolux.bg/${hashPath}`;
      canonicalLink.setAttribute("href", fullUrl);
    }

    const ogTitle = document.getElementById("og-title");
    if (ogTitle) ogTitle.setAttribute("content", title);

    const ogDesc = document.getElementById("og-description");
    if (ogDesc) ogDesc.setAttribute("content", description);

    const ogUrl = document.getElementById("og-url");
    if (ogUrl) ogUrl.setAttribute("content", `https://hydrolux.bg/${hashPath}`);
  },

  // Dynamic JSON-LD injection
  updateSchema(schemaObj) {
    const scriptEl = document.getElementById("schema-jsonld");
    if (!scriptEl) return;
    
    if (schemaObj) {
      scriptEl.textContent = JSON.stringify(schemaObj, null, 2);
    } else {
      scriptEl.textContent = "";
    }
  },

  getLocalBusinessSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "Store",
      "name": "Хидролукс Груп ЕООД",
      "image": "https://hydrolux.bg/assets/logo.webp",
      "url": "https://hydrolux.bg/",
      "telephone": "+359892484337",
      "email": "office@hydrolux.bg",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "ул. Индустриална 32г",
        "addressLocality": "Монтана",
        "postalCode": "3400",
        "addressCountry": "BG"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "43.4125",
        "longitude": "23.2250"
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday"
          ],
          "opens": "08:30",
          "closes": "17:30"
        },
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": "Saturday",
          "opens": "09:00",
          "closes": "13:00"
        }
      ]
    };
  },

  initScrollHeader() {
    let lastScrollY = window.pageYOffset;
    const header = document.querySelector(".header-main");
    if (!header) return;

    window.addEventListener("scroll", () => {
      const currentScrollY = window.pageYOffset;
      
      // If we scrolled past a certain threshold (e.g. 150px)
      if (currentScrollY > 150) {
        header.classList.add("header-scrolled");
        
        // Check scroll direction
        if (currentScrollY > lastScrollY) {
          // Scrolling down - hide header
          header.classList.add("header-hidden");
        } else {
          // Scrolling up - show header
          header.classList.remove("header-hidden");
        }
      } else {
        // Near the top of the page - show header and remove shadow
        header.classList.remove("header-hidden", "header-scrolled");
      }
      
      lastScrollY = currentScrollY;
    }, { passive: true });
  }
};

// Start application when DOM is ready
document.addEventListener("DOMContentLoaded", () => App.init());
