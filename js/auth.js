// Hydrolux Premium Store - Authentication & User Profile Controller
const Auth = {
  currentUser: null,
  googleClientId: "319386067027-lvi2v05qt8sca7ppr3s8ukqk8oak530q.apps.googleusercontent.com",

  // Escapes untrusted strings before they are inserted into innerHTML, to
  // prevent stored XSS via order data that originates from public submissions.
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  init() {
    this.loadSession();
    this.initGoogleClient();
    this.injectStyles();
  },

  loadSession() {
    const session = localStorage.getItem("hydrolux_user");
    if (session) {
      try {
        this.currentUser = JSON.parse(session);
        this.updateHeaderUI();
      } catch (e) {
        localStorage.removeItem("hydrolux_user");
      }
    }
  },

  initGoogleClient() {
    // If real Google Client ID is configured, initialize the GIS SDK
    if (this.googleClientId && this.googleClientId !== "YOUR_GOOGLE_CLIENT_ID") {
      const initializeSDK = () => {
        if (typeof google !== "undefined" && google.accounts && google.accounts.id) {
          try {
            google.accounts.id.initialize({
              client_id: this.googleClientId,
              callback: this.handleGoogleCredentialResponse.bind(this)
            });
            console.log("Google GIS initialized successfully.");
            return true;
          } catch (e) {
            console.error("Error during Google GIS initialization:", e);
          }
        }
        return false;
      };

      // 1. Try immediately (in case SDK is already loaded)
      if (initializeSDK()) return;

      // 2. Try on window load event
      window.addEventListener("load", () => {
        initializeSDK();
      });

      // 3. Keep checking every 300ms up to 15 times (backup loop)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (initializeSDK() || attempts >= 15) {
          clearInterval(interval);
        }
      }, 300);
    }
  },

  setCurrentUser(user) {
    if (user) {
      this.currentUser = user;
      localStorage.setItem("hydrolux_user", JSON.stringify(user));
    } else {
      this.currentUser = null;
      localStorage.removeItem("hydrolux_user");
      // Clear the customer session token on logout.
      if (typeof HydroluxBackend !== "undefined" && HydroluxBackend.setUserToken) {
        HydroluxBackend.setUserToken(null);
      }
    }
    this.updateHeaderUI();

    // If currently on checkout page, re-render the summary to update the optional login prompt
    if (typeof Cart !== "undefined" && typeof App !== "undefined" && App.currentView === "checkout") {
      Cart.renderCheckoutSummary();
    }
  },

  updateHeaderUI() {
    const accountBtn = document.querySelector(".header-actions .header-action-btn:first-child");
    if (!accountBtn) return;

    if (this.currentUser) {
      // User is logged in - render profile dropdown trigger
      const nameShort = this.currentUser.name.split(" ")[0];
      const avatar = this.currentUser.avatarUrl 
        ? `<img src="${this.currentUser.avatarUrl}" class="auth-user-avatar" alt="Avatar">`
        : `<svg class="auth-user-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

      accountBtn.outerHTML = `
        <div class="auth-dropdown-wrapper">
          <button class="header-action-btn auth-logged-in-btn" onclick="Auth.toggleDropdown(event)" title="Управление на профила">
            <div class="header-action-icon-wrapper auth-avatar-wrapper">
              ${avatar}
            </div>
            <span class="header-action-label">${nameShort} ▾</span>
          </button>
          <div class="auth-dropdown-menu" id="auth-user-dropdown">
            <a onclick="Auth.showProfileModal(); Auth.closeDropdown()">👤 Моят профил</a>
            <div class="dropdown-divider"></div>
            <a onclick="Auth.logout(); Auth.closeDropdown()" class="dropdown-logout">🚪 Изход</a>
          </div>
        </div>
      `;
    } else {
      // User is logged out - render standard "Вход / Регистрация"
      const wrapper = document.querySelector(".auth-dropdown-wrapper");
      if (wrapper) {
        wrapper.outerHTML = `
          <button class="header-action-btn" onclick="Auth.showAuthModal()" title="Вход / Регистрация">
            <div class="header-action-icon-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <span class="header-action-label">Вход / Регистрация</span>
          </button>
        `;
      } else {
        accountBtn.onclick = () => Auth.showAuthModal();
      }
    }
  },

  toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById("auth-user-dropdown");
    if (!dropdown) return;
    dropdown.classList.toggle("show");
    
    // Close on clicking outside
    const closeListener = (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("show");
        document.removeEventListener("click", closeListener);
      }
    };
    document.addEventListener("click", closeListener);
  },

  closeDropdown() {
    const dropdown = document.getElementById("auth-user-dropdown");
    if (dropdown) dropdown.classList.remove("show");
  },

  logout() {
    this.setCurrentUser(null);
    Cart.showToast("Успешно излязохте от профила си!");
    setTimeout(() => window.location.reload(), 800);
  },

  showAuthModal(tab = "login") {
    // Remove existing modal if any
    this.closeAuthModal();

    const overlay = document.createElement("div");
    overlay.id = "auth-modal-overlay";
    overlay.className = "auth-modal-overlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeAuthModal();
    };

    overlay.innerHTML = `
      <div class="auth-modal-card">
        <button class="auth-modal-close" onclick="Auth.closeAuthModal()">×</button>
        
        <div class="auth-modal-tabs">
          <button class="auth-tab-btn ${tab === 'login' ? 'active' : ''}" onclick="Auth.switchTab('login')">Вход</button>
          <button class="auth-tab-btn ${tab === 'register' ? 'active' : ''}" onclick="Auth.switchTab('register')">Регистрация</button>
        </div>

        <!-- Login Panel -->
        <div id="auth-panel-login" class="auth-panel ${tab === 'login' ? 'show' : ''}">
          <form onsubmit="Auth.handleCustomLogin(event)">
            <div class="form-group">
              <label>Имейл адрес <span class="text-accent">*</span></label>
              <input type="email" id="login-email" class="form-control" placeholder="example@mail.com" required autocomplete="username">
            </div>
            <div class="form-group">
              <label>Парола <span class="text-accent">*</span></label>
              <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-accent auth-submit-btn">Влез в профила</button>
          </form>
        </div>

        <!-- Register Panel -->
        <div id="auth-panel-register" class="auth-panel ${tab === 'register' ? 'show' : ''}">
          <form onsubmit="Auth.handleCustomRegister(event)">
            <div class="form-group">
              <label>Вашето име <span class="text-accent">*</span></label>
              <input type="text" id="register-name" class="form-control" placeholder="Иван Иванов" required>
            </div>
            <div class="form-group">
              <label>Имейл адрес <span class="text-accent">*</span></label>
              <input type="email" id="register-email" class="form-control" placeholder="example@mail.com" required autocomplete="email">
            </div>
            <div class="form-group">
              <label>Парола <span class="text-accent">*</span></label>
              <input type="password" id="register-password" class="form-control" placeholder="Минимум 6 символа" required autocomplete="new-password" minlength="6">
            </div>
            <button type="submit" class="btn btn-accent auth-submit-btn">Създай акаунт</button>
          </form>
        </div>

        <!-- Shared Google Button (Always Visible, Never Hidden by Tabs) -->
        <div class="auth-divider"><span>или</span></div>
        
        <div id="google-btn-shared-container" style="display: flex; justify-content: center; min-height: 44px;">
          <button class="btn btn-google" onclick="Auth.triggerGoogleLogin()" style="width: 100%;">
            <img src="https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=40&auto=format&fit=crop" class="google-logo-icon" alt="Google">
            Вход с Google
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("no-scroll");

    // Render native Google Sign-In button if googleClientId is configured and SDK is loaded
    if (this.googleClientId && this.googleClientId !== "YOUR_GOOGLE_CLIENT_ID") {
      setTimeout(() => {
        if (typeof google !== "undefined" && google.accounts && google.accounts.id) {
          try {
            google.accounts.id.initialize({
              client_id: this.googleClientId,
              callback: this.handleGoogleCredentialResponse.bind(this)
            });
          } catch (e) {
            // Already initialized or other error
          }
          const container = document.getElementById("google-btn-shared-container");
          if (container) {
            container.innerHTML = ""; // Clear fallback custom button
            google.accounts.id.renderButton(
              container,
              { theme: "outline", size: "large", width: 356, text: "continue_with", logo_alignment: "left" }
            );
          }
        }
      }, 150);
    }
  },

  closeAuthModal() {
    const overlay = document.getElementById("auth-modal-overlay");
    if (overlay) overlay.remove();
    document.body.classList.remove("no-scroll");
  },

  switchTab(tab) {
    const tabs = document.querySelectorAll(".auth-tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    
    const panels = document.querySelectorAll(".auth-panel");
    panels.forEach(p => p.classList.remove("show"));

    if (tab === "login") {
      tabs[0].classList.add("active");
      document.getElementById("auth-panel-login").classList.add("show");
    } else {
      tabs[1].classList.add("active");
      document.getElementById("auth-panel-register").classList.add("show");
    }
  },

  async handleCustomRegister(event) {
    event.preventDefault();
    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    if (!name || !email || !password) return;

    const submitBtn = event.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.innerText = "Регистриране...";

    try {
      const response = await HydroluxBackend.authRegister(name, email, password);
      if (response.ok) {
        Cart.showToast(`Успешна регистрация! Добре дошли, ${name}!`);
        this.setCurrentUser({
          userId: response.userId,
          name: response.name,
          email: response.email
        });
        this.closeAuthModal();
      } else {
        Cart.showToast("Грешка: " + (response.error || "Регистрацията не може да бъде завършена."));
      }
    } catch (e) {
      console.error(e);
      Cart.showToast("Възникна грешка при регистрацията.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Създай акаунт";
    }
  },

  async handleCustomLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) return;

    const submitBtn = event.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.innerText = "Влизане...";

    try {
      const response = await HydroluxBackend.authLogin(email, password);
      if (response.ok) {
        Cart.showToast(`Успешен вход! Добре дошли отново, ${response.name}!`);
        this.setCurrentUser({
          userId: response.userId,
          name: response.name,
          email: response.email,
          avatarUrl: response.avatarUrl
        });
        this.closeAuthModal();
      } else {
        Cart.showToast("Грешка: " + (response.error || "Неправилен имейл или парола."));
      }
    } catch (e) {
      console.error(e);
      Cart.showToast("Грешка при вход: Проверете данните си.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Влез в профила";
    }
  },

  triggerGoogleLogin() {
    // If real client is configured, run OAuth
    if (this.googleClientId && this.googleClientId !== "YOUR_GOOGLE_CLIENT_ID") {
      if (typeof google !== "undefined") {
        google.accounts.id.prompt(); // prompt overlay login
      } else {
        Cart.showToast("Връзката с Google Auth се зарежда, моля опитайте пак.");
      }
    } else {
      // Fallback: simulated google sign-in modal for quick developer sandbox tests
      this.showGoogleSandboxPicker();
    }
  },

  async handleGoogleCredentialResponse(response) {
    // The raw Google credential (ID token) is sent to the backend, which
    // verifies its signature/audience with Google before trusting any identity.
    try {
      const jwt = response.credential;
      if (!jwt) return;

      const backendResponse = await HydroluxBackend.authGoogleLogin(jwt);
      if (backendResponse.ok) {
        Cart.showToast(`Успешен вход с Google! Здравейте, ${backendResponse.name}!`);
        this.setCurrentUser({
          userId: backendResponse.userId,
          name: backendResponse.name,
          email: backendResponse.email,
          avatarUrl: backendResponse.avatarUrl
        });
        this.closeAuthModal();
      } else {
        Cart.showToast("Грешка при синхронизация с Google профил.");
      }
    } catch (e) {
      console.error(e);
      Cart.showToast("Неуспешно разчитане на данните от Google.");
    }
  },

  showGoogleSandboxPicker() {
    // Beautiful local overlay modal simulating the Google chooser dialog
    const overlay = document.createElement("div");
    overlay.id = "google-sandbox-overlay";
    overlay.className = "auth-modal-overlay google-sandbox-overlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    overlay.innerHTML = `
      <div class="google-sandbox-card">
        <div class="google-sandbox-header">
          <img src="https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=40&auto=format&fit=crop" class="google-g" alt="G">
          <h3>Влезте с Google (Sandbox режим)</h3>
          <p>Изберете тестови акаунт за незабавна симулация:</p>
        </div>
        <div class="google-sandbox-accounts">
          <div class="google-sandbox-account-row" onclick="Auth.selectSandboxAccount('Георги Иванов', 'georgi@example.com', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop')">
            <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop" alt="avatar">
            <div class="account-info">
              <strong>Георги Иванов</strong>
              <span>georgi@example.com</span>
            </div>
          </div>
          <div class="google-sandbox-account-row" onclick="Auth.selectSandboxAccount('Мария Петрова', 'maria@example.com', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop')">
            <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop" alt="avatar">
            <div class="account-info">
              <strong>Мария Петрова</strong>
              <span>maria@example.com</span>
            </div>
          </div>
        </div>
        <button class="google-sandbox-cancel" onclick="document.getElementById('google-sandbox-overlay').remove()">Отказ</button>
      </div>
    `;

    document.body.appendChild(overlay);
  },

  async selectSandboxAccount(name, email, avatarUrl) {
    const sandboxOverlay = document.getElementById("google-sandbox-overlay");
    if (sandboxOverlay) sandboxOverlay.remove();

    // The simulated (sandbox) Google accounts are intentionally disabled: the
    // backend now cryptographically verifies a real Google credential, so a
    // fake identity can no longer be used to sign in. This prevents anyone from
    // logging in as an arbitrary account.
    Cart.showToast("Симулираният Google вход е изключен. Моля, използвайте истински Google профил.");
  },

  async showProfileModal() {
    if (!this.currentUser) return;

    // Open profile modal shell with Loading indicator
    const overlay = document.createElement("div");
    overlay.id = "profile-modal-overlay";
    overlay.className = "auth-modal-overlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    overlay.innerHTML = `
      <div class="profile-modal-card">
        <button class="profile-modal-close" onclick="document.getElementById('profile-modal-overlay').remove()">×</button>
        
        <div class="profile-modal-header">
          <div class="profile-avatar-big">
            ${this.currentUser.avatarUrl 
              ? `<img src="${this.currentUser.avatarUrl}" alt="Avatar">`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
            }
          </div>
          <div class="profile-user-identity">
            <h2>${this.currentUser.name}</h2>
            <span>${this.currentUser.email}</span>
          </div>
        </div>

        <div class="profile-orders-section">
          <h3>📦 Моите Поръчки (История)</h3>
          <div id="profile-orders-list" class="profile-orders-list loading">
            <div class="profile-loading-spinner"></div> Зареждане на поръчки...
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Fetch actual user orders from backend dynamically
    try {
      const response = await HydroluxBackend.getUserOrders();
      const ordersContainer = document.getElementById("profile-orders-list");
      if (!ordersContainer) return;

      ordersContainer.classList.remove("loading");

      if (response.ok && response.orders && response.orders.length > 0) {
        ordersContainer.innerHTML = response.orders.map(order => {
          const date = new Date(order.createdAt).toLocaleDateString("bg-BG", {
            year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
          });
          const itemsCount = order.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
          
          let statusText = "Нова";
          let statusClass = "status-new";
          if (order.status === "processing") {
            statusText = "Обработва се";
            statusClass = "status-processing";
          } else if (order.status === "completed") {
            statusText = "Завършена";
            statusClass = "status-completed";
          } else if (order.status === "cancelled") {
            statusText = "Отказна";
            statusClass = "status-cancelled";
          }

          // Build quick item list
          const itemsSummary = order.items.map(item => `
            <div class="order-summary-item-row">
              <span>${this.escapeHtml(item.name)} (${this.escapeHtml(item.code || '')}) x${this.escapeHtml(item.quantity || 1)}</span>
              <strong>${(Number(item.priceEur) * (Number(item.quantity) || 1)).toFixed(2)} €</strong>
            </div>
          `).join("");

          return `
            <div class="profile-order-card">
              <div class="order-card-header">
                <div>
                  <span class="order-number">Поръчка #${this.escapeHtml(order.orderNumber)}</span>
                  <span class="order-date">${date}</span>
                </div>
                <span class="order-status-badge ${statusClass}">${statusText}</span>
              </div>
              <div class="order-card-body">
                <div class="order-items-summary">
                  ${itemsSummary}
                </div>
                <div class="order-card-totals">
                  <span>Общо продукти: ${itemsCount}</span>
                  <strong class="order-grand-total">Общо: ${order.totals.totalEur.toFixed(2)} € (${order.totals.totalBgn.toFixed(2)} лв.)</strong>
                </div>
              </div>
            </div>
          `;
        }).join("");
      } else {
        ordersContainer.innerHTML = `
          <div class="profile-no-orders">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 15h8"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
            <p>Все още нямате направени поръчки с този имейл адрес.</p>
          </div>
        `;
      }
    } catch (e) {
      console.error(e);
      const ordersContainer = document.getElementById("profile-orders-list");
      if (ordersContainer) {
        ordersContainer.innerHTML = `<p class="profile-error-text">Възникна грешка при зареждане на поръчките.</p>`;
      }
    }
  },

  injectStyles() {
    if (document.getElementById("auth-styles")) return;
    const style = document.createElement("style");
    style.id = "auth-styles";
    style.innerHTML = `
      /* Account header dropdown */
      .auth-dropdown-wrapper {
        position: relative;
        display: inline-block;
      }
      .auth-user-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid rgba(255, 255, 255, 0.2);
        display: block;
      }
      .auth-user-svg {
        width: 18px;
        height: 18px;
        color: currentColor;
        display: block;
      }
      .auth-dropdown-menu {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.08);
        min-width: 180px;
        z-index: 1000;
        overflow: hidden;
        animation: authFadeIn 0.15s ease-out;
      }
      .auth-dropdown-menu.show {
        display: block;
      }
      .auth-dropdown-menu a {
        display: block;
        padding: 12px 16px;
        color: #334155;
        font-weight: 600;
        font-size: 0.88rem;
        transition: background-color 0.2s;
        text-align: left;
      }
      .auth-dropdown-menu a:hover {
        background-color: #f1f5f9;
        color: var(--primary);
      }
      .auth-dropdown-menu .dropdown-logout {
        color: #ef4444;
      }
      .auth-dropdown-menu .dropdown-logout:hover {
        background-color: #fee2e2;
        color: #ef4444;
      }
      .dropdown-divider {
        height: 1px;
        background-color: #e2e8f0;
        margin: 0;
      }
      @keyframes authFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Modal Popups Overlay */
      .auth-modal-overlay {
        position: fixed;
        inset: 0;
        background-color: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(4px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: overlayFadeIn 0.2s ease-out;
      }
      @keyframes overlayFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Auth modal card */
      .auth-modal-card {
        background-color: #ffffff;
        border-radius: 16px;
        width: 100%;
        max-width: 420px;
        padding: 32px;
        position: relative;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        animation: cardScaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes cardScaleIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .auth-modal-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: transparent;
        border: none;
        font-size: 1.8rem;
        font-weight: 300;
        color: #94a3b8;
        cursor: pointer;
        transition: color 0.2s;
        line-height: 1;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      }
      .auth-modal-close:hover {
        color: #334155;
        background-color: #f1f5f9;
      }
      .auth-modal-tabs {
        display: flex;
        border-bottom: 2px solid #e2e8f0;
        margin-bottom: 24px;
        gap: 16px;
      }
      .auth-tab-btn {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        padding: 10px 4px;
        font-weight: 700;
        font-size: 1.1rem;
        color: #64748b;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: -2px;
        font-family: var(--font-family);
      }
      .auth-tab-btn:hover {
        color: #334155;
      }
      .auth-tab-btn.active {
        color: var(--primary);
        border-bottom-color: var(--primary);
      }
      .auth-panel {
        display: none;
      }
      .auth-panel.show {
        display: block;
      }
      .auth-submit-btn {
        width: 100%;
        padding: 12px;
        font-size: 0.95rem;
        font-weight: 700;
        margin-top: 10px;
        height: auto;
      }
      .auth-divider {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 20px 0;
        color: #94a3b8;
        font-size: 0.8rem;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .auth-divider::before, .auth-divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid #e2e8f0;
      }
      .auth-divider span {
        padding: 0 10px;
      }
      .btn-google {
        width: 100%;
        background-color: #ffffff;
        border: 1.5px solid #cbd5e1;
        color: #334155;
        font-weight: 700;
        padding: 10px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: var(--font-family);
        font-size: 0.9rem;
      }
      .btn-google:hover {
        background-color: #f8fafc;
        border-color: #94a3b8;
      }
      .google-logo-icon {
        width: 20px;
        height: 20px;
        object-fit: cover;
        border-radius: 50%;
      }

      /* Google Sandbox dialog box */
      .google-sandbox-card {
        background-color: #ffffff;
        border-radius: 12px;
        padding: 24px;
        width: 100%;
        max-width: 360px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
        animation: cardScaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        text-align: center;
      }
      .google-sandbox-header {
        margin-bottom: 20px;
      }
      .google-g {
        width: 36px;
        height: 36px;
        object-fit: cover;
        border-radius: 50%;
        margin-bottom: 10px;
      }
      .google-sandbox-header h3 {
        font-size: 1.1rem;
        font-weight: 800;
        color: #1e293b;
        margin-bottom: 6px;
      }
      .google-sandbox-header p {
        font-size: 0.82rem;
        color: #64748b;
        margin: 0;
      }
      .google-sandbox-accounts {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }
      .google-sandbox-account-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
      }
      .google-sandbox-account-row:hover {
        background-color: #f1f5f9;
        border-color: var(--primary);
        transform: translateY(-1px);
      }
      .google-sandbox-account-row img {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid #e2e8f0;
      }
      .google-sandbox-account-row .account-info {
        display: flex;
        flex-direction: column;
      }
      .google-sandbox-account-row .account-info strong {
        font-size: 0.85rem;
        color: #1e293b;
        font-weight: 700;
      }
      .google-sandbox-account-row .account-info span {
        font-size: 0.75rem;
        color: #64748b;
      }
      .google-sandbox-cancel {
        background: transparent;
        border: none;
        color: #64748b;
        font-weight: 700;
        cursor: pointer;
        font-size: 0.85rem;
        font-family: var(--font-family);
      }
      .google-sandbox-cancel:hover {
        color: #1e293b;
      }

      /* Profile Modal Card */
      .profile-modal-card {
        background-color: #ffffff;
        border-radius: 16px;
        width: 100%;
        max-width: 600px;
        max-height: 85vh;
        padding: 32px;
        position: relative;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        display: flex;
        flex-direction: column;
        animation: cardScaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .profile-modal-close {
        position: absolute;
        top: 20px;
        right: 20px;
        background: transparent;
        border: none;
        font-size: 1.8rem;
        font-weight: 300;
        color: #94a3b8;
        cursor: pointer;
        transition: color 0.2s;
        line-height: 1;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        z-index: 10;
      }
      .profile-modal-close:hover {
        color: #334155;
        background-color: #f1f5f9;
      }
      .profile-modal-header {
        display: flex;
        align-items: center;
        gap: 20px;
        border-bottom: 2px solid #f1f5f9;
        padding-bottom: 24px;
        margin-bottom: 24px;
        flex-shrink: 0;
      }
      .profile-avatar-big {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background-color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        border: 2px solid var(--primary);
        overflow: hidden;
      }
      .profile-avatar-big img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .profile-avatar-big svg {
        width: 36px;
        height: 36px;
      }
      .profile-user-identity h2 {
        font-size: 1.4rem;
        font-weight: 800;
        color: #0f172a;
        margin: 0 0 4px 0;
      }
      .profile-user-identity span {
        font-size: 0.9rem;
        color: #64748b;
        font-weight: 500;
      }
      .profile-orders-section {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        min-height: 0; /* allows overflow scroll inside flex */
      }
      .profile-orders-section h3 {
        font-size: 1.1rem;
        font-weight: 800;
        color: #1e293b;
        margin-bottom: 16px;
        flex-shrink: 0;
      }
      .profile-orders-list {
        flex-grow: 1;
        overflow-y: auto;
        padding-right: 4px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 200px;
      }
      .profile-orders-list.loading {
        align-items: center;
        justify-content: center;
        color: #64748b;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .profile-loading-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #e2e8f0;
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: authSpin 0.8s linear infinite;
        margin-bottom: 10px;
      }
      @keyframes authSpin {
        to { transform: rotate(360deg); }
      }
      
      .profile-order-card {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
        background-color: #f8fafc;
        transition: border-color 0.2s;
      }
      .profile-order-card:hover {
        border-color: #cbd5e1;
      }
      .order-card-header {
        background-color: #ffffff;
        padding: 16px 20px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .order-number {
        display: block;
        font-weight: 800;
        font-size: 0.95rem;
        color: #0f172a;
        margin-bottom: 2px;
      }
      .order-date {
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;
      }
      .order-status-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 12px;
      }
      .status-new { background-color: #eff6ff; color: #1d4ed8; }
      .status-processing { background-color: #fffbeb; color: #b45309; }
      .status-completed { background-color: #ecfdf5; color: #047857; }
      .status-cancelled { background-color: #fdf2f2; color: #b91c1c; }

      .order-card-body {
        padding: 16px 20px;
      }
      .order-items-summary {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 14px;
      }
      .order-summary-item-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        color: #475569;
        line-height: 1.4;
      }
      .order-summary-item-row span {
        max-width: 80%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .order-card-totals {
        border-top: 1px dashed #cbd5e1;
        padding-top: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.82rem;
        color: #64748b;
      }
      .order-grand-total {
        font-size: 0.95rem;
        color: #0f172a;
        font-weight: 800;
      }

      .profile-no-orders {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 20px;
        color: #94a3b8;
      }
      .profile-no-orders svg {
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
      }
      .profile-no-orders p {
        font-size: 0.9rem;
        margin: 0;
        font-weight: 500;
        max-width: 280px;
      }
      .profile-error-text {
        text-align: center;
        color: #ef4444;
        font-weight: 600;
        font-size: 0.88rem;
        padding: 20px;
      }

      @media (max-width: 500px) {
        .auth-modal-card, .profile-modal-card {
          padding: 20px;
        }
        .profile-modal-header {
          flex-direction: column;
          text-align: center;
          gap: 12px;
        }
        .order-card-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        .order-status-badge {
          align-self: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }
};
