// Банер за промоция (напр. Черен петък) най-горе на сайта.
// Данните идват от /api/promo/banner — включва се/изключва се от админ панела
// (Промо кодове → „Показвай банер на сайта"). Последният отговор се пази в
// localStorage, за да се рисува веднага при следващо зареждане (без скок на страницата).
const PromoBanner = {
  cacheKey: "hydrolux_promo_banner",
  dismissKey: "hydrolux_promo_banner_closed",

  init() {
    // 1) веднага от кеша
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(this.cacheKey) || "null"); } catch (e) { cached = null; }
    if (cached) this.render(cached);

    // 2) обновяване от сървъра
    if (typeof HydroluxBackend === "undefined") return;
    HydroluxBackend.getPromoBanner()
      .then((res) => {
        const banner = res && res.ok ? res.banner : null;
        try {
          if (banner) localStorage.setItem(this.cacheKey, JSON.stringify(banner));
          else localStorage.removeItem(this.cacheKey);
        } catch (e) { /* private mode */ }
        if (banner) this.render(banner);
        else this.remove();
      })
      .catch(() => { /* без банер при грешка */ });
  },

  isDismissed(code) {
    try { return sessionStorage.getItem(this.dismissKey) === code; } catch (e) { return false; }
  },

  remove() {
    const el = document.getElementById("promo-banner");
    if (el) el.remove();
  },

  render(banner) {
    if (!banner || !banner.code || this.isDismissed(banner.code)) {
      this.remove();
      return;
    }
    // Изтекла промоция от кеша — не я показваме
    if (banner.expiresAt && Date.now() > banner.expiresAt) {
      this.remove();
      return;
    }

    const code = String(banner.code).replace(/[^A-Za-z0-9_-]/g, "");
    const percent = Number(banner.percent) || 0;
    const text = banner.text && banner.text.trim()
      ? banner.text.trim()
      : `Отстъпка -${percent}% на всички продукти`;

    let el = document.getElementById("promo-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "promo-banner";
      el.className = "sale-bar";
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", "Промоция");
      document.body.insertBefore(el, document.body.firstChild);
    }

    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "sale-bar-inner";

    const label = document.createElement("span");
    label.className = "sale-bar-text";
    label.textContent = "🔥 " + text;

    const codeBtn = document.createElement("button");
    codeBtn.type = "button";
    codeBtn.className = "sale-bar-code";
    codeBtn.title = "Натиснете, за да добавите кода към поръчката си";
    codeBtn.textContent = `Код: ${code}`;
    codeBtn.addEventListener("click", () => this.activate(code, percent));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "sale-bar-close";
    close.setAttribute("aria-label", "Затвори");
    close.textContent = "×";
    close.addEventListener("click", () => {
      try { sessionStorage.setItem(this.dismissKey, code); } catch (e) { /* ignore */ }
      this.remove();
    });

    inner.append(label, codeBtn, close);
    el.appendChild(inner);
  },

  // Клик по кода: запазва го в количката и го копира. Сървърът така или иначе
  // проверява кода (и процента) при финализиране на поръчката.
  activate(code, percent) {
    if (typeof Cart !== "undefined" && Cart.setPromo) {
      Cart.setPromo({ code, percent });
      if (Cart.updateCartBadge) Cart.updateCartBadge();
      if (Cart.renderDrawer) Cart.renderDrawer();
      if (typeof App !== "undefined" && App.currentView === "checkout" && Cart.renderCheckoutSummary) {
        Cart.renderCheckoutSummary();
      }
      if (Cart.showToast) Cart.showToast(`Код ${code} (-${percent}%) е добавен към поръчката`);
    }
    try { navigator.clipboard && navigator.clipboard.writeText(code); } catch (e) { /* ignore */ }
  },
};

document.addEventListener("DOMContentLoaded", () => PromoBanner.init());
