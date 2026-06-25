// Hose Configurator Component (Euro € Optimized)
const HoseBuilder = {
  options: null,

  init() {
    this.options = CONFIG.builderOptions;
    if (!this.options || 
        !Array.isArray(this.options.hoseTypes) || this.options.hoseTypes.length === 0 ||
        !Array.isArray(this.options.sizes) || this.options.sizes.length === 0 ||
        !Array.isArray(this.options.fittings) || this.options.fittings.length === 0 ||
        !Array.isArray(this.options.sleeves) || this.options.sleeves.length === 0) {
      this.options = this.getDefaultOptions();
    }

    // Ensure state matches available options
    if (this.options.hoseTypes && this.options.hoseTypes.length > 0 && !this.options.hoseTypes.some(h => h.id === this.state.hoseTypeId)) {
      this.state.hoseTypeId = this.options.hoseTypes[0].id;
    }
    if (this.options.sizes && this.options.sizes.length > 0 && !this.options.sizes.some(s => s.id === this.state.sizeId)) {
      this.state.sizeId = this.options.sizes[0].id;
    }
    if (this.options.fittings && this.options.fittings.length > 0 && !this.options.fittings.some(f => f.id === this.state.fittingLeftId)) {
      this.state.fittingLeftId = this.options.fittings[0].id;
    }
    if (this.options.fittings && this.options.fittings.length > 0 && !this.options.fittings.some(f => f.id === this.state.fittingRightId)) {
      this.state.fittingRightId = this.options.fittings[0].id;
    }
    if (this.options.sleeves && this.options.sleeves.length > 0 && !this.options.sleeves.some(sl => sl.id === this.state.sleeveId)) {
      this.state.sleeveId = this.options.sleeves[0].id;
    }
  },

  getDefaultOptions() {
    return {
      hoseTypes: [
        { id: "hp-2sn", name: "Хидравличен маркуч 2SN (Двуоплетен)", basePriceEurPerMeter: 3.50, pressures: { "1/4\"": 400, "3/8\"": 330, "1/2\"": 275, "3/4\"": 215, "1\"": 165 } },
        { id: "hp-1sn", name: "Хидравличен маркуч 1SN (Еднооплетен)", basePriceEurPerMeter: 2.70, pressures: { "1/4\"": 225, "3/8\"": 180, "1/2\"": 160, "3/4\"": 105, "1\"": 88 } },
        { id: "hp-thermo", name: "Термопластичен маркуч R7", basePriceEurPerMeter: 4.20, pressures: { "1/4\"": 210, "3/8\"": 190, "1/2\"": 140, "3/4\"": 112, "1\"": 70 } }
      ],
      sizes: [
        { id: "1/4", name: "1/4\" (DN06)", factor: 1.0 },
        { id: "3/8", name: "3/8\" (DN10)", factor: 1.25 },
        { id: "1/2", name: "1/2\" (DN13)", factor: 1.5 },
        { id: "3/4", name: "3/4\" (DN19)", factor: 2.1 },
        { id: "1", name: "1\" (DN25)", factor: 3.0 }
      ],
      fittings: [
        { id: "none", name: "Без накрайник (прав срез)", prices: { "1/4": 0.0, "3/8": 0.0, "1/2": 0.0, "3/4": 0.0, "1": 0.0 }, icon: "➖", category: "Без накрайник", angle: "none" },
        { id: "dkol-straight", name: "DKOL Метричен прав (DKO-L)", prices: { "1/4": 3.20, "3/8": 3.60, "1/2": 4.20, "3/4": 5.50, "1": 7.50 }, icon: "➡️", category: "DKOL Метрични", angle: "straight" },
        { id: "dkol-90", name: "DKOL Метричен 90° коляно", prices: { "1/4": 5.80, "3/8": 6.50, "1/2": 7.50, "3/4": 9.80, "1": 13.50 }, icon: "↳", category: "DKOL Метрични", angle: "90" },
        { id: "dkol-45", name: "DKOL Метричен 45° коляно", prices: { "1/4": 6.20, "3/8": 6.90, "1/2": 7.90, "3/4": 10.50, "1": 14.20 }, icon: "↗️", category: "DKOL Метрични", angle: "45" },
        { id: "bsp-straight", name: "BSP Прав с вътрешна резба", prices: { "1/4": 3.40, "3/8": 3.80, "1/2": 4.40, "3/4": 5.80, "1": 7.90 }, icon: "➡️", category: "BSP Инчови", angle: "straight" },
        { id: "bsp-90", name: "BSP 90° коляно с вътрешна резба", prices: { "1/4": 6.00, "3/8": 6.70, "1/2": 7.75, "3/4": 10.20, "1": 14.00 }, icon: "↳", category: "BSP Инчови", angle: "90" },
        { id: "jic-straight", name: "JIC Прав с инчова резба (37° UNF)", prices: { "1/4": 3.60, "3/8": 4.10, "1/2": 4.80, "3/4": 6.20, "1": 8.50 }, icon: "➡️", category: "JIC Инчови", angle: "straight" }
      ],
      sleeves: [
        { id: "none", name: "Без предпазен ръкав", priceEurPerMeter: 0.0 },
        { id: "plastic-spiral", name: "Предпазна пластмасова спирала (жълта)", priceEurPerMeter: 1.20 },
        { id: "textile-sleeve", name: "Текстилен предпазен шлаух (черен)", priceEurPerMeter: 1.50 },
        { id: "metal-spiral", name: "Стоманена предпазна пружина", priceEurPerMeter: 2.80 }
      ]
    };
  },

  state: {
    hoseTypeId: "hp-2sn",
    sizeId: "3/8",
    fittingLeftId: "dkol-straight",
    fittingRightId: "dkol-straight",
    sleeveId: "none",
    lengthMeters: 1.5
  },

  calculatePrice() {
    if (!this.options) this.init();
    const hose = this.options.hoseTypes.find(h => h.id === this.state.hoseTypeId);
    const size = this.options.sizes.find(s => s.id === this.state.sizeId);
    const fitL = this.options.fittings.find(f => f.id === this.state.fittingLeftId);
    const fitR = this.options.fittings.find(f => f.id === this.state.fittingRightId);
    const sleeve = this.options.sleeves.find(sl => sl.id === this.state.sleeveId);

    if (!hose || !size || !fitL || !fitR || !sleeve) return { eur: 0 };

    const baseHosePrice = hose.basePriceEurPerMeter * size.factor;
    const hoseCost = baseHosePrice * this.state.lengthMeters;
    const sleeveCost = sleeve.priceEurPerMeter * this.state.lengthMeters * size.factor;
    
    const getFittingPrice = (fit, sizeId) => {
      if (!fit) return 0;
      if (fit.prices && fit.prices[sizeId] !== undefined) {
        return parseFloat(fit.prices[sizeId]) || 0;
      }
      return parseFloat(fit.priceEur) || 0;
    };
    const fittingsCost = getFittingPrice(fitL, size.id) + getFittingPrice(fitR, size.id);

    const totalEur = hoseCost + sleeveCost + fittingsCost;

    return {
      eur: totalEur,
      details: {
        hoseCost,
        sleeveCost,
        fittingsCost
      }
    };
  },

  set(key, value) {
    if (key === "lengthMeters") {
      this.state[key] = Math.max(0.1, parseFloat(value) || 1.0);
    } else {
      this.state[key] = value;
    }

    if (key === "sizeId") {
      this.validateFittingsCompatibility();
    }

    this.render();
  },

  validateFittingsCompatibility() {
    const activeSizeId = this.state.sizeId;
    const fittings = this.options.fittings || [];
    const compatible = fittings.filter(f => 
      f.prices && f.prices[activeSizeId] !== undefined && f.prices[activeSizeId] !== null && f.prices[activeSizeId] !== ""
    );
    if (compatible.length > 0) {
      const fitL = fittings.find(f => f.id === this.state.fittingLeftId);
      const isLeftCompatible = fitL && fitL.prices && fitL.prices[activeSizeId] !== undefined && fitL.prices[activeSizeId] !== null && fitL.prices[activeSizeId] !== "";
      if (!isLeftCompatible) {
        this.state.fittingLeftId = compatible[0].id;
      }
      
      const fitR = fittings.find(f => f.id === this.state.fittingRightId);
      const isRightCompatible = fitR && fitR.prices && fitR.prices[activeSizeId] !== undefined && fitR.prices[activeSizeId] !== null && fitR.prices[activeSizeId] !== "";
      if (!isRightCompatible) {
        this.state.fittingRightId = compatible[0].id;
      }
    }
  },

  getAngleLabel(angle) {
    switch (angle) {
      case "straight": return "Прав ➡️";
      case "45": return "Коляно 45° ↗️";
      case "90": return "Коляно 90° ↳";
      case "none": return "Без ➖";
      default: return angle;
    }
  },

  render() {
    this.init();
    const container = document.getElementById("hose-builder-container");
    if (!container) return;

    const price = this.calculatePrice();
    const hose = this.options.hoseTypes.find(h => h.id === this.state.hoseTypeId);
    const size = this.options.sizes.find(s => s.id === this.state.sizeId);

    const activeSizeId = this.state.sizeId;
    const fittings = this.options.fittings || [];

    // Filter fittings compatible with current size (must have a valid price defined)
    const compatibleFittings = fittings.filter(f => 
      f.prices && f.prices[activeSizeId] !== undefined && f.prices[activeSizeId] !== null && f.prices[activeSizeId] !== ""
    );

    const fitL = fittings.find(f => f.id === this.state.fittingLeftId) || compatibleFittings[0] || fittings[0];
    const fitR = fittings.find(f => f.id === this.state.fittingRightId) || compatibleFittings[0] || fittings[0];

    // Left Fitting resolution
    const leftCategories = [...new Set(compatibleFittings.map(f => f.category || "Други"))];
    let currentLeftCategory = fitL ? (fitL.category || "Други") : (leftCategories[0] || "Други");
    if (!leftCategories.includes(currentLeftCategory) && leftCategories.length > 0) {
      currentLeftCategory = leftCategories[0];
    }

    const leftModels = [...new Set(compatibleFittings.filter(f => (f.category || "Други") === currentLeftCategory).map(f => f.name))];
    let currentLeftModel = fitL ? fitL.name : (leftModels[0] || "");
    if (!leftModels.includes(currentLeftModel) && leftModels.length > 0) {
      currentLeftModel = leftModels[0];
    }

    const leftAngles = compatibleFittings.filter(f => (f.category || "Други") === currentLeftCategory && f.name === currentLeftModel);

    // Right Fitting resolution
    const rightCategories = [...new Set(compatibleFittings.map(f => f.category || "Други"))];
    let currentRightCategory = fitR ? (fitR.category || "Други") : (rightCategories[0] || "Други");
    if (!rightCategories.includes(currentRightCategory) && rightCategories.length > 0) {
      currentRightCategory = rightCategories[0];
    }

    const rightModels = [...new Set(compatibleFittings.filter(f => (f.category || "Други") === currentRightCategory).map(f => f.name))];
    let currentRightModel = fitR ? fitR.name : (rightModels[0] || "");
    if (!rightModels.includes(currentRightModel) && rightModels.length > 0) {
      currentRightModel = rightModels[0];
    }

    const rightAngles = compatibleFittings.filter(f => (f.category || "Други") === currentRightCategory && f.name === currentRightModel);

    container.innerHTML = `
      <div class="builder-layout">
        
        <!-- Left Column: Realistic 3D Cutaway Diagram with pointer labels -->
        <div class="builder-graphic-column">
          <div class="hose-cutaway-container">
            <img src="assets/hose_cutaway.webp" alt="Схема на сряз на хидравличен маркуч за конфигуратор" class="hose-cutaway-img" width="400" height="250" loading="lazy">
          </div>
        </div>

        <!-- Right Column: Parameters, specs, selectors & CTA buttons -->
        <div class="builder-specs-column">
          <h2 class="config-title">${hose.name}</h2>
          
          <!-- Parameters Specs Table -->
          <div class="specs-table-container">
            <table class="specs-data-table">
              <thead>
                <tr>
                  <th>Параметри</th>
                  ${this.options.sizes.map(s => `
                    <th class="${this.state.sizeId === s.id ? 'active-spec-col' : ''}" style="${this.state.sizeId === s.id ? 'background-color: rgba(0, 187, 255, 0.3); color: #ffffff;' : ''}">
                      ${s.name.split(" ")[0]}
                    </th>
                  `).join("")}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Коефициент</td>
                  ${this.options.sizes.map(s => `
                    <td style="${this.state.sizeId === s.id ? 'background-color: rgba(0, 187, 255, 0.1); font-weight: bold;' : ''}">
                      x${s.factor.toFixed(2)}
                    </td>
                  `).join("")}
                </tr>
                <tr>
                  <td>Работно налягане</td>
                  ${this.options.sizes.map(s => {
                    const press = hose.pressures[s.name.split(" ")[0]] || "N/A";
                    return `
                      <td style="${this.state.sizeId === s.id ? 'background-color: rgba(0, 187, 255, 0.1); font-weight: bold; color: #2be885;' : ''}">
                        ${press} Bar
                      </td>
                    `;
                  }).join("")}
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Configuration Selectors Dropdowns Grid -->
          <div class="config-selectors-grid">
            <div class="form-group">
              <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">1. Тип маркуч</label>
              <select class="form-control config-select" onchange="HoseBuilder.set('hoseTypeId', this.value)">
                ${this.options.hoseTypes.map(h => `
                  <option value="${h.id}" ${this.state.hoseTypeId === h.id ? 'selected' : ''}>
                    ${h.name}
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="form-group">
              <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">2. Диаметър (DN)</label>
              <select class="form-control config-select" onchange="HoseBuilder.set('sizeId', this.value)">
                ${this.options.sizes.map(s => `
                  <option value="${s.id}" ${this.state.sizeId === s.id ? 'selected' : ''}>
                    ${s.name}
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="form-group">
              <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">3. Дължина (м)</label>
              <select class="form-control config-select" onchange="HoseBuilder.set('lengthMeters', this.value)">
                <option value="0.5" ${this.state.lengthMeters === 0.5 ? 'selected' : ''}>0.5 м</option>
                <option value="1.0" ${this.state.lengthMeters === 1.0 ? 'selected' : ''}>1.0 м</option>
                <option value="1.5" ${this.state.lengthMeters === 1.5 ? 'selected' : ''}>1.5 м</option>
                <option value="2.0" ${this.state.lengthMeters === 2.0 ? 'selected' : ''}>2.0 м</option>
                <option value="3.0" ${this.state.lengthMeters === 3.0 ? 'selected' : ''}>3.0 м</option>
                <option value="5.0" ${this.state.lengthMeters === 5.0 ? 'selected' : ''}>5.0 м</option>
                <option value="10.0" ${this.state.lengthMeters === 10.0 ? 'selected' : ''}>10.0 м</option>
              </select>
            </div>

            <!-- 4. Ляв накрайник (Група + Резба + Форма) -->
            <div class="form-group" style="grid-column: span 2; display: grid; grid-template-columns: 1fr 1.1fr 0.9fr; gap: 10px; margin-bottom: 0;">
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">4а. Гр. накрайник (Ляв)</label>
                <select class="form-control config-select" onchange="HoseBuilder.changeFittingCategory('Left', this.value)">
                  ${leftCategories.map(cat => `
                    <option value="${cat.replace(/"/g, '&quot;')}" ${currentLeftCategory === cat ? 'selected' : ''}>
                      ${cat}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">4б. Резба/Модел (Ляв)</label>
                <select class="form-control config-select" onchange="HoseBuilder.changeFittingModel('Left', this.value)">
                  ${leftModels.map(m => `
                    <option value="${m.replace(/"/g, '&quot;')}" ${currentLeftModel === m ? 'selected' : ''}>
                      ${m}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">4в. Форма/Ъгъл (Ляв)</label>
                <select class="form-control config-select" onchange="HoseBuilder.set('fittingLeftId', this.value)">
                  ${leftAngles.map(f => {
                    const priceVal = f.prices[activeSizeId];
                    const priceText = priceVal > 0 ? ` (+${priceVal.toFixed(2)} лв.)` : " (Без оскъпяване)";
                    return `
                      <option value="${f.id}" ${this.state.fittingLeftId === f.id ? 'selected' : ''}>
                        ${this.getAngleLabel(f.angle)}${priceText}
                      </option>
                    `;
                  }).join("")}
                </select>
              </div>
            </div>

            <!-- 5. Десен накрайник (Група + Резба + Форма) -->
            <div class="form-group" style="grid-column: span 2; display: grid; grid-template-columns: 1fr 1.1fr 0.9fr; gap: 10px; margin-bottom: 0;">
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">5а. Гр. накрайник (Десен)</label>
                <select class="form-control config-select" onchange="HoseBuilder.changeFittingCategory('Right', this.value)">
                  ${rightCategories.map(cat => `
                    <option value="${cat.replace(/"/g, '&quot;')}" ${currentRightCategory === cat ? 'selected' : ''}>
                      ${cat}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">5б. Резба/Модел (Десен)</label>
                <select class="form-control config-select" onchange="HoseBuilder.changeFittingModel('Right', this.value)">
                  ${rightModels.map(m => `
                    <option value="${m.replace(/"/g, '&quot;')}" ${currentRightModel === m ? 'selected' : ''}>
                      ${m}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">5в. Форма/Ъгъл (Десен)</label>
                <select class="form-control config-select" onchange="HoseBuilder.set('fittingRightId', this.value)">
                  ${rightAngles.map(f => {
                    const priceVal = f.prices[activeSizeId];
                    const priceText = priceVal > 0 ? ` (+${priceVal.toFixed(2)} лв.)` : " (Без оскъпяване)";
                    return `
                      <option value="${f.id}" ${this.state.fittingRightId === f.id ? 'selected' : ''}>
                        ${this.getAngleLabel(f.angle)}${priceText}
                      </option>
                    `;
                  }).join("")}
                </select>
              </div>
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label class="form-group label" style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-bottom: 5px; display: block;">6. Допълнителен ръкав</label>
              <select class="form-control config-select" onchange="HoseBuilder.set('sleeveId', this.value)">
                ${this.options.sleeves.map(sl => `
                  <option value="${sl.id}" ${this.state.sleeveId === sl.id ? 'selected' : ''}>
                    ${sl.name}
                  </option>
                `).join("")}
              </select>
            </div>
          </div>

          <!-- Inquiry CTA button -->
          <div class="config-actions-row" style="margin-top: 15px;">
            <button class="btn btn-config-cyan" onclick="HoseBuilder.openInquiryModal()" style="width: 100%; text-transform: uppercase;">
              Изпрати запитване
            </button>
          </div>

          <div class="pricing-summary-bar font-small text-muted mt-20" style="border-top: 1px solid rgba(0, 187, 255, 0.15); padding-top: 15px;">
            <span>Спецификация: ${size.name} маркуч, прогнозна цена: <strong style="color: #00bbff; font-size: 1.1rem;">${price.eur.toFixed(2)} лв.</strong> с ДДС.</span>
          </div>
        </div>

      </div>
    `;
  },

  adjustLength(diff) {
    this.set("lengthMeters", (this.state.lengthMeters + diff).toFixed(1));
  },

  changeFittingCategory(side, categoryName) {
    const activeSizeId = this.state.sizeId;
    const compatible = (this.options.fittings || []).filter(f => 
      (f.category || "Други") === categoryName && 
      f.prices && f.prices[activeSizeId] !== undefined && f.prices[activeSizeId] !== null && f.prices[activeSizeId] !== ""
    );
    if (compatible.length > 0) {
      const firstModelName = compatible[0].name;
      const match = compatible.find(f => f.name === firstModelName);
      if (match) {
        this.set(side === 'Left' ? 'fittingLeftId' : 'fittingRightId', match.id);
      }
    }
  },

  changeFittingModel(side, modelName) {
    const activeSizeId = this.state.sizeId;
    const fit = this.options.fittings.find(f => f.id === (side === 'Left' ? this.state.fittingLeftId : this.state.fittingRightId));
    const currentCategory = fit ? (fit.category || "Други") : "";
    const match = (this.options.fittings || []).find(f => 
      (f.category || "Други") === currentCategory && 
      f.name === modelName && 
      f.prices && f.prices[activeSizeId] !== undefined && f.prices[activeSizeId] !== null && f.prices[activeSizeId] !== ""
    );
    if (match) {
      this.set(side === 'Left' ? 'fittingLeftId' : 'fittingRightId', match.id);
    }
  },

  addToCart() {
    const hose = this.options.hoseTypes.find(h => h.id === this.state.hoseTypeId);
    const size = this.options.sizes.find(s => s.id === this.state.sizeId);
    const fitL = this.options.fittings.find(f => f.id === this.state.fittingLeftId);
    const fitR = this.options.fittings.find(f => f.id === this.state.fittingRightId);
    const sleeve = this.options.sleeves.find(sl => sl.id === this.state.sleeveId);
    const price = this.calculatePrice();

    const customProduct = {
      id: `custom-hose-${Date.now()}`,
      name: "Персонализиран маркуч",
      isCustomHose: true,
      priceEur: price.eur,
      specsSummary: {
        hoseType: hose.name,
        size: size.name,
        fittingL: `${fitL.name} (${this.getAngleLabel(fitL.angle)})`,
        fittingR: `${fitR.name} (${this.getAngleLabel(fitR.angle)})`,
        sleeve: sleeve.name
      }
    };

    Cart.addItem(customProduct, "CUSTOM-SPEC", 1);
    Cart.openDrawer();
  },

  openQuickInquiryForm() {
    const hose = this.options.hoseTypes.find(h => h.id === this.state.hoseTypeId);
    const size = this.options.sizes.find(s => s.id === this.state.sizeId);
    const fitL = this.options.fittings.find(f => f.id === this.state.fittingLeftId);
    const fitR = this.options.fittings.find(f => f.id === this.state.fittingRightId);
    const sleeve = this.options.sleeves.find(sl => sl.id === this.state.sleeveId);
    const price = this.calculatePrice();

    const specText = `Здравейте, желая да направя запитване за следната сглобка:
- Тип маркуч: ${hose.name}
- Диаметър: ${size.name}
- Дължина: ${this.state.lengthMeters} метра
- Ляв накрайник: ${fitL.name} (${this.getAngleLabel(fitL.angle)})
- Десен накрайник: ${fitR.name} (${this.getAngleLabel(fitR.angle)})
- Предпазен ръкав: ${sleeve.name}
- Прогнозна цена: ${price.eur.toFixed(2)} лв.`;

    // Navigate to services/contacts SPA view
    App.navigate("services");

    // Wait a brief moment for DOM to mount and pre-fill the textarea
    setTimeout(() => {
      const textarea = document.querySelector("#services-view textarea");
      if (textarea) {
        textarea.value = specText;
        textarea.focus();
        // Scroll into view smoothly
        textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  },

  openInquiryModal() {
    const modal = document.getElementById("builder-inquiry-modal");
    if (!modal) return;
    
    const hose = this.options.hoseTypes.find(h => h.id === this.state.hoseTypeId);
    const size = this.options.sizes.find(s => s.id === this.state.sizeId);
    const fitL = this.options.fittings.find(f => f.id === this.state.fittingLeftId);
    const fitR = this.options.fittings.find(f => f.id === this.state.fittingRightId);
    const sleeve = this.options.sleeves.find(sl => sl.id === this.state.sleeveId);
    const price = this.calculatePrice();

    const summaryHtml = `
      <strong>Спецификация на маркуча:</strong><br>
      • <strong>Тип:</strong> ${hose.name}<br>
      • <strong>Диаметър:</strong> ${size.name}<br>
      • <strong>Дължина:</strong> ${this.state.lengthMeters} м<br>
      • <strong>Ляв накрайник:</strong> ${fitL.name} (${this.getAngleLabel(fitL.angle)})<br>
      • <strong>Десен накрайник:</strong> ${fitR.name} (${this.getAngleLabel(fitR.angle)})<br>
      • <strong>Предпазен ръкав:</strong> ${sleeve.name}<br>
      • <strong>Прогнозна цена:</strong> ${price.eur.toFixed(2)} лв. с ДДС
    `;
    
    document.getElementById("builder-inquiry-summary").innerHTML = summaryHtml;
    modal.classList.add("open");
    document.body.classList.add("no-scroll");
  },

  closeInquiryModal() {
    const modal = document.getElementById("builder-inquiry-modal");
    if (modal) {
      modal.classList.remove("open");
      document.body.classList.remove("no-scroll");
    }
  },

  async submitInquiry(event) {
    event.preventDefault();
    
    const name = document.getElementById("builder-inquiry-name").value.trim();
    const phone = document.getElementById("builder-inquiry-phone").value.trim();
    const email = document.getElementById("builder-inquiry-email").value.trim();
    const userMessage = document.getElementById("builder-inquiry-message").value.trim();
    const specsSummary = document.getElementById("builder-inquiry-summary").innerText;
    
    const payload = {
      type: "builder",
      name,
      phone,
      email,
      message: userMessage,
      subject: "Сглобяване на маркуч (Конфигуратор)",
      details: specsSummary
    };
    
    // Clear inputs
    document.getElementById("builder-inquiry-name").value = "";
    document.getElementById("builder-inquiry-phone").value = "";
    document.getElementById("builder-inquiry-email").value = "";
    document.getElementById("builder-inquiry-message").value = "";
    
    this.closeInquiryModal();
    
    try {
      if (typeof HydroluxBackend !== "undefined") {
        await HydroluxBackend.submitInquiry(payload);
      }
      Cart.showToast("Благодарим Ви! Запитването за сглобен маркуч е изпратено.");
    } catch (err) {
      console.error("Failed to submit builder inquiry:", err);
      Cart.showToast("Възникна грешка при изпращането. Моля, опитайте пак.");
    }
  }
};
