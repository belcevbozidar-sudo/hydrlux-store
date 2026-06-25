// Catalog Filtering, Dropdowns & Details Controller (Euro € Optimized)
const Catalog = {
  activeCategory: null,
  activeSubcategory: null,
  activeSubSubcategory: null,
  searchQuery: "",
  filterBrand: "",
  filterSize: "",
  filterPressure: "",
  filterTemp: "",
  sortBy: "default",
  productsLimit: 24,
  searchTimeout: null,

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  openProductPdf(prodId) {
    this.openProductPdfData(prodId, 0);
  },

  openProductPdfData(prodId, idx) {
    const product = CONFIG.products.find(p => p.id === prodId);
    if (!product) return;

    let pdfEntry = null;
    if (product.pdfs && product.pdfs[idx]) {
      pdfEntry = product.pdfs[idx];
    } else if (idx === 0 && product.pdf) {
      pdfEntry = { data: product.pdf };
    }

    if (!pdfEntry) return;

    // New PDFs are stored in Convex file storage and opened directly by URL.
    if (pdfEntry.url) {
      window.open(pdfEntry.url, "_blank");
      return;
    }

    // Legacy fallback: older PDFs were embedded as base64 data URLs.
    const pdfData = pdfEntry.data;
    if (!pdfData) return;

    try {
      const base64Parts = pdfData.split(",");
      const contentType = base64Parts[0].split(":")[1].split(";")[0];
      const base64Data = base64Parts[1];

      const byteCharacters = atob(base64Data);
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }

      const blob = new Blob(byteArrays, { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err) {
      console.error("Error opening PDF:", err);
      alert("Не успяхме да отворим PDF файла на това устройство.");
    }
  },

  expandedCategories: {},

  toggleTreeExpand(catId) {
    this.selectCategory(catId);
  },

  toggleTreeExpandSub(catId, subId) {
    const key = `${catId}_${subId}`;
    this.expandedCategories[key] = !this.expandedCategories[key];
    this.renderSidebar();
  },

  selectSubcategoryClick(catId, subId) {
    this.activeCategory = catId || null;
    
    // Toggle subcategory if clicked again
    if (this.activeSubcategory === subId) {
      this.activeSubcategory = null;
    } else {
      this.activeSubcategory = subId || null;
    }
    
    this.activeSubSubcategory = null;
    if (App.currentView !== "catalog") {
      App.navigate("catalog");
    }
    this.renderSidebar();
    this.applyFiltersAndRender();
  },

  selectSubSubcategoryClick(catId, subId, subsubId) {
    this.activeCategory = catId || null;
    this.activeSubcategory = subId || null;
    
    // Toggle sub-subcategory if clicked again
    if (this.activeSubSubcategory === subsubId) {
      this.activeSubSubcategory = null;
    } else {
      this.activeSubSubcategory = subsubId || null;
    }
    
    if (App.currentView !== "catalog") {
      App.navigate("catalog");
    }
    this.renderSidebar();
    this.applyFiltersAndRender();
  },

  changeSort(val) {
    this.sortBy = val;
    this.applyFiltersAndRender();
  },

  // Render product categories inside the top collapsible dropdown menu
  renderSidebar() {
    const container = document.getElementById("catalog-categories-tags-list");
    if (!container) return;

    if (!this.activeCategory) {
      container.innerHTML = "";
      this.renderSpecsFilters();
      this.renderSubcategoriesTop();
      return;
    }

    let treeHtml = `
      <div class="catalog-tree-container">
        <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px;">Категории</div>
        <ul class="catalog-tree-menu">
    `;

    CONFIG.categories.forEach(cat => {
      const isCatActive = this.activeCategory === cat.id;

      treeHtml += `
        <li class="tree-item ${isCatActive ? 'active' : ''}" id="tree-cat-${cat.id}">
          <div class="tree-row" onclick="Catalog.selectCategory('${cat.id}')">
            <span class="tree-toggle-spacer"></span>
            <span class="tree-link">
              <span class="tree-label">${cat.name}</span>
            </span>
          </div>
        </li>
      `;
    });

    treeHtml += `
        </ul>
      </div>
    `;

    container.innerHTML = treeHtml;
    this.renderSpecsFilters();
    this.renderSubcategoriesTop();
  },

  renderSubcategoriesTop() {
    const container = document.getElementById("catalog-subcategories-container");
    const tagsContainer = document.getElementById("catalog-subcategories-tags");
    const subtagsContainer = document.getElementById("catalog-subsubcategories-tags");
    if (!container || !tagsContainer || !subtagsContainer) return;

    if (!this.activeCategory) {
      container.style.display = "none";
      tagsContainer.innerHTML = "";
      subtagsContainer.innerHTML = "";
      return;
    }

    const cat = CONFIG.categories.find(c => c.id === this.activeCategory);
    if (!cat || !cat.subcategories || cat.subcategories.length === 0) {
      container.style.display = "none";
      tagsContainer.innerHTML = "";
      subtagsContainer.innerHTML = "";
      return;
    }

    container.style.display = "flex";

    // 1. Render subcategories horizontal tags (without "All" button)
    let tagsHtml = `
      ${cat.subcategories.map(sub => `
        <button class="subcategory-tag-btn ${this.activeSubcategory === sub.id ? 'active' : ''}" onclick="Catalog.selectSubcategoryClick('${cat.id}', '${sub.id}')">
          ${sub.name}
        </button>
      `).join("")}
    `;
    tagsContainer.innerHTML = tagsHtml;

    // 2. Render sub-subcategories if subcategory is selected and has sub-subcategories
    let subsubHtml = "";
    if (this.activeSubcategory) {
      const sub = cat.subcategories.find(s => s.id === this.activeSubcategory);
      if (sub && sub.subcategories && sub.subcategories.length > 0) {
        subsubHtml = `
          <div style="font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; width: 100%; margin-top: 5px; margin-bottom: 5px;">Под-подкатегории:</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; width: 100%;">
            ${sub.subcategories.map(subsub => `
              <button class="subcategory-tag-btn ${this.activeSubSubcategory === subsub.id ? 'active' : ''}" onclick="Catalog.selectSubSubcategoryClick('${cat.id}', '${sub.id}', '${subsub.id}')">
                ${subsub.name}
              </button>
            `).join("")}
          </div>
        `;
      }
    }
    subtagsContainer.innerHTML = subsubHtml;
  },

  renderSpecsFilters() {
    const container = document.getElementById("catalog-specs-filters");
    if (!container) return;

    // Filter available option options to match the selected category & subcategory
    let scopeProducts = CONFIG.products;
    if (this.activeCategory) {
      scopeProducts = scopeProducts.filter(p => {
        const productCats = p.categories || (p.category ? [p.category] : []);
        return productCats.includes(this.activeCategory);
      });
    }
    if (this.activeSubcategory) {
      scopeProducts = scopeProducts.filter(p => {
        const productSubs = p.subcategories || (p.subcategory ? [p.subcategory] : []);
        const productCats = p.categories || [];
        return productSubs.includes(this.activeSubcategory) || productCats.includes(this.activeSubcategory);
      });
    }

    // 1. Brands
    const brands = [...new Set(scopeProducts.map(p => p.brand).filter(Boolean))].sort();

    // 2. Sizes (innerDb)
    const sizes = [...new Set(scopeProducts.flatMap(p => (p.variants || []).map(v => v.innerDb)).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));

    // 3. Pressures
    const pressures = [...new Set(scopeProducts.flatMap(p => (p.variants || []).map(v => v.pressure)).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));

    // 4. Temps (specs containing "температура")
    const temps = [...new Set(scopeProducts.flatMap(p => (p.specs || []).filter(s => s.key.toLowerCase().includes("температура")).map(s => s.value)).filter(Boolean))].sort();

    container.innerHTML = `
      <div class="filter-group-item" style="flex: 1; min-width: 140px;">
        <label style="display: block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Марка</label>
        <select class="form-control" onchange="Catalog.filterBrand = this.value; Catalog.applyFiltersAndRender();" style="height: 38px; padding: 6px 12px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%;">
          <option value="">Всички</option>
          ${brands.map(b => `<option value="${b}" ${this.filterBrand === b ? 'selected' : ''}>${b}</option>`).join("")}
        </select>
      </div>

      <div class="filter-group-item" style="flex: 1; min-width: 140px;">
        <label style="display: block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Размер (ø вътр.)</label>
        <select class="form-control" onchange="Catalog.filterSize = this.value; Catalog.applyFiltersAndRender();" style="height: 38px; padding: 6px 12px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%;">
          <option value="">Всички</option>
          ${sizes.map(s => `<option value="${s}" ${this.filterSize === s ? 'selected' : ''}>${s} мм</option>`).join("")}
        </select>
      </div>

      <div class="filter-group-item" style="flex: 1; min-width: 140px;">
        <label style="display: block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Налягане (Bar)</label>
        <select class="form-control" onchange="Catalog.filterPressure = this.value; Catalog.applyFiltersAndRender();" style="height: 38px; padding: 6px 12px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%;">
          <option value="">Всички</option>
          ${pressures.map(p => `<option value="${p}" ${this.filterPressure === p ? 'selected' : ''}>${p} Bar</option>`).join("")}
        </select>
      </div>

      <div class="filter-group-item" style="flex: 1; min-width: 140px;">
        <label style="display: block; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Работна темп.</label>
        <select class="form-control" onchange="Catalog.filterTemp = this.value; Catalog.applyFiltersAndRender();" style="height: 38px; padding: 6px 12px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%;">
          <option value="">Всички</option>
          ${temps.map(t => `<option value="${t}" ${this.filterTemp === t ? 'selected' : ''}>${t}</option>`).join("")}
        </select>
      </div>
    `;
  },

  toggleCategoriesDropdown() {
    const menu = document.getElementById("catalog-cat-dropdown-menu");
    if (menu) {
      menu.classList.toggle("hidden");
    }
  },

  selectCategory(catId) {
    this.filterWishlist = false;
    if (catId) {
      App.navigate(`catalog/${catId}`);
    } else {
      App.navigate("catalog");
    }
  },

  selectSubcategory(subId) {
    this.filterWishlist = false;
    const catId = this.activeCategory;
    if (catId && subId) {
      App.navigate(`catalog/${catId}/${subId}`);
    } else if (catId) {
      App.navigate(`catalog/${catId}`);
    } else {
      App.navigate("catalog");
    }
  },

  selectSubSubcategory(subsubId) {
    this.filterWishlist = false;
    const catId = this.activeCategory;
    const subId = this.activeSubcategory;
    if (catId && subId && subsubId) {
      App.navigate(`catalog/${catId}/${subId}/${subsubId}`);
    } else if (catId && subId) {
      App.navigate(`catalog/${catId}/${subId}`);
    } else if (catId) {
      App.navigate(`catalog/${catId}`);
    } else {
      App.navigate("catalog");
    }
  },

  resetFilters() {
    this.activeCategory = null;
    this.activeSubcategory = null;
    this.activeSubSubcategory = null;
    this.searchQuery = "";
    this.filterBrand = "";
    this.filterSize = "";
    this.filterPressure = "";
    this.filterTemp = "";
    this.filterWishlist = false;
    this.sortBy = "default";
    
    const select = document.getElementById("catalog-sort-select");
    if (select) select.value = "default";
    
    const searchInput = document.getElementById("search-input-blue");
    if (searchInput) searchInput.value = "";
    
    App.navigate("catalog");
  },

  applyFiltersAndRender(isLoadMore = false) {
    if (!isLoadMore) {
      this.productsLimit = 24;
    }
    const products = CONFIG.products;
    const grid = document.getElementById("products-grid");
    if (!grid) return;

    const loadMoreContainer = document.getElementById("catalog-load-more-container");
    if (loadMoreContainer) {
      loadMoreContainer.style.display = "none";
    }

    // Set grid class back to products grid by default
    grid.className = "products-grid full-width";

    const sortContainer = document.getElementById("catalog-sort-container");
    const countContainer = document.getElementById("catalog-count-container");

    // If no category and no other filter/search is active, render category card grid
    if (!this.filterWishlist && !this.activeCategory && !this.searchQuery && !this.filterBrand && !this.filterSize && !this.filterPressure && !this.filterTemp) {
      if (sortContainer) sortContainer.style.display = "none";
      if (countContainer) countContainer.style.marginLeft = "auto";

      const titleEl = document.getElementById("catalog-active-title");
      const countEl = document.getElementById("catalog-count");
      if (titleEl) titleEl.textContent = "Всички категории";
      if (countEl) countEl.textContent = CONFIG.categories.length;

      grid.className = "catalog-categories-cards-grid";
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

      grid.innerHTML = CONFIG.categories.map(cat => {
        const imageSrc = getCatImg(cat);
        const cleanImageSrc = imageSrc.replace(/\s+/g, '%20');
        return `
          <div class="category-card-card" onclick="Catalog.selectCategory('${cat.id}')" style="background-image: url('${cleanImageSrc}');">
            <div class="category-card-overlay">
              <div class="category-card-info">
                <span class="category-card-icon">${cat.icon || '📁'}</span>
                <h3 class="category-card-title">${cat.name}</h3>
              </div>
            </div>
          </div>
        `;
      }).join("");
      return;
    }

    let filtered = products.filter(p => {
      // 0. Wishlist check
      if (this.filterWishlist) {
        const wishlist = (typeof App !== "undefined" && typeof App.getWishlist === "function") ? App.getWishlist() : [];
        if (!wishlist.includes(p.id)) return false;
      }

      // 1. Category check
      if (this.activeCategory) {
        const productCats = p.categories || (p.category ? [p.category] : []);
        if (!productCats.includes(this.activeCategory)) return false;
      }

      // 2. Subcategory check
      if (this.activeSubcategory) {
        const productSubs = p.subcategories || (p.subcategory ? [p.subcategory] : []);
        const productCats = p.categories || [];
        if (!productSubs.includes(this.activeSubcategory) && !productCats.includes(this.activeSubcategory)) return false;
      }

      // 2.5. Sub-subcategory check
      if (this.activeSubSubcategory) {
        const productSubSubs = p.subsubcategories || (p.subsubcategory ? [p.subsubcategory] : []);
        const productCats = p.categories || [];
        if (!productSubSubs.includes(this.activeSubSubcategory) && !productCats.includes(this.activeSubSubcategory)) return false;
      }

      // 3. Search check
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesBrand = p.brand.toLowerCase().includes(query);
        const matchesCode = p.code.toLowerCase().includes(query);
        const matchesTags = p.tags.some(t => t.toLowerCase().includes(query));
        if (!matchesName && !matchesBrand && !matchesCode && !matchesTags) return false;
      }

      // 4. Spec Filters
      // 4.1 Brand
      if (this.filterBrand && p.brand !== this.filterBrand) return false;

      // 4.2 Size (innerDb from variants)
      if (this.filterSize && !(p.variants || []).some(v => String(v.innerDb) === this.filterSize)) return false;

      // 4.3 Pressure (pressure from variants)
      if (this.filterPressure && !(p.variants || []).some(v => String(v.pressure) === this.filterPressure)) return false;

      // 4.4 Temp (specs key temperature value)
      if (this.filterTemp && !(p.specs || []).some(s => s.key.toLowerCase().includes("температура") && s.value === this.filterTemp)) return false;

      return true;
    });

    if (sortContainer) {
      sortContainer.style.display = "flex";
      sortContainer.style.marginLeft = "auto";
    }
    if (countContainer) countContainer.style.marginLeft = "10px";

    // Apply sorting
    if (this.sortBy === "best_sellers") {
      filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (this.sortBy === "price_asc") {
      filtered.sort((a, b) => {
        const minA = a.variants && a.variants.length > 0 ? Math.min(...a.variants.map(v => parseFloat(v.priceEur) || 0)) : 0;
        const minB = b.variants && b.variants.length > 0 ? Math.min(...b.variants.map(v => parseFloat(v.priceEur) || 0)) : 0;
        return minA - minB;
      });
    } else if (this.sortBy === "price_desc") {
      filtered.sort((a, b) => {
        const minA = a.variants && a.variants.length > 0 ? Math.min(...a.variants.map(v => parseFloat(v.priceEur) || 0)) : 0;
        const minB = b.variants && b.variants.length > 0 ? Math.min(...b.variants.map(v => parseFloat(v.priceEur) || 0)) : 0;
        return minB - minA;
      });
    } else if (this.sortBy === "name_asc") {
      filtered.sort((a, b) => a.name.localeCompare(b.name, "bg"));
    }

    // Update active filters title
    const titleEl = document.getElementById("catalog-active-title");
    const countEl = document.getElementById("catalog-count");
    if (countEl) countEl.textContent = filtered.length;

    if (titleEl) {
      if (this.filterWishlist) {
        titleEl.textContent = "Любими продукти";
      } else if (this.activeCategory) {
        const cat = CONFIG.categories.find(c => c.id === this.activeCategory);
        titleEl.textContent = cat ? cat.name : "Всички продукти";
      } else if (this.searchQuery) {
        titleEl.textContent = `Резултати за "${this.searchQuery}"`;
      } else {
        titleEl.textContent = "Всички продукти";
      }
    }

    if (filtered.length === 0) {
      if (this.filterWishlist) {
        grid.innerHTML = `
          <div class="no-products text-center py-40 card">
            <div class="no-products-icon">❤️</div>
            <h3>Списъкът с любими е празен</h3>
            <p class="text-muted">Можете да добавите продукти в любими, като натиснете иконата със сърце на продуктите.</p>
            <button class="btn btn-primary mt-20" onclick="Catalog.resetFilters(); App.navigate('catalog')">Към каталога</button>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="no-products text-center py-40 card">
            <div class="no-products-icon">🔍</div>
            <h3>Няма намерени продукти</h3>
            <p class="text-muted">Променете филтрите или опитайте с друга ключова дума.</p>
            <button class="btn btn-secondary mt-20" onclick="Catalog.resetFilters()">Изчисти филтрите</button>
          </div>
        `;
      }
      return;
    }

    const productsToRender = filtered.slice(0, this.productsLimit);

    grid.innerHTML = productsToRender.map(p => {
      const prices = (p.variants || []).map(v => parseFloat(v.priceEur) || 0);
      const positivePrices = prices.filter(pr => pr > 0);
      
      let priceText = "";
      if (positivePrices.length === 0) {
        priceText = "По запитване";
      } else if (positivePrices.length === 1) {
        priceText = `${formatPrice(positivePrices[0], p.unit === 'м').eur}`;
      } else {
        const minPrice = Math.min(...positivePrices);
        const maxPrice = Math.max(...positivePrices);
        priceText = minPrice === maxPrice
          ? `${formatPrice(minPrice, p.unit === 'м').eur}`
          : `от ${formatPrice(minPrice, p.unit === 'м').eur} до ${formatPrice(maxPrice, p.unit === 'м').eur}`;
      }

      return `
        <div class="product-card card" onclick="Catalog.openProductDetails('${p.id}')">
          <div class="product-badge">${p.inStock ? 'В наличност' : 'По поръчка'}</div>
          <div class="product-card-img-wrapper">
            <img src="${p.images[0]}" alt="${p.name} - ${p.brand} | Хидролукс Груп" class="product-card-img" onerror="this.src='https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop'" width="240" height="240" loading="lazy">
          </div>
          <div class="product-card-body">
            <div class="product-card-brand">${p.brand}</div>
            <h4 class="product-card-title">${p.name}</h4>
            <div class="product-card-rating">
              <span class="stars">★★★★★</span>
              <span class="rating-val">${p.rating.toFixed(1)}</span>
            </div>
            
            <div class="product-card-bottom">
              <div class="product-card-price">
                <span class="price-bgn font-medium text-primary font-bold">${priceText}</span>
                <span class="price-eur font-xs text-muted">/ линеен метър или бр.</span>
              </div>
              <button class="btn btn-secondary btn-icon" onclick="event.stopPropagation(); Catalog.openProductDetails('${p.id}')">➔</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    if (loadMoreContainer) {
      if (filtered.length > this.productsLimit) {
        loadMoreContainer.style.display = "flex";
      } else {
        loadMoreContainer.style.display = "none";
      }
    }
  },

  openProductDetails(productId, shouldNavigate = true) {
    const product = CONFIG.products.find(p => p.id === productId);
    if (!product) return;
    this.currentProduct = product;

    // Transition view
    if (shouldNavigate) {
      App.navigate("product-detail/" + productId);
      return;
    }

    // Breadcrumb rendering
    const breadcrumb = document.getElementById("product-detail-breadcrumb");
    if (breadcrumb) {
      const primaryCatId = (product.categories && product.categories.length > 0) ? product.categories[0] : product.category;
      const primarySubId = (product.subcategories && product.subcategories.length > 0) ? product.subcategories[0] : product.subcategory;
      const primarySubSubId = (product.subsubcategories && product.subsubcategories.length > 0) ? product.subsubcategories[0] : product.subsubcategory;
      const cat = CONFIG.categories.find(c => c.id === primaryCatId);
      let breadcrumbHtml = `<a onclick="App.navigate('home')">Начало</a>`;
      if (cat) {
        breadcrumbHtml += ` › <a onclick="Catalog.selectCategory('${cat.id}')">${cat.name}</a>`;
        if (primarySubId && cat.subcategories) {
          const subObj = cat.subcategories.find(s => s.id === primarySubId);
          if (subObj) {
            breadcrumbHtml += ` › <a onclick="Catalog.selectCategory('${cat.id}'); Catalog.selectSubcategory('${subObj.id}')">${subObj.name}</a>`;
            if (primarySubSubId && subObj.subcategories) {
              const subsubObj = subObj.subcategories.find(ss => ss.id === primarySubSubId);
              if (subsubObj) {
                breadcrumbHtml += ` › <a onclick="Catalog.selectCategory('${cat.id}'); Catalog.selectSubcategory('${subObj.id}'); Catalog.selectSubSubcategory('${subsubObj.id}')">${subsubObj.name}</a>`;
              }
            }
          }
        }
      }
      breadcrumbHtml += ` › <span class="text-muted">${product.name}</span>`;
      breadcrumb.innerHTML = breadcrumbHtml;
    }

    // Set title and brand
    document.getElementById("prod-title").textContent = product.name;
    const brandEl = document.getElementById("prod-brand");
    const brandContainer = document.getElementById("prod-brand-container");
    if (product.brand) {
      if (brandEl) brandEl.textContent = product.brand;
      if (brandContainer) brandContainer.style.display = "block";
    } else {
      if (brandContainer) brandContainer.style.display = "none";
    }
    document.getElementById("prod-sku").textContent = product.code;
    document.getElementById("prod-views").textContent = product.views;
    
    // Set stock
    const stockEl = document.getElementById("prod-stock");
    stockEl.className = `stock-badge ${product.inStock ? 'in-stock' : 'out-of-stock'}`;
    stockEl.textContent = product.inStock ? "В наличност" : "По запитване";

    // Inject Description
    let descHtml = product.description.replace(/\n\n/g, "<br><br>");
    
    let pdfsToRender = [];
    if (product.pdfs && product.pdfs.length > 0) {
      pdfsToRender = product.pdfs;
    } else if (product.pdf) {
      pdfsToRender = [{ name: "Техническа спецификация (PDF)", data: product.pdf }];
    }

    if (pdfsToRender.length > 0) {
      descHtml += `<div class="pdf-datasheets-wrapper" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px;">`;
      pdfsToRender.forEach((pdf, idx) => {
        const displayName = pdf.displayName || pdf.name;
        descHtml += `
          <button onclick="Catalog.openProductPdfData('${product.id}', ${idx})" class="pdf-datasheet-link" title="${this.escapeHtml(displayName)}" style="display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 5px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: #16a34a; text-align: left; transition: background-color 0.15s, border-color 0.15s;" onmouseover="this.style.backgroundColor='#f0fdf4'; this.style.borderColor='#16a34a';" onmouseout="this.style.backgroundColor='#f8fafc'; this.style.borderColor='#e2e8f0';">
            <span style="font-size: 0.95rem; line-height: 1;">📄</span>
            <span style="white-space: normal; word-break: break-word;">${this.escapeHtml(displayName)}</span>
          </button>
        `;
      });
      descHtml += `</div>`;
    }
    document.getElementById("prod-desc-text").innerHTML = descHtml;

    // Inject Specs List
    const specsContainer = document.getElementById("prod-specs-list");
    specsContainer.innerHTML = product.specs.map(s => `
      <div class="spec-row">
        <span class="spec-key">${s.key}</span>
        <span class="spec-val">${s.value}</span>
      </div>
    `).join("");

    // Inject Tags
    const tagsContainer = document.getElementById("prod-tags-container");
    tagsContainer.innerHTML = product.tags.map(t => `
      <span class="tag" onclick="Catalog.triggerTagSearch('${t}')">${t}</span>
    `).join("");

    // Inject Gallery Image and Setup Gallery Navigation state
    this.currentProductImages = product.images || [];
    this.currentProductImageIndex = 0;

    const prevBtn = document.querySelector(".gallery-nav-btn.prev");
    const nextBtn = document.querySelector(".gallery-nav-btn.next");
    if (prevBtn && nextBtn) {
      if (this.currentProductImages.length > 1) {
        prevBtn.style.display = "flex";
        nextBtn.style.display = "flex";
      } else {
        prevBtn.style.display = "none";
        nextBtn.style.display = "none";
      }
    }

    const mainImg = document.getElementById("prod-main-image");
    mainImg.onerror = function() {
      this.src = "assets/logo.webp";
    };
    mainImg.src = product.images[0];
    mainImg.alt = `${product.name} - ${product.brand} | Хидролукс Груп`;
    
    const thumbsContainer = document.getElementById("prod-thumbnails");
    thumbsContainer.innerHTML = product.images.map((img, idx) => `
      <img src="${img}" alt="${product.name} - детайлно изображение ${idx + 1}" class="thumb-img ${idx === 0 ? 'active' : ''}" 
           onerror="this.src='assets/logo.webp'"
           onclick="Catalog.changeMainImage('${img}', this)">
    `).join("");

    // 🔥 Dynamic Variants Table strictly in EUR €
    const tableContainer = document.querySelector(".table-responsive");
    if (tableContainer) {
      const cols = (product.columns || [
        { key: "code", label: "Код на размер" },
        { key: "innerDb", label: "Вътрешен размер (мм)", check: (v) => parseFloat(v.innerDb) > 0 },
        { key: "inch", label: "Inch", check: (v) => v.inch && v.inch !== "-" },
        { key: "outerDb", label: "Външен размер (мм)", check: (v) => parseFloat(v.outerDb) > 0 },
        { key: "rangeDb", label: "Диапазон (мм)", check: (v) => v.rangeDb && v.rangeDb !== "" },
        { key: "wallDb", label: "Дебелина на стената (мм)", check: (v) => v.wallDb && v.wallDb !== "" },
        { key: "pressure", label: "Максимално работно налягане (bar)", check: (v) => parseFloat(v.pressure) > 0 },
        { key: "burstDb", label: "Налягане на разкъсване (bar)", check: (v) => v.burstDb && v.burstDb !== "" },
        { key: "vacuumDb", label: "Вакуум", check: (v) => v.vacuumDb && v.vacuumDb !== "" },
        { key: "spacingDb", label: "Разстояние между зъбите (мм)", check: (v) => v.spacingDb && v.spacingDb !== "" },
        { key: "hexDb", label: "HEX размер (мм)", check: (v) => v.hexDb && v.hexDb !== "" },
        { key: "braidsDb", label: "Брой вложки", check: (v) => v.braidsDb && v.braidsDb !== "" },
        { key: "sleeveWidthDb", label: "Широчина на ръкава (мм)", check: (v) => v.sleeveWidthDb && v.sleeveWidthDb !== "" },
        { key: "bend", label: "Радиус на огъване (мм)", check: (v) => parseFloat(v.bend) > 0 },
        { key: "weight", label: "Тегло (кг/м)", check: (v) => parseFloat(v.weight) > 0 },
        { key: "rollLength", label: "Дължина на ролката (м)", check: (v) => v.rollLength !== undefined && v.rollLength !== null && String(v.rollLength).trim() !== "" && String(v.rollLength).trim() !== "0" },
        { key: "priceEur", label: "Цена" }
      ]).filter(c => !c.check || product.variants.some(v => c.check(v)));

      tableContainer.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              ${cols.map(c => `<th class="text-center">${c.label}</th>`).join("")}
              <th class="text-center">Количество</th>
              <th class="text-center">Действие</th>
            </tr>
          </thead>
          <tbody id="prod-variants-tbody">
            ${product.variants.map((v, idx) => {
              const priceVal = parseFloat(v.priceEur) || 0;
              const vCode = this.getVariantCode(product, v, idx);
              const qtyId = this.getVariantQtyInputId(idx);
              return `
                <tr>
                  ${cols.map(c => {
                    const val = v[c.key] !== undefined ? v[c.key] : '';
                    if (c.key === 'priceEur') {
                      return `<td class="text-center"><div class="table-price-bgn">${formatPrice(priceVal, product.unit === 'м').eur}</div></td>`;
                    }
                    if (c.key === 'code') {
                      return `<td class="text-center font-bold text-primary font-xs">${val}</td>`;
                    }
                    if (c.key === 'pressure') {
                      return `<td class="text-center"><span class="badge badge-warning">${val} Bar</span></td>`;
                    }
                    const suffix = c.suffix || '';
                    return `<td class="text-center">${val}${suffix}</td>`;
                  }).join("")}
                  <td class="text-center">
                    <div class="quantity-input-wrapper small">
                      <button class="btn btn-secondary btn-icon small" onclick="Catalog.adjustVariantQtyByIndex(${idx}, -1)">-</button>
                      <input type="number" id="${qtyId}" class="form-control text-center small qty-input" value="0" min="0">
                      <button class="btn btn-secondary btn-icon small" onclick="Catalog.adjustVariantQtyByIndex(${idx}, 1)">+</button>
                    </div>
                  </td>
                  <td class="text-center">
                    <button class="btn btn-primary small btn-buy-variant" onclick="Catalog.buyVariantByIndex('${product.id}', ${idx})">
                      Купи
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    // Set grand "Buy Selected" actions
    const bulkBtn = document.getElementById("prod-bulk-add-btn");
    bulkBtn.onclick = () => {
      let addedAny = false;
      product.variants.forEach((v, idx) => {
        const input = document.getElementById(this.getVariantQtyInputId(idx));
        const qty = parseInt(input.value) || 0;
        if (qty > 0) {
          Cart.addItem(product, this.getVariantCode(product, v, idx), qty);
          addedAny = true;
        }
      });
      if (addedAny) {
        Cart.openDrawer();
      } else {
        Cart.showToast("Моля, задайте количество за поне един вариант.");
      }
    };

    // Update SEO Metadata and inject JSON-LD Product schema
    if (typeof App !== "undefined" && typeof App.updateSEO === "function") {
      const title = `${product.name} - ${product.brand} | Хидролукс Груп Монтана`;
      const desc = product.description.length > 155 ? product.description.substring(0, 152) + "..." : product.description;
      App.updateSEO(title, desc, `#product-detail/${product.id}`);
      
      const productSchema = this.getProductSchema(product);
      App.updateSchema(productSchema);
    }
  },

  getVariantCode(product, variant, index = 0) {
    if (typeof Cart !== "undefined" && typeof Cart.getVariantCode === "function") {
      return Cart.getVariantCode(product, variant, index);
    }
    return variant.code || `${product.code || product.id || "product"}-${index + 1}`;
  },

  getVariantQtyInputId(index) {
    return `qty-variant-${index}`;
  },

  changeMainImage(src, thumbEl) {
    document.getElementById("prod-main-image").src = src;
    document.querySelectorAll(".thumb-img").forEach(t => t.classList.remove("active"));
    thumbEl.classList.add("active");
    if (this.currentProductImages) {
      const idx = this.currentProductImages.indexOf(src);
      if (idx !== -1) {
        this.currentProductImageIndex = idx;
      }
    }
  },

  navigateGallery(direction) {
    if (!this.currentProductImages || this.currentProductImages.length <= 1) return;
    
    let newIndex = this.currentProductImageIndex + direction;
    if (newIndex < 0) {
      newIndex = this.currentProductImages.length - 1;
    } else if (newIndex >= this.currentProductImages.length) {
      newIndex = 0;
    }
    
    this.currentProductImageIndex = newIndex;
    const src = this.currentProductImages[newIndex];
    
    const mainImg = document.getElementById("prod-main-image");
    if (mainImg) mainImg.src = src;
    
    const thumbnails = document.querySelectorAll(".thumb-img");
    thumbnails.forEach((thumb, idx) => {
      if (idx === newIndex) {
        thumb.classList.add("active");
      } else {
        thumb.classList.remove("active");
      }
    });
  },

  adjustVariantQty(code, diff) {
    const input = document.getElementById(`qty-${code}`);
    if (input) {
      input.value = Math.max(0, (parseInt(input.value) || 0) + diff);
    }
  },

  adjustVariantQtyByIndex(index, diff) {
    const input = document.getElementById(this.getVariantQtyInputId(index));
    if (input) {
      input.value = Math.max(0, (parseInt(input.value) || 0) + diff);
    }
  },

  buyVariant(productId, code) {
    const product = CONFIG.products.find(p => p.id === productId);
    const input = document.getElementById(`qty-${code}`);
    let qty = parseInt(input ? input.value : 0) || 0;
    if (qty <= 0) {
      qty = 1;
      if (input) input.value = 1;
    }
    if (product) {
      Cart.addItem(product, code, qty);
      Cart.openDrawer();
    }
  },

  buyVariantByIndex(productId, index) {
    const product = CONFIG.products.find(p => p.id === productId);
    if (!product || !product.variants || !product.variants[index]) return;

    const input = document.getElementById(this.getVariantQtyInputId(index));
    let qty = parseInt(input ? input.value : 0) || 0;
    if (qty <= 0) {
      qty = 1;
      if (input) input.value = 1;
    }
    const variantCode = this.getVariantCode(product, product.variants[index], index);
    Cart.addItem(product, variantCode, qty);
    Cart.openDrawer();
  },

  triggerTagSearch(tag) {
    this.searchQuery = tag;
    document.getElementById("search-input-blue").value = tag;
    App.navigate("catalog");
    this.applyFiltersAndRender();
  },

  handleSearchInput(val) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.searchQuery = val;
      if (typeof App !== "undefined" && App.currentView !== "catalog") {
        App.navigate("catalog");
      }
      this.applyFiltersAndRender();
    }, 150);
  },

  loadMore() {
    this.productsLimit += 24;
    this.applyFiltersAndRender(true);
  },

  // Modal Inquiry Form (Задай въпрос)
  openInquiryModal() {
    const modal = document.getElementById("inquiry-modal");
    if (modal) {
      modal.classList.add("open");
      document.body.classList.add("no-scroll");
      const prodTitle = document.getElementById("prod-title").textContent;
      const sku = document.getElementById("prod-sku").textContent;
      document.getElementById("inquiry-subject").value = `Запитване относно: ${prodTitle} (SKU: ${sku})`;
    }
  },

  closeInquiryModal() {
    const modal = document.getElementById("inquiry-modal");
    if (modal) {
      modal.classList.remove("open");
      document.body.classList.remove("no-scroll");
    }
  },

  async submitInquiry(event) {
    event.preventDefault();
    const form = event.target;
    
    // Check if it is the product inquiry modal form or services page form
    const isProductInquiry = form.closest("#inquiry-modal") !== null;
    
    let payload = {};
    if (isProductInquiry) {
      const name = document.getElementById("inquiry-name").value.trim();
      const phone = document.getElementById("inquiry-phone").value.trim();
      const message = document.getElementById("inquiry-message").value.trim();
      const subject = document.getElementById("inquiry-subject").value.trim();
      
      payload = {
        type: "product",
        name,
        phone,
        message,
        subject
      };
      
      // Clear inputs
      document.getElementById("inquiry-name").value = "";
      document.getElementById("inquiry-phone").value = "";
      document.getElementById("inquiry-message").value = "";
      
      this.closeInquiryModal();
    } else {
      // Services/Contact form
      const name = document.getElementById("services-name").value.trim();
      const phone = document.getElementById("services-phone").value.trim();
      const email = document.getElementById("services-email").value.trim();
      const message = document.getElementById("services-message").value.trim();
      
      payload = {
        type: "contact",
        name,
        phone,
        email,
        message,
        subject: "Запитване от контактната форма"
      };
      
      // Clear inputs
      document.getElementById("services-name").value = "";
      document.getElementById("services-phone").value = "";
      document.getElementById("services-email").value = "";
      document.getElementById("services-message").value = "";
    }
    
    try {
      if (typeof HydroluxBackend !== "undefined") {
        await HydroluxBackend.submitInquiry(payload);
      }
      Cart.showToast("Благодарим Ви! Запитването е изпратено успешно.");
    } catch (err) {
      console.error("Failed to submit inquiry:", err);
      Cart.showToast("Възникна грешка при изпращането. Моля, опитайте пак.");
    }
  },

  openQuickOrderModal() {
    const modal = document.getElementById("quick-order-modal");
    if (modal && this.currentProduct) {
      modal.classList.add("open");
      document.body.classList.add("no-scroll");

      const select = document.getElementById("quick-order-variant-select");
      const wrapper = document.getElementById("quick-order-variant-wrapper");
      const hasVariants = this.currentProduct.variants && this.currentProduct.variants.length > 0;
      
      if (select && wrapper) {
        if (hasVariants) {
          wrapper.style.display = "block";
          select.setAttribute("required", "required");
          select.innerHTML = `
            <option value="">-- Изберете размер / вариант --</option>
            ${this.currentProduct.variants.map((v, idx) => {
              const code = this.getVariantCode(this.currentProduct, v, idx);
              const displayLabel = v.innerDb ? `${v.innerDb}мм (${v.inch || ''})` : code;
              const price = formatPrice(v.priceEur).eur;
              return `<option value="${idx}">${displayLabel} - ${price}</option>`;
            }).join("")}
          `;
        } else {
          wrapper.style.display = "none";
          select.removeAttribute("required");
          select.innerHTML = "";
        }
      }

      const summary = document.getElementById("quick-order-product-summary");
      if (summary) {
        const img = this.currentProduct.images[0] || 'assets/logo.webp';
        const defaultPrice = hasVariants ? this.currentProduct.variants[0]?.priceEur || 0 : this.currentProduct.priceEur || 0;
        const priceText = formatPrice(defaultPrice).eur;
        summary.innerHTML = `
          <img src="${img}" alt="${this.currentProduct.name} - бърза поръчка" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div>
            <strong style="display: block; font-weight: 700; color: #0f172a; font-size: 0.95rem;">${this.currentProduct.name}</strong>
            <span style="font-size: 0.85rem; color: #ea580c; font-weight: 700;" id="quick-order-price-display">Цена: ${priceText} / ${this.currentProduct.unit || 'м'}</span>
          </div>
        `;
      }
    }
  },

  handleQuickOrderVariantChange() {
    const select = document.getElementById("quick-order-variant-select");
    const priceDisplay = document.getElementById("quick-order-price-display");
    if (select && priceDisplay && this.currentProduct) {
      const idx = select.value;
      if (idx !== "") {
        const variant = this.currentProduct.variants[parseInt(idx)];
        if (variant) {
          const priceText = formatPrice(variant.priceEur).eur;
          priceDisplay.textContent = `Цена: ${priceText} / ${this.currentProduct.unit || 'м'}`;
        }
      } else {
        const hasVariants = this.currentProduct.variants && this.currentProduct.variants.length > 0;
        const defaultPrice = hasVariants ? this.currentProduct.variants[0]?.priceEur || 0 : this.currentProduct.priceEur || 0;
        const priceText = formatPrice(defaultPrice).eur;
        priceDisplay.textContent = `Цена: ${priceText} / ${this.currentProduct.unit || 'м'}`;
      }
    }
  },

  closeQuickOrderModal() {
    const modal = document.getElementById("quick-order-modal");
    if (modal) {
      modal.classList.remove("open");
      document.body.classList.remove("no-scroll");
    }
  },

  async submitQuickOrder(event) {
    event.preventDefault();
    const name = document.getElementById("quick-order-name").value.trim();
    const phone = document.getElementById("quick-order-phone").value.trim();
    if (!name || !phone || !this.currentProduct) return;

    const select = document.getElementById("quick-order-variant-select");
    let priceEur = 0;
    let variantCode = "";
    let variantName = "";
    
    const hasVariants = this.currentProduct.variants && this.currentProduct.variants.length > 0;
    if (hasVariants) {
      if (!select || select.value === "") {
        alert("Моля, изберете размер / вариант за бърза поръчка!");
        if (select) select.focus();
        return;
      }
      const idx = parseInt(select.value);
      const selectedVariant = this.currentProduct.variants[idx];
      if (!selectedVariant) return;

      priceEur = parseFloat(selectedVariant.priceEur) || 0;
      variantCode = this.getVariantCode(this.currentProduct, selectedVariant, idx);
      const diameter = selectedVariant.innerDb !== undefined && selectedVariant.innerDb !== "" ? `ø ${selectedVariant.innerDb}мм` : variantCode;
      const inch = selectedVariant.inch ? ` (${selectedVariant.inch})` : "";
      variantName = `Размер: ${diameter}${inch}`;
    } else {
      priceEur = parseFloat(this.currentProduct.priceEur) || 0;
      variantCode = this.currentProduct.code || this.currentProduct.id;
      variantName = "";
    }

    const orderNumber = "HL-Q-" + Math.floor(100000 + Math.random() * 900000);
    const totals = { eur: priceEur };
    const orderedItems = [{
      id: this.currentProduct.id,
      name: this.currentProduct.name,
      priceEur: priceEur,
      quantity: 1,
      variantCode: variantCode,
      variantName: variantName
    }];

    const order = {
      orderNumber,
      customer: { name, phone, email: "" },
      items: orderedItems,
      totals,
      delivery: "quick_order",
      address: "",
      notes: "БЪРЗА ПОРЪЧКА ОТ СТРАНИЦА НА ПРОДУКТ",
      clientType: "b2c",
      b2bDetails: null,
      status: "new",
      createdAt: Date.now()
    };

    try {
      if (typeof HydroluxBackend !== "undefined") {
        await HydroluxBackend.saveOrder(order);
      }
    } catch (err) {
      console.warn("Quick order Convex save failed", err);
      const pendingOrders = JSON.parse(localStorage.getItem("hydrolux_pending_orders") || "[]");
      pendingOrders.push(order);
      localStorage.setItem("hydrolux_pending_orders", JSON.stringify(pendingOrders));
    }

    this.closeQuickOrderModal();
    document.getElementById("quick-order-name").value = "";
    document.getElementById("quick-order-phone").value = "";
    if (select) select.value = "";
    Cart.showToast("Благодарим Ви! Поръчката е изпратена успешно.");
  },

  slideCategories(direction) {
    const track = document.getElementById("home-categories-carousel");
    if (!track) return;
    const scrollAmount = track.clientWidth * 0.75;
    track.scrollBy({
      left: direction * scrollAmount,
      behavior: 'smooth'
    });
  },

  toggleMobileFilters() {
    const sidebar = document.querySelector(".popular-sidebar");
    const btn = document.getElementById("mobile-filter-toggle-btn");
    if (sidebar) {
      sidebar.classList.toggle("open");
      const isOpen = sidebar.classList.contains("open");
      if (btn) {
        btn.querySelector("span").textContent = isOpen ? "Скрий Филтри" : "Покажи Филтри";
      }
    }
  },

  addToCartFromDetails() {
    const product = this.currentProduct;
    if (!product) return;

    if (product.variants && product.variants.length > 0) {
      if (product.variants.length === 1) {
        const variant = product.variants[0];
        const variantCode = this.getVariantCode(product, variant, 0);
        Cart.addItem(product, variantCode, 1);
        Cart.openDrawer();
      } else {
        const panel = document.querySelector(".variants-panel");
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth" });
          panel.classList.add("pulse-highlight");
          setTimeout(() => panel.classList.remove("pulse-highlight"), 1000);
          
          if (typeof Cart !== "undefined" && Cart.showToast) {
            Cart.showToast("Моля, изберете размер и количество от таблицата по-долу.");
          }
        }
      }
    } else {
      Cart.addItem(product, "CUSTOM-SPEC", 1);
      Cart.openDrawer();
    }
  },

  getProductSchema(product) {
    const prices = product.variants.map(v => v.priceEur);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const hasMultiplePrices = prices.length > 1;

    let offers = {};
    if (hasMultiplePrices) {
      offers = {
        "@type": "AggregateOffer",
        "priceCurrency": "EUR",
        "lowPrice": minPrice.toFixed(2),
        "highPrice": maxPrice.toFixed(2),
        "offerCount": product.variants.length,
        "availability": product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "priceSpecification": product.variants.map(v => ({
          "@type": "UnitPriceSpecification",
          "price": v.priceEur.toFixed(2),
          "priceCurrency": "EUR",
          "referenceQuantity": {
            "@type": "QuantitativeValue",
            "value": "1",
            "unitCode": product.unit === "м" ? "MTR" : "C62"
          }
        }))
      };
    } else {
      offers = {
        "@type": "Offer",
        "price": minPrice.toFixed(2),
        "priceCurrency": "EUR",
        "availability": product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": minPrice.toFixed(2),
          "priceCurrency": "EUR",
          "referenceQuantity": {
            "@type": "QuantitativeValue",
            "value": "1",
            "unitCode": product.unit === "м" ? "MTR" : "C62"
          }
        }
      };
    }

    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "image": product.images.map(img => img.startsWith("http") ? img : `https://hydrolux.bg/${img}`),
      "description": product.description,
      "sku": product.code,
      "brand": {
        "@type": "Brand",
        "name": product.brand
      },
      "offers": offers
    };
  }
};
