// Hydrolux Premium Store - Admin Dashboard Module (Full Real-Time CRUD + Drag-and-Drop)
const Admin = {
  activeTab: "products", // "products" or "categories"
  predefinedCols: [
    { key: "code", label: "Код на размер" },
    { key: "innerDb", label: "Вътр. ø (мм)" },
    { key: "inch", label: "Инч" },
    { key: "outerDb", label: "Външ. ø (мм)" },
    { key: "rangeDb", label: "Диапазон (мм)" },
    { key: "wallDb", label: "Дебелина на стената (мм)" },
    { key: "pressure", label: "Работно налягане (Bar)" },
    { key: "burstDb", label: "Налягане на разкъсване (Bar)" },
    { key: "vacuumDb", label: "Вакуум" },
    { key: "spacingDb", label: "Разстояние между зъбите (мм)" },
    { key: "hexDb", label: "HEX размер (мм)" },
    { key: "braidsDb", label: "Брой вложки" },
    { key: "sleeveWidthDb", label: "Широчина на ръкава (мм)" },
    { key: "bend", label: "Радиус огъване (мм)" },
    { key: "weight", label: "Тегло кг/м" },
    { key: "rollLength", label: "Дълж. ролка (м)" },
    { key: "priceEur", label: "Цена EUR (€)" }
  ],
  filterCategory: "", // Current category filter in products list
  productSearchQuery: "", // Search query in products list
  editingCategory: null, // Category currently being edited
  editingProduct: null, // Product currently being edited
  uploadedImages: [], // Temporary Base64 strings or existing URLs of uploaded files
  uploadedPdfs: [], // Array of { name, url, storageId } (new) or { name, data } (legacy base64) for technical spec PDFs
  isAuthenticated: false,
  isVerifyingAuth: true,
  isProcessingImages: false,
  isProcessingPdfs: false,
  templatesPanelOpen: false,
  savedRange: null,
  searchTimeout: null,

  async init() {
    this.resetProductFormState();
    this.loadTemplates();
    this.injectStyles();

    // Generate or retrieve a client ID for security tracking failed attempts
    let clientId = localStorage.getItem("hydrolux_admin_client_id");
    if (!clientId) {
      clientId = "cli_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem("hydrolux_admin_client_id", clientId);
    }

    const token = localStorage.getItem("hydrolux_admin_token") || sessionStorage.getItem("hydrolux_admin_token");
    if (token) {
      try {
        const res = await HydroluxBackend.verifyAdminSession();
        if (res && res.ok) {
          this.isAuthenticated = true;
        } else {
          localStorage.removeItem("hydrolux_admin_token");
          sessionStorage.removeItem("hydrolux_admin_token");
          this.isAuthenticated = false;
        }
      } catch (err) {
        console.error("Auth verification failed", err);
        this.isAuthenticated = false;
      }
    } else {
      this.isAuthenticated = false;
    }

    this.isVerifyingAuth = false;
    this.render();

    // The admin must work on the COMPLETE catalog, not a partial in-memory set,
    // so kick off the full catalog load immediately and re-render once it lands.
    if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
      CONFIG.loadCatalog().then(() => {
        try { 
          if (Admin.isAuthenticated) {
            Admin.render(); 
            Admin.migrateLegacyPdfs();
            Admin.migrateLegacyImages();
          }
        } catch (e) { /* view may have changed */ }
      }).catch(() => {});
    }

    // Register global selection tracker
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const editor = document.getElementById("prod-description-editor");
        if (editor && editor.contains(range.commonAncestorContainer)) {
          Admin.savedRange = range;
        }
      }
    });

    this.startOrderPolling();
    this.startLiveVisitorsTracker();
  },

  resetProductFormState() {
    this.editingProduct = null;
    this.editingCategory = null;
    this.uploadedImages = [];
    this.uploadedPdfs = [];
    this.currentColumns = null;
    this.tempVariants = null;
    this.isProcessingImages = false;
    this.isProcessingPdfs = false;
    const form = document.getElementById("admin-add-product-form");
    if (form) {
      try {
        form.reset();
      } catch (e) {
        console.error("Form reset error:", e);
      }
    }
  },

  injectStyles() {
    let style = document.getElementById("admin-custom-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "admin-custom-styles";
      document.head.appendChild(style);
    }
    style.innerHTML = `
      .admin-container {
        display: grid;
        grid-template-columns: 240px 1fr;
        gap: 24px;
        margin-top: 20px;
        min-height: 600px;
        max-width: 100%;
        overflow: hidden;
      }
      .admin-sidebar {
        background-color: #061c36;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 24px 16px;
        box-shadow: var(--shadow-md);
        height: fit-content;
        flex-shrink: 0;
      }
      .admin-sidebar h3 {
        margin-bottom: 24px;
        font-weight: 800;
        font-size: 1.1rem;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        padding-bottom: 16px;
        padding-left: 8px;
      }
      .admin-menu-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .admin-menu-item {
        padding: 12px 16px;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        color: #cbd5e1;
      }
      .admin-menu-item:hover {
        background-color: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }
      .admin-menu-item.active {
        background-color: var(--accent);
        color: white;
        box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
      }
      .admin-content {
        background-color: var(--bg-pure);
        border: 1px solid var(--border-light);
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 8px 15px -6px rgba(0, 0, 0, 0.05);
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
      }
      .admin-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 28px;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 20px;
        flex-wrap: wrap;
        gap: 15px;
      }
      .admin-header-row h2 {
        font-weight: 800;
        font-size: 1.6rem;
        color: #0f172a;
        margin: 0;
      }
      .admin-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        font-size: 0.9rem;
      }
      .admin-table th, .admin-table td {
        padding: 14px 20px;
        text-align: left;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }
      .admin-table th {
        background-color: #f8fafc;
        font-weight: 700;
        color: #475569;
        white-space: nowrap;
        text-transform: uppercase;
        font-size: 0.75rem;
        letter-spacing: 0.05em;
      }
      .admin-table tbody tr {
        transition: background-color 0.2s ease;
      }
      .admin-table tbody tr:hover {
        background-color: #f8fafc;
      }
      .btn-admin-action {
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 0.82rem;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: var(--shadow-sm);
      }
      .admin-actions-cell {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: nowrap;
      }
      .btn-admin-danger {
        background-color: #fee2e2;
        color: #ef4444;
      }
      .btn-admin-danger:hover {
        background-color: #ef4444;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
      }
      .btn-admin-edit {
        background-color: #e0f2fe;
        color: var(--primary);
      }
      .btn-admin-edit:hover {
        background-color: var(--primary);
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(13, 110, 253, 0.2);
      }
      .admin-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .admin-badge-success {
        background-color: #dcfce7;
        color: #15803d;
      }
      .admin-badge-category {
        background-color: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      
      /* Form inputs styling override */
      .admin-container .form-control,
      .admin-container input[type="text"],
      .admin-container input[type="number"],
      .admin-container input[type="file"],
      .admin-container select,
      .admin-container textarea {
        display: block;
        width: 100%;
        height: 42px;
        padding: 10px 14px;
        font-size: 0.9rem;
        font-weight: 500;
        line-height: 1.5;
        color: #334155;
        background-color: #ffffff;
        background-clip: padding-box;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        font-family: var(--font-family);
      }
      .admin-container textarea {
        height: auto;
        min-height: 100px;
        resize: vertical;
      }
      .admin-container select {
        appearance: none;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-position: right 14px center;
        background-size: 16px;
        padding-right: 40px;
      }
      .admin-container .form-control:focus,
      .admin-container input[type="text"]:focus,
      .admin-container input[type="number"]:focus,
      .admin-container select:focus,
      .admin-container textarea:focus {
        border-color: var(--accent);
        outline: 0;
        box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
      }
      .admin-container .form-group {
        margin-bottom: 20px;
      }
      .admin-container .form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 700;
        font-size: 0.85rem;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Grid Forms */
      .form-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .admin-form-card {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 28px;
        margin-bottom: 25px;
        box-shadow: var(--shadow-sm);
      }
      .admin-form-card h4 {
        margin-bottom: 20px;
        font-weight: 800;
        color: #1e293b;
        border-left: 4px solid var(--accent);
        padding-left: 12px;
        font-size: 1.1rem;
      }
      .admin-spec-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 12px;
        margin-bottom: 12px;
        align-items: center;
      }
      .admin-template-row {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto auto auto auto;
        gap: 8px;
        align-items: center;
      }
      .btn-icon-danger {
        background-color: #fee2e2;
        color: #ef4444;
        border: none;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        font-size: 1.2rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .btn-icon-danger:hover {
        background-color: #ef4444;
        color: white;
      }
      
      /* Visual Image Upload Preview Elements with Drag handles & Crown */
      .image-preview-wrapper {
        position: relative;
        display: inline-block;
        border: 1.5px solid var(--border-light);
        border-radius: 8px;
        padding: 4px;
        background-color: white;
        cursor: grab;
        user-select: none;
        transition: transform 0.15s ease;
        margin-top: 10px;
        margin-bottom: 10px;
      }
      .image-preview-wrapper:active {
        cursor: grabbing;
        transform: scale(0.96);
      }
      .image-preview-wrapper.dragging {
        border-color: var(--primary);
        opacity: 0.5;
        transform: scale(1.05);
      }
      .image-preview-thumbnail {
        width: 75px;
        height: 75px;
        border-radius: 6px;
        object-fit: cover;
        display: block;
      }
      .image-preview-delete {
        position: absolute;
        top: -6px;
        right: -6px;
        background-color: #ef4444;
        color: white;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        font-size: 0.7rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border: 1.5px solid white;
        font-weight: bold;
        z-index: 25;
      }
      
      /* Gold Crown for Main Face Image (Centered Symmetrically at Bottom) */
      .image-preview-crown {
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ffd700, #ffb703);
        color: #1e293b;
        font-size: 0.7rem;
        padding: 2px 6px;
        border-radius: 12px;
        border: 1.5px solid white;
        z-index: 20;
        box-shadow: 0 3px 6px rgba(251, 191, 36, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        white-space: nowrap;
        gap: 2px;
      }

      /* Drag handle dots at the top of the image */
      .image-preview-drag-handle {
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #ffffff;
        color: #64748b;
        border: 1.5px solid var(--border-light);
        border-radius: 6px;
        font-size: 0.75rem;
        padding: 1px 6px;
        font-weight: bold;
        z-index: 20;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.08);
      }

      /* Responsive centring overrides for the entire admin view on mobile */
      @media (max-width: 992px) {
        .admin-container {
          grid-template-columns: 1fr;
          gap: 15px;
          padding: 0 5px;
        }
        .admin-sidebar {
          width: 100%;
          text-align: center;
          background-color: #061c36;
          padding: 20px 15px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .admin-sidebar h3 {
          justify-content: center;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          padding-bottom: 12px;
          padding-left: 0;
        }
        .admin-menu-list {
          flex-direction: row;
          justify-content: center;
          gap: 8px;
        }
        .admin-menu-item {
          flex-grow: 1;
          justify-content: center;
          padding: 10px 5px;
          font-size: 0.85rem;
          border-radius: 8px;
        }
        .admin-content {
          padding: 20px 15px;
          border-radius: 16px;
          width: 100%;
          overflow: hidden;
          box-shadow: var(--shadow-md);
        }
        .form-grid-2 {
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .admin-header-row {
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          border-bottom: 1.5px solid #f1f5f9;
          padding-bottom: 15px;
          margin-bottom: 15px;
        }
        .admin-header-row h2 {
          font-size: 1.3rem;
        }

        /* Table to Card Conversions for mobile list */
        .admin-table {
          border: 0;
        }
        .admin-table thead {
          display: none;
        }
        .admin-table tr {
          display: block;
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 15px;
          background-color: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .admin-table td {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #f1f5f9;
          text-align: right;
          font-size: 0.85rem;
        }
        .admin-table td:last-child {
          border-bottom: 0;
          justify-content: center;
          padding-top: 12px;
        }
        .admin-table td:last-child .admin-actions-cell {
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .admin-table td::before {
          content: attr(data-label);
          font-weight: 800;
          text-align: left;
          color: #475569;
          font-size: 0.8rem;
        }
        .admin-table td > div,
        .admin-table td > span,
        .admin-table td > strong {
          text-align: right;
        }
        .admin-table td > .admin-actions-cell {
          text-align: left;
        }

        /* Variant editing grid on mobile */
        #admin-variants-tbody {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .admin-variant-tr {
          display: grid !important;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 12px !important;
          background-color: #f8fafc;
          border: 1.5px solid var(--border-light) !important;
          border-radius: 10px;
        }
        .admin-variant-tr td {
          display: block !important;
          border: 0 !important;
          padding: 0 !important;
          text-align: left;
        }
        .admin-variant-tr td::before {
          content: attr(data-label);
          display: block;
          font-weight: 800;
          font-size: 0.7rem;
          color: #64748b;
          margin-bottom: 3px;
        }
        .admin-variant-tr td:last-child {
          grid-column: span 2;
          display: flex !important;
          justify-content: center;
          border-top: 1.5px solid var(--border-light) !important;
          padding-top: 10px !important;
          margin-top: 5px;
        }
        
        /* Specs grid on mobile */
        .admin-spec-row {
          flex-direction: column;
          gap: 8px;
          background-color: #f8fafc;
          padding: 10px;
          border: 1px dashed var(--border-light);
          border-radius: 8px;
        }
        .admin-spec-row input {
          width: 100% !important;
        }
        .admin-spec-row .btn-icon-danger {
          width: 100% !important;
          height: 38px;
        }
        .admin-template-row {
          grid-template-columns: 1fr !important;
        }
        .admin-template-row button {
          width: 100%;
        }
      }
      
      /* Orders styles */
      .orders-summary-bar {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .orders-summary-card {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .orders-summary-icon {
        font-size: 2rem;
        background-color: #e2e8f0;
        width: 50px;
        height: 50px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .orders-summary-info h5 {
        margin: 0;
        font-size: 0.8rem;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .orders-summary-info strong {
        font-size: 1.4rem;
        color: #0f172a;
      }
      
      .order-card {
        background-color: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 16px;
        box-shadow: var(--shadow-sm);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .order-card:hover {
        box-shadow: var(--shadow-md);
      }
      .order-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .order-number-date h4 {
        margin: 0;
        font-size: 1.1rem;
        color: #0f172a;
      }
      .order-number-date span {
        font-size: 0.8rem;
        color: #94a3b8;
      }
      .order-card-status-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .order-grid-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }
      @media (max-width: 768px) {
        .order-grid-details {
          grid-template-columns: 1fr;
          gap: 16px;
        }
      }
      .order-details-col h5 {
        font-size: 0.8rem;
        color: #64748b;
        text-transform: uppercase;
        margin-bottom: 10px;
        border-bottom: 1.5px solid #f1f5f9;
        padding-bottom: 6px;
        letter-spacing: 0.5px;
      }
      .order-customer-info p {
        margin-bottom: 6px;
        font-size: 0.88rem;
        color: #334155;
      }
      .order-items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .order-items-table th {
        text-align: left;
        color: #64748b;
        padding-bottom: 6px;
        border-bottom: 1px solid #f1f5f9;
      }
      .order-items-table td {
        padding: 8px 0;
        border-bottom: 1px dashed #f1f5f9;
        color: #334155;
      }
      .order-items-table tr:last-child td {
        border-bottom: 0;
      }
      
      .order-badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 30px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .order-badge-new { background-color: #fef3c7; color: #d97706; }
      .order-badge-paid { background-color: #dcfce7; color: #15803d; }
      .order-badge-shipped { background-color: #dbeafe; color: #1d4ed8; }
      .order-badge-completed { background-color: #a7f3d0; color: #065f46; }
      .order-badge-unclaimed { background-color: #fee2e2; color: #b91c1c; }
      .order-badge-canceled { background-color: #f1f5f9; color: #475569; }

      @keyframes pulse-warn {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 0 12px 6px rgba(239, 68, 68, 0.2); }
      }
      .blacklist-warn-glow {
        animation: pulse-warn 2s infinite;
      }

      /* Custom Order Notification Modal Styles */
      .admin-orders-notification-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        animation: adminNotificationFadeIn 0.3s ease forwards;
      }
      .admin-orders-notification-overlay.fade-out {
        animation: adminNotificationFadeOut 0.3s ease forwards;
      }
      .admin-orders-notification-card {
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 32px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(249, 115, 22, 0.15);
        text-align: center;
        color: white;
        animation: adminNotificationScaleUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .bell-animation-wrapper {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bell-pulse {
        position: absolute;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, rgba(249, 115, 22, 0) 70%);
        border-radius: 50%;
        animation: bellPulseGlow 2s infinite ease-in-out;
      }
      .bell-icon {
        font-size: 3rem;
        z-index: 2;
        animation: bellRing 1.5s infinite ease-in-out;
        display: inline-block;
      }
      .admin-orders-notification-card h2 {
        font-size: 1.8rem;
        font-weight: 800;
        margin: 0 0 8px;
        color: #ffffff;
        letter-spacing: -0.025em;
      }
      .notification-subtitle {
        color: #94a3b8;
        font-size: 0.95rem;
        margin: 0 0 20px;
      }
      .new-orders-scroll-list {
        max-height: 280px;
        overflow-y: auto;
        margin-bottom: 24px;
        padding-right: 4px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        text-align: left;
      }
      .new-orders-scroll-list::-webkit-scrollbar {
        width: 6px;
      }
      .new-orders-scroll-list::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }
      .new-orders-scroll-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      .new-order-item-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 16px;
        transition: border-color 0.2s ease;
      }
      .new-order-item-card:hover {
        border-color: rgba(249, 115, 22, 0.3);
      }
      .new-order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 8px;
        margin-bottom: 10px;
      }
      .new-order-number {
        font-weight: 700;
        color: #f97316;
        font-size: 0.95rem;
      }
      .new-order-date {
        color: #64748b;
        font-size: 0.8rem;
      }
      .new-order-details {
        font-size: 0.88rem;
        color: #e2e8f0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .new-order-price {
        color: #ffffff;
        font-size: 0.95rem;
        margin-top: 4px;
        border-top: 1px dashed rgba(255, 255, 255, 0.08);
        padding-top: 6px;
      }
      .notification-ack-btn {
        background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        color: white;
        border: none;
        padding: 14px 28px;
        font-weight: 700;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        width: 100%;
        font-size: 1rem;
        box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);
      }
      .notification-ack-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(249, 115, 22, 0.6);
        filter: brightness(1.1);
      }
      .notification-ack-btn:active {
        transform: translateY(0);
      }
      @keyframes adminNotificationFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes adminNotificationFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes adminNotificationScaleUp {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      @keyframes bellPulseGlow {
        0%, 100% { transform: scale(0.85); opacity: 0.4; }
        50% { transform: scale(1.15); opacity: 0.7; }
      }
      @keyframes bellRing {
        0%, 100% { transform: rotate(0); }
        15% { transform: rotate(15deg); }
        30% { transform: rotate(-15deg); }
        45% { transform: rotate(10deg); }
        60% { transform: rotate(-10deg); }
        75% { transform: rotate(4deg); }
        85% { transform: rotate(-4deg); }
      }

      .category-draggable-row.dragging,
      .product-draggable-row.dragging {
        background-color: rgba(2, 132, 199, 0.08) !important;
        opacity: 0.7;
        outline: 2px dashed #0284c7;
      }
      .subcategory-draggable-item.dragging {
        opacity: 0.6;
        border: 2px dashed var(--primary) !important;
        background-color: #f8fafc !important;
      }
      .subsubcategory-draggable-item.dragging {
        opacity: 0.6;
        border: 1.5px dashed var(--accent) !important;
        background-color: #f8fafc !important;
      }

      /* Styled in-app notifications (replace native alert/confirm) */
      .admin-toast {
        position: fixed; top: 24px; left: 50%;
        transform: translateX(-50%) translateY(-24px);
        z-index: 2147483000; display: flex; align-items: center; gap: 10px;
        padding: 14px 22px; border-radius: 12px; color: #fff;
        font-weight: 700; font-size: 0.95rem; line-height: 1.35;
        box-shadow: 0 14px 36px rgba(0,0,0,0.28); max-width: 92vw;
        opacity: 0; transition: opacity .28s ease, transform .28s ease;
      }
      .admin-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      .admin-toast-icon {
        flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
        background: rgba(255,255,255,0.25); display: inline-flex;
        align-items: center; justify-content: center; font-size: 0.85rem;
      }
      .admin-confirm-overlay {
        position: fixed; inset: 0; z-index: 2147483001;
        background: rgba(6, 28, 54, 0.55); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
        opacity: 0; transition: opacity .2s ease;
      }
      .admin-confirm-overlay.show { opacity: 1; }
      .admin-confirm-box {
        background: #fff; border-radius: 16px; padding: 26px 24px 20px;
        max-width: 420px; width: 100%; box-shadow: 0 24px 60px rgba(0,0,0,0.35);
        transform: scale(.94); transition: transform .2s ease; text-align: center;
      }
      .admin-confirm-overlay.show .admin-confirm-box { transform: scale(1); }
      .admin-confirm-msg {
        font-size: 1rem; font-weight: 600; color: #1e293b;
        line-height: 1.5; margin-bottom: 22px;
      }
      .admin-confirm-actions { display: flex; gap: 12px; justify-content: center; }
      .admin-confirm-actions button {
        flex: 1; max-width: 170px; padding: 12px 16px; border-radius: 10px;
        font-weight: 700; font-size: 0.92rem; cursor: pointer; border: none;
        transition: filter .15s ease, transform .1s ease;
      }
      .admin-confirm-actions button:active { transform: scale(.97); }
      .admin-confirm-cancel { background: #e2e8f0; color: #334155; }
      .admin-confirm-cancel:hover { filter: brightness(0.96); }
      .admin-confirm-ok { background: #2563eb; color: #fff; }
      .admin-confirm-ok.danger { background: #ef4444; }
      .admin-confirm-ok:hover { filter: brightness(1.07); }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  },

  // Styled toast notification — replaces the browser-native Admin.notify() so success
  // and validation messages match the site design instead of looking like a
  // system dialog. Type is auto-detected from the message when not given.
  notify(message, type) {
    const text = String(message == null ? "" : message);
    if (!type) {
      if (/успешно|обнов|добав|създад|редактир|запис|готов|възстанов|премахнат|изтрит/i.test(text)) type = "success";
      else if (/моля|грешка|невалид|твърде|не успя|не беше|съществува|изберете|въведете|добавете|липсва|неуспешн/i.test(text)) type = "error";
      else type = "info";
    }
    const styles = {
      success: { bg: "#16a34a", icon: "✓" },
      error:   { bg: "#ef4444", icon: "!" },
      warning: { bg: "#f59e0b", icon: "!" },
      info:    { bg: "#2563eb", icon: "i" },
    };
    const s = styles[type] || styles.info;
    const toast = document.createElement("div");
    toast.className = "admin-toast";
    toast.style.backgroundColor = s.bg;
    toast.innerHTML = `<span class="admin-toast-icon">${s.icon}</span><span>${this.escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    const ttl = type === "error" ? 4500 : 3200;
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 350);
    }, ttl);
  },

  // Styled confirmation dialog — replaces the browser-native confirm().
  // Returns a Promise that resolves to true (confirmed) or false (cancelled).
  confirmDialog(message, options = {}) {
    const { confirmText = "Да", cancelText = "Отказ", danger = true } = options;
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "admin-confirm-overlay";
      overlay.innerHTML = `
        <div class="admin-confirm-box" role="dialog" aria-modal="true">
          <div class="admin-confirm-msg">${this.escapeHtml(String(message)).replace(/\n/g, "<br>")}</div>
          <div class="admin-confirm-actions">
            <button type="button" class="admin-confirm-cancel">${this.escapeHtml(cancelText)}</button>
            <button type="button" class="admin-confirm-ok ${danger ? "danger" : ""}">${this.escapeHtml(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));

      let settled = false;
      const close = (val) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 220);
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
        else if (e.key === "Enter") close(true);
      };
      overlay.querySelector(".admin-confirm-cancel").addEventListener("click", () => close(false));
      overlay.querySelector(".admin-confirm-ok").addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", onKey);
    });
  },

  saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const editor = document.getElementById("prod-description-editor");
      if (editor && editor.contains(range.commonAncestorContainer)) {
        this.savedRange = range;
      }
    }
  },

  restoreSelection() {
    if (this.savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this.savedRange);
    }
  },

  formatDoc(cmd, val = null) {
    this.restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const editor = document.getElementById("prod-description-editor");
    if (!editor) return;

    let node = range.commonAncestorContainer;
    if (node.nodeType === 3) {
      node = node.parentNode;
    }
    if (!editor.contains(node)) return;

    document.execCommand(cmd, false, val);
    editor.focus();
    this.saveSelection();
  },

  changeTextColor(color) {
    const indicator = document.getElementById("editor-color-indicator");
    if (indicator) {
      indicator.style.backgroundColor = color;
    }
    this.formatDoc("foreColor", color);
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    this.resetProductFormState();
    this.render();
  },

  render() {
    this.isFullRender = true;
    try {
      const container = document.getElementById("admin-view-content");
      if (!container) return;

      if (this.isVerifyingAuth) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 15px;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid var(--primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
            <span style="font-weight: bold; color: var(--text-dark);">Проверка на сесията...</span>
          </div>
        `;
        return;
      }

      if (!this.isAuthenticated) {
        container.innerHTML = this.renderLoginForm();
        return;
      }

      container.innerHTML = `
        <div class="admin-container">
          <!-- Sidebar Navigation -->
          <aside class="admin-sidebar">
            <h3>🛠️ Панел Хидролукс</h3>
            <ul class="admin-menu-list">
              <li class="admin-menu-item ${this.activeTab === 'products' ? 'active' : ''}" onclick="Admin.switchTab('products')">
                📦 Продукти
              </li>
              <li class="admin-menu-item ${this.activeTab === 'categories' ? 'active' : ''}" onclick="Admin.switchTab('categories')">
                📁 Категории
              </li>
              <li class="admin-menu-item ${this.activeTab === 'orders' ? 'active' : ''}" onclick="Admin.switchTab('orders')">
                📋 Поръчки
              </li>
              <li class="admin-menu-item ${this.activeTab === 'crimping' ? 'active' : ''}" onclick="Admin.switchTab('crimping')">
                ⚙️ Кримпване
              </li>
              <li class="admin-menu-item ${this.activeTab === 'archive' ? 'active' : ''}" onclick="Admin.switchTab('archive')">
                🗄️ Архив (изтрити)
              </li>
              <li class="admin-menu-item" onclick="Admin.logout()" style="color: #ef4444; margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 15px;">
                🚪 Изход
              </li>
            </ul>
          </aside>

          <!-- Main Workspace -->
          <main class="admin-content" id="admin-workspace">
            ${this.renderActiveWorkspace()}
          </main>
        </div>
      `;

      // Initialize custom interactive handlers (like spec lists or images preview)
      if (this.activeTab === "products") {
        this.initProductFormHandlers();
        this.setupProductsDragAndDrop();
      }
      if (this.activeTab === "categories") {
        this.renderSubcategoriesList();
        this.setupCategoriesDragAndDrop();
      }
      if (this.activeTab === "orders") {
        this.loadOrders();
      }
      if (this.activeTab === "archive") {
        this.loadArchive();
      }
    } finally {
      this.isFullRender = false;
    }
  },

  renderActiveWorkspace() {
    switch (this.activeTab) {
      case "products":
        return this.renderProductsWorkspace();
      case "categories":
        return this.renderCategoriesWorkspace();
      case "orders":
        return this.renderOrdersWorkspace();
      case "crimping":
        return this.renderCrimpingWorkspace();
      case "archive":
        return this.renderArchiveWorkspace();
      default:
        return "Няма намерен работен панел.";
    }
  },

  // ==========================================================================
  // ARCHIVE WORKSPACE (recovery of deleted products)
  // ==========================================================================
  renderArchiveWorkspace() {
    return `
      <div class="admin-workspace-header">
        <h2 style="margin: 0 0 6px;">🗄️ Архив на изтрити продукти</h2>
        <p class="text-muted font-xs" style="margin: 0 0 18px; max-width: 720px;">
          Тук се пазят всички продукти, изтрити от панела. Архивът се съхранява в
          Convex и не може да бъде изтрит от сайта или панела — само ръчно от
          Convex таблото. Натиснете „Върни", за да върнете продукт обратно на сайта.
        </p>
      </div>
      <div id="admin-archive-list">
        <p class="text-muted">Зареждане на архива…</p>
      </div>
    `;
  },

  async loadArchive() {
    const container = document.getElementById("admin-archive-list");
    if (!container) return;
    if (typeof HydroluxBackend === "undefined") {
      container.innerHTML = `<p class="text-muted">Архивът не е наличен (няма връзка с Convex).</p>`;
      return;
    }
    try {
      const archived = await HydroluxBackend.getArchivedProducts();
      this.archivedProducts = archived;

      if (!archived.length) {
        container.innerHTML = `<p class="text-muted">Все още няма изтрити продукти в архива.</p>`;
        return;
      }

      const fmtDate = (ts) => {
        try { return new Date(ts).toLocaleString("bg-BG"); } catch { return ""; }
      };

      const rows = archived.map(row => {
        const p = row.data || {};
        const img = (p.images && p.images[0]) ? p.images[0] : "assets/logo.webp";
        const safeImg = String(img).replace(/\s+/g, "%20");
        const stillLive = CONFIG.products.some(cp => cp.id === p.id);
        const restoredBadge = row.restoredAt
          ? `<span style="color:#16a34a; font-size:0.7rem; font-weight:700;">възстановен на ${fmtDate(row.restoredAt)}</span>`
          : "";
        return `
          <tr class="admin-table-row">
            <td><img src="${safeImg}" onerror="this.src='assets/logo.webp'" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></td>
            <td>
              <strong>${p.name || "(без име)"}</strong><br>
              <span class="text-muted font-xs">Код: ${p.code || "—"} | Марка: ${p.brand || "—"}</span><br>
              <span class="text-muted font-xs">id: ${p.id || "—"}</span><br>
              <span class="text-muted font-xs">изтрит на ${fmtDate(row.archivedAt)}</span> ${restoredBadge}
            </td>
            <td>
              ${stillLive
                ? `<span class="text-muted font-xs">вече е на сайта</span>`
                : `<button class="btn-admin-action" style="background:#16a34a;color:#fff;" onclick="Admin.restoreArchivedProduct('${p.id}')">↩ Върни</button>`}
            </td>
          </tr>`;
      }).join("");

      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr><th>Снимка</th><th>Продукт</th><th>Действие</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (err) {
      console.error("Грешка при зареждане на архива", err);
      container.innerHTML = `<p class="text-muted">Грешка при зареждане на архива.</p>`;
    }
  },

  async restoreArchivedProduct(productId) {
    const row = (this.archivedProducts || []).find(r => (r.data && r.data.id) === productId);
    if (!row || !row.data) {
      Admin.notify("Не е намерен архивен запис за този продукт.");
      return;
    }
    if (CONFIG.products.some(p => p.id === productId)) {
      Admin.notify("Този продукт вече съществува на сайта.");
      this.loadArchive();
      return;
    }
    const saved = await this.persistProductChanges(() => {
      CONFIG.products.push(row.data);
    });
    if (!saved) return;

    try {
      await HydroluxBackend.markArchivedProductRestored(productId);
    } catch (err) {
      console.warn("Не можа да се отбележи като възстановен", err);
    }

    this.propagateStateChanges();
    Admin.notify("Продуктът е възстановен и отново е на сайта!");
    this.loadArchive();
  },

  // ==========================================================================
  // PRODUCTS WORKSPACE
  // ==========================================================================
  renderProductsWorkspace() {
    // Collect unique brands from existing products for the datalist autocomplete
    const existingBrands = [...new Set(CONFIG.products.map(p => p.brand).filter(Boolean))].sort();

    const isEditing = this.editingProduct !== null;
    const currentBrand = isEditing ? (this.editingProduct.brand || "") : "";
    const brandInList = existingBrands.includes(currentBrand);
    
    let selectValue = "";
    let showCustomInput = false;
    if (currentBrand) {
      if (brandInList) {
        selectValue = currentBrand;
      } else {
        selectValue = "__NEW_BRAND__";
        showCustomInput = true;
      }
    }

    // Filter products list based on selected category filter and search query
    let products = CONFIG.products;
    if (this.filterCategory) {
      products = products.filter(p => {
        const productCats = p.categories || (p.category ? [p.category] : []);
        return productCats.includes(this.filterCategory);
      });
    }
    const query = this.productSearchQuery ? this.productSearchQuery.toLowerCase().trim() : "";
    if (query) {
      products = products.filter(p => {
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCode = p.code.toLowerCase().includes(query);
        const matchesBrand = p.brand.toLowerCase().includes(query);
        const matchesDesc = (p.description || "").toLowerCase().includes(query);
        const matchesTags = (p.tags || []).some(t => t.toLowerCase().includes(query));
        const matchesSpecs = (p.specs || []).some(s => s.key.toLowerCase().includes(query) || s.value.toLowerCase().includes(query));
        const matchesVariants = (p.variants || []).some(v => 
          Object.values(v).some(val => String(val).toLowerCase().includes(query))
        );
        return matchesName || matchesCode || matchesBrand || matchesDesc || matchesTags || matchesSpecs || matchesVariants;
      });
    }

    let productRows = products.map((p, idxFiltered) => {
      const minPrice = p.variants && p.variants.length > 0 ? Math.min(...p.variants.map(v => v.priceEur)) : 0;
      const productCats = p.categories || (p.category ? [p.category] : []);
      const productSubs = p.subcategories || (p.subcategory ? [p.subcategory] : []);
      const productSubSubs = p.subsubcategories || (p.subsubcategory ? [p.subsubcategory] : []);

      let catDisplay = productCats.map(catId => {
        const catObj = CONFIG.categories.find(c => c.id === catId);
        let name = catObj ? catObj.name : catId;
        if (catObj && catObj.subcategories) {
          const assignedSubs = catObj.subcategories.filter(s => productSubs.includes(s.id));
          if (assignedSubs.length > 0) {
            const subDisplay = assignedSubs.map(subObj => {
              let subName = subObj.name;
              if (subObj.subcategories) {
                const assignedSubSubs = subObj.subcategories.filter(ss => productSubSubs.includes(ss.id));
                if (assignedSubSubs.length > 0) {
                  subName += ` (${assignedSubSubs.map(ss => ss.name).join(", ")})`;
                }
              }
              return subName;
            }).join(", ");
            name += ` / ${subDisplay}`;
          }
        }
        return name;
      }).join("; ");
      const thumb = p.images && p.images[0] ? p.images[0] : "https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop";

      return `
        <tr class="admin-table-row ${this.filterCategory ? 'product-draggable-row' : ''}" ${this.filterCategory ? 'draggable="true"' : ''} data-id="${p.id}">
          <td style="text-align: center; vertical-align: middle; width: 40px; ${this.filterCategory ? 'cursor: grab;' : 'cursor: not-allowed;'}" ${this.filterCategory ? '' : 'title="Изберете категория за подредба"'}>
            <span style="color: ${this.filterCategory ? '#94a3b8' : '#cbd5e1'}; font-size: 1.15rem; user-select: none;">⠿</span>
          </td>
          <td data-label="Продукт">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${thumb}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-light); margin-right: 12px;" onerror="this.src='https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop'">
              <div>
                <strong>${p.name}</strong><br>
                <span class="text-muted font-xs">Код: ${p.code} | <strong>Марка:</strong> ${p.brand}</span>
              </div>
            </div>
          </td>
          <td data-label="Категория">
            <span class="admin-badge admin-badge-category">${catDisplay}</span>
          </td>
          <td data-label="Цена EUR">
            <strong class="text-primary">${minPrice.toFixed(2)} €</strong>
          </td>
          <td data-label="Вариации">
            <span class="admin-badge admin-badge-success">${p.variants ? p.variants.length : 0} размери</span>
          </td>
          <td data-label="Действия">
            <div class="admin-actions-cell">
              <button class="btn-admin-action btn-admin-edit" onclick="Admin.startEditProduct('${p.id}')">✏️ Редактирай</button>
              <button class="btn-admin-action btn-admin-danger" onclick="Admin.deleteProduct('${p.id}')">✕ Изтрий</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (products.length === 0) {
      productRows = `<tr><td colspan="6" class="text-center text-muted" style="padding: 30px; color: #94a3b8;">Няма добавени продукти в тази категория или търсене.</td></tr>`;
    }

    // Generate categories options for product creation
    const categoryOptions = CONFIG.categories.map(c => `
      <option value="${c.id}">${c.name}</option>
    `).join("");

    // Generate categories options for list filtering
    const filterOptions = CONFIG.categories.map(c => `
      <option value="${c.id}" ${this.filterCategory === c.id ? 'selected' : ''}>${c.name}</option>
    `).join("");

    const specialOfferType = isEditing ? (this.editingProduct.specialOfferType || "seasonal") : "seasonal";
    const specialOfferText = isEditing ? (this.editingProduct.specialOfferText || "") : "";
    const showSpecialFields = isEditing && this.editingProduct.isSpecial;
    const showCustomSpecialText = showSpecialFields && specialOfferType === "other";

    return `
      <div class="admin-header-row">
        <div>
          <h2>Управление на Продукти</h2>
        </div>
        <div>
          <span class="admin-badge admin-badge-success">${products.length} Продукта</span>
        </div>
      </div>

      ${CONFIG.isStateLoadingFromServer === false && CONFIG.isStateLoadedFromServer === false ? `
        <div style="background-color: #fee2e2; border: 1.5px solid #ef4444; color: #b91c1c; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; font-size: 0.9rem; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
          <span style="display: flex; align-items: center; gap: 6px;">⚠️ Базата данни от сървъра (Convex) не е заредена успешно. Всички промени са блокирани, за да се избегне загуба на данни.</span>
          <span style="font-size: 0.8rem; font-family: monospace; color: #991b1b; margin-top: 4px;">Детайли за грешката: ${CONFIG.serverLoadError || 'Failed to fetch (възможно е разширение като Adblock / Brave Shield да блокира достъпа)'}</span>
          <span style="font-size: 0.85rem; font-weight: 500; margin-top: 4px;">👉 Моля, спрете Adblock / Brave Shield за този сайт, проверете връзката си и презаредете страницата.</span>
        </div>
      ` : ''}

      <!-- Add or Edit Product Form Card -->
      <div class="admin-form-card">
        <h4>${isEditing ? `✏️ Редактиране на продукт: "${this.editingProduct.name}"` : '➕ Добавяне на нов продукт'}</h4>
        <form id="admin-add-product-form" onsubmit="Admin.handleProductSubmit(event)" autocomplete="off">
          
          <!-- IMAGE UPLOAD FIELD AT THE VERY TOP (Without static help text) -->
          <div class="form-group" style="background-color: var(--primary-light); padding: 15px; border-radius: 8px; border: 1.5px dashed var(--primary); margin-bottom: 20px;">
            <label style="font-weight: 800; color: var(--primary); display: block; margin-bottom: 5px;">📷 Снимки от устройството <span class="text-accent">*</span></label>
            <input type="file" id="prod-images-upload" class="form-control" multiple accept="image/*" style="padding: 6px; border: 1px solid var(--border-light); font-weight: bold; background-color: white;">
            <div id="prod-images-status" class="font-xs text-muted" style="margin-top: 8px;"></div>
            
            <!-- Image Previews Container with Drag and Drop Support -->
            <div id="prod-images-preview" style="display: flex; gap: 12px; margin-top: 15px; flex-wrap: wrap;"></div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label>Име на продукта <span class="text-accent">*</span></label>
              <input type="text" id="prod-name" class="form-control" value="${isEditing ? this.editingProduct.name : ''}" placeholder="напр. Маркуч за сгъстен въздух PLW 20" required>
            </div>
            <div class="form-group">
              <label>Код / Артикулен номер <span class="text-accent">*</span></label>
              <input type="text" id="prod-code" class="form-control" value="${isEditing ? this.editingProduct.code : ''}" placeholder="напр. PLW20" required>
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label>Категории (изберете една или повече) <span class="text-accent">*</span></label>
              <div id="prod-categories-checkboxes" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; max-height: 150px; overflow-y: auto; background: white;">
                ${CONFIG.categories.map(c => {
                  const isChecked = isEditing && (
                    (this.editingProduct.categories && this.editingProduct.categories.includes(c.id)) ||
                    (this.editingProduct.category === c.id)
                  );
                  return `
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.85rem; cursor: pointer; color: var(--text-dark); margin: 0;">
                      <input type="checkbox" name="prod-categories" value="${c.id}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent);">
                      <span>${c.name}</span>
                    </label>
                  `;
                }).join("")}
              </div>
            </div>
            <div class="form-group" id="prod-subcategory-group" style="display: none;">
              <label>Подкатегории (изберете една или повече)</label>
              <div id="prod-subcategories-checkboxes" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; max-height: 150px; overflow-y: auto; background: white;">
                <!-- Populated dynamically -->
              </div>
            </div>
            <div class="form-group" id="prod-subsubcategory-group" style="display: none;">
              <label>Под-подкатегории (изберете една или повече)</label>
              <div id="prod-subsubcategories-checkboxes" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; max-height: 150px; overflow-y: auto; background: white;">
                <!-- Populated dynamically -->
              </div>
            </div>
            <div class="form-group">
              <label>Марка</label>
              <select id="prod-brand-select" class="form-control" onchange="Admin.handleBrandSelectChange(this.value)">
                <option value="" ${selectValue === '' ? 'selected' : ''}>-- Изберете марка (незадължително) --</option>
                ${existingBrands.map(b => `<option value="${this.escapeAttr(b)}" ${selectValue === b ? 'selected' : ''}>${b}</option>`).join("")}
                <option value="__NEW_BRAND__" ${selectValue === '__NEW_BRAND__' ? 'selected' : ''}>Друга марка (въведи ръчно)...</option>
              </select>
              <input type="text" id="prod-brand-custom-input" class="form-control" value="${selectValue === '__NEW_BRAND__' ? this.escapeAttr(currentBrand) : ''}" placeholder="Въведете нова марка..." style="margin-top: 8px; display: ${showCustomInput ? 'block' : 'none'};">
            </div>
          </div>

          <div class="form-group">
            <label>Описание на продукта</label>
            <div class="rich-text-editor-container">
              <div class="editor-toolbar">
                <button type="button" class="editor-btn" onclick="Admin.formatDoc('bold')" title="Удебелен">B</button>
                <button type="button" class="editor-btn" onclick="Admin.formatDoc('italic')" title="Курсив" style="font-style: italic;">I</button>
                <button type="button" class="editor-btn" onclick="Admin.formatDoc('underline')" title="Подчертан" style="text-decoration: underline;">U</button>
                <div class="editor-color-wrapper" style="position: relative; display: inline-block;">
                  <button type="button" class="editor-btn" title="Цвят на текста" onclick="document.getElementById('editor-color-input').click()" style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                    <span style="font-size: 0.75rem; line-height: 1; font-weight: 900; color: #1e293b;">A</span>
                    <div id="editor-color-indicator" style="width: 14px; height: 3px; background-color: #000000; margin-top: 1px; border-radius: 1px;"></div>
                  </button>
                  <input type="color" id="editor-color-input" oninput="Admin.changeTextColor(this.value)" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: none; padding: 0;">
                </div>
              </div>
              <div id="prod-description-editor" class="editor-content" contenteditable="true" placeholder="Кратко описание на предназначението, гъвкавостта и материалите...">${isEditing ? this.editingProduct.description : ''}</div>
            </div>
          </div>

          <div class="form-group">
            <label>Етикети (разделени със запетая)</label>
            <input type="text" id="prod-tags" class="form-control" value="${isEditing ? this.editingProduct.tags.join(", ") : ''}" placeholder="гумен маркуч, маркуч за въздух, компресор">
          </div>

          <!-- PDF UPLOAD FIELD -->
          <div class="form-group" style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; border: 1.5px dashed #16a34a; margin-top: 15px; margin-bottom: 20px;">
            <label style="font-weight: 800; color: #16a34a; display: block; margin-bottom: 5px;">📄 Технически спецификации (PDF файлове)</label>
            <input type="file" id="prod-pdf-upload" class="form-control" accept="application/pdf" multiple style="padding: 6px; border: 1px solid var(--border-light); font-weight: bold; background-color: white;">
            <div id="prod-pdfs-list-container" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              ${this.renderPdfListItems()}
            </div>
          </div>

          <!-- SPECIAL OFFER SETTINGS -->
          <div class="form-group" style="background-color: #fffbeb; padding: 12px 15px; border-radius: 8px; border: 1px solid #fef3c7; margin-top: 15px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="checkbox" id="prod-is-special" onchange="Admin.toggleSpecialOfferFields()" ${isEditing && this.editingProduct.isSpecial ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
              <label for="prod-is-special" style="margin: 0; font-weight: 700; color: #b45309; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                🔥 Маркирай като специално предложение
              </label>
            </div>
            <div id="prod-special-fields" style="display: ${showSpecialFields ? 'block' : 'none'}; margin-top: 12px;">
              <div class="form-grid-2">
                <div class="form-group" style="margin-bottom: 0;">
                  <label>Тип предложение</label>
                  <select id="prod-special-type" class="form-control" onchange="Admin.toggleSpecialOfferFields()">
                    <option value="seasonal" ${specialOfferType === 'seasonal' ? 'selected' : ''}>Сезонно намаление</option>
                    <option value="hot" ${specialOfferType === 'hot' ? 'selected' : ''}>Гореща оферта</option>
                    <option value="other" ${specialOfferType === 'other' ? 'selected' : ''}>Друго</option>
                  </select>
                </div>
                <div class="form-group" id="prod-special-text-group" style="display: ${showCustomSpecialText ? 'block' : 'none'}; margin-bottom: 0;">
                  <label>Текст за предложението</label>
                  <input type="text" id="prod-special-text" class="form-control" value="${this.escapeAttr(specialOfferText)}" placeholder="напр. Промо пакет">
                </div>
              </div>
            </div>
          </div>

          <!-- Product Specs Section -->
          <div class="form-group">
            <label style="font-weight: 800;">🛠️ Технически характеристики</label>
            <div id="prod-specs-container">
              ${isEditing && this.editingProduct.specs ? this.editingProduct.specs.map(spec => `
                <div class="admin-spec-row">
                  <input type="text" class="form-control spec-key" value="${spec.key}" placeholder="напр. Работна температура">
                  <input type="text" class="form-control spec-val" value="${spec.value}" placeholder="напр. -25°C до +70°C">
                  <button type="button" class="btn-icon-danger" onclick="this.parentElement.remove()">×</button>
                </div>
              `).join("") : `
                <div class="admin-spec-row">
                  <input type="text" class="form-control spec-key" placeholder="напр. Работна температура">
                  <input type="text" class="form-control spec-val" placeholder="напр. -25°C до +70°C">
                  <button type="button" class="btn-icon-danger" onclick="this.parentElement.remove()">×</button>
                </div>
              `}
            </div>
            <button type="button" class="btn btn-secondary mt-10" onclick="Admin.addNewSpecRow()">+ Добави Характеристика</button>
          </div>

          <!-- Product Variants Table (Customizable and Operational) -->
          <div id="variants-table-container">
            ${this.renderVariantsTable()}
          </div>

          <div class="divider"></div>
          <div style="display: flex; gap: 10px;">
            <button type="submit" id="admin-product-submit-btn" class="btn btn-accent btn-large" style="min-width: 200px;">💾 ${isEditing ? 'Запази промените' : 'Запази Продукта'}</button>
            ${isEditing ? `
              <button type="button" class="btn btn-secondary btn-large" onclick="Admin.cancelProductEdit()">Отказ</button>
            ` : ''}
          </div>
        </form>
      </div>

      <!-- Current Products Table Header with Category Filter and Smart Search Input -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 40px; margin-bottom: 15px; flex-wrap: wrap; gap: 15px; border-bottom: 2px solid var(--border-light); padding-bottom: 12px;">
        <h3 style="font-weight: 800; font-size: 1.3rem; color: #1e293b; margin: 0;">Списък с продукти</h3>
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="prod-search-input" class="form-control" oninput="Admin.filterProductsList()" placeholder="🔍 Търси по име, код, марка, описание..." value="${this.productSearchQuery || ''}" style="width: 280px; height: 38px; padding: 6px 12px; border: 1.5px solid var(--primary); border-radius: 6px;">
          <span class="text-muted font-bold font-xs" style="text-transform: uppercase; letter-spacing: 0.5px;">Филтриране:</span>
          <select id="prod-filter-category" class="form-control" onchange="Admin.filterProductsList()" style="width: 240px; font-weight: 700; height: 38px; padding: 6px; border: 1.5px solid var(--primary); border-radius: 6px; color: var(--primary); background-color: white;">
            <option value="">Всички категории</option>
            ${filterOptions}
          </select>
        </div>
      </div>

      <!-- Current Products Table -->
      <div style="overflow-x: auto; width: 100%; border: 1px solid var(--border-light); border-radius: 8px;">
        <table class="admin-table" id="admin-products-list-table" style="width: 100%; min-width: 800px; margin-top: 0;">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;"></th>
              <th>Продукт</th>
              <th>Категория</th>
              <th>Цена EUR</th>
              <th>Вариации</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>
      </div>
    `;
  },

  filterProductsList() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.filterProductsListDebounced();
    }, 150);
  },

  filterProductsListDebounced() {
    const catId = document.getElementById("prod-filter-category") ? document.getElementById("prod-filter-category").value : this.filterCategory;
    const query = document.getElementById("prod-search-input") ? document.getElementById("prod-search-input").value.toLowerCase().trim() : "";
    
    this.filterCategory = catId;
    this.productSearchQuery = query;

    const tbody = document.querySelector("#admin-products-list-table tbody");
    if (!tbody) return;
    
    let products = CONFIG.products;
    if (catId) {
      products = products.filter(p => {
        const productCats = p.categories || (p.category ? [p.category] : []);
        return productCats.includes(catId);
      });
    }
    if (query) {
      products = products.filter(p => {
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCode = p.code.toLowerCase().includes(query);
        const matchesBrand = p.brand.toLowerCase().includes(query);
        const matchesDesc = (p.description || "").toLowerCase().includes(query);
        const matchesTags = (p.tags || []).some(t => t.toLowerCase().includes(query));
        const matchesSpecs = (p.specs || []).some(s => s.key.toLowerCase().includes(query) || s.value.toLowerCase().includes(query));
        const matchesVariants = (p.variants || []).some(v => 
          Object.values(v).some(val => String(val).toLowerCase().includes(query))
        );
        return matchesName || matchesCode || matchesBrand || matchesDesc || matchesTags || matchesSpecs || matchesVariants;
      });
    }
    
    let productRows = products.map((p, idxFiltered) => {
      const minPrice = p.variants && p.variants.length > 0 ? Math.min(...p.variants.map(v => v.priceEur)) : 0;
      const productCats = p.categories || (p.category ? [p.category] : []);
      const productSubs = p.subcategories || (p.subcategory ? [p.subcategory] : []);
      const productSubSubs = p.subsubcategories || (p.subsubcategory ? [p.subsubcategory] : []);

      let catDisplay = productCats.map(catId => {
        const catObj = CONFIG.categories.find(c => c.id === catId);
        let name = catObj ? catObj.name : catId;
        if (catObj && catObj.subcategories) {
          const assignedSubs = catObj.subcategories.filter(s => productSubs.includes(s.id));
          if (assignedSubs.length > 0) {
            const subDisplay = assignedSubs.map(subObj => {
              let subName = subObj.name;
              if (subObj.subcategories) {
                const assignedSubSubs = subObj.subcategories.filter(ss => productSubSubs.includes(ss.id));
                if (assignedSubSubs.length > 0) {
                  subName += ` (${assignedSubSubs.map(ss => ss.name).join(", ")})`;
                }
              }
              return subName;
            }).join(", ");
            name += ` / ${subDisplay}`;
          }
        }
        return name;
      }).join("; ");
      const thumb = p.images && p.images[0] ? p.images[0] : "https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop";

      return `
        <tr class="admin-table-row ${catId ? 'product-draggable-row' : ''}" ${catId ? 'draggable="true"' : ''} data-id="${p.id}">
          <td style="text-align: center; vertical-align: middle; width: 40px; ${catId ? 'cursor: grab;' : 'cursor: not-allowed;'}" ${catId ? '' : 'title="Изберете категория за подредба"'}>
            <span style="color: ${catId ? '#94a3b8' : '#cbd5e1'}; font-size: 1.15rem; user-select: none;">⠿</span>
          </td>
          <td data-label="Продукт">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${thumb}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-light); margin-right: 12px;" onerror="this.src='https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=600&auto=format&fit=crop'">
              <div>
                <strong>${p.name}</strong><br>
                <span class="text-muted font-xs">Код: ${p.code} | <strong>Марка:</strong> ${p.brand}</span>
              </div>
            </div>
          </td>
          <td data-label="Категория">
            <span class="admin-badge admin-badge-category">${catDisplay}</span>
          </td>
          <td data-label="Цена EUR">
            <strong class="text-primary">${minPrice.toFixed(2)} €</strong>
          </td>
          <td data-label="Вариации">
            <span class="admin-badge admin-badge-success">${p.variants ? p.variants.length : 0} размери</span>
          </td>
          <td data-label="Действия">
            <div class="admin-actions-cell">
              <button class="btn-admin-action btn-admin-edit" type="button" onclick="Admin.startEditProduct('${p.id}')">✏️ Редактирай</button>
              <button class="btn-admin-action btn-admin-danger" type="button" onclick="Admin.deleteProduct('${p.id}')">✕ Изтрий</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (products.length === 0) {
      productRows = `<tr><td colspan="6" class="text-center text-muted" style="padding: 30px; color: #94a3b8;">Няма намерени продукти.</td></tr>`;
    }
    
    tbody.innerHTML = productRows;
    this.setupProductsDragAndDrop();
    
    // Update count badge in the header above the products list
    const badge = document.querySelector(".admin-header-row .admin-badge-success");
    if (badge) {
      badge.textContent = `${products.length} Продукта`;
    }
  },

  handleBrandSelectChange(val) {
    const customInput = document.getElementById("prod-brand-custom-input");
    if (customInput) {
      if (val === "__NEW_BRAND__") {
        customInput.style.display = "block";
        customInput.focus();
      } else {
        customInput.style.display = "none";
        customInput.value = "";
      }
    }
  },

  addNewSpecRow() {
    const container = document.getElementById("prod-specs-container");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "admin-spec-row";
    div.innerHTML = `
      <input type="text" class="form-control spec-key" placeholder="Характеристика">
      <input type="text" class="form-control spec-val" placeholder="Стойност">
      <button type="button" class="btn-icon-danger" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(div);
  },

  renderVariantsTable() {
    const isEditing = this.editingProduct !== null;
    
    if (!this.currentColumns || this.currentColumns.length === 0) {
      if (isEditing && this.editingProduct.columns) {
        this.currentColumns = [...this.editingProduct.columns];
      } else {
        this.currentColumns = [
          { key: "code", label: "Код на размер" },
          { key: "innerDb", label: "Вътр. ø (мм)" },
          { key: "inch", label: "Инч" },
          { key: "outerDb", label: "Външ. ø (мм)" },
          { key: "pressure", label: "Работно нал.(Bar)" },
          { key: "bend", label: "Радиус огъване(мм)" },
          { key: "weight", label: "Тегло кг/м" },
          { key: "rollLength", label: "Дълж. ролка(м)" },
          { key: "priceEur", label: "Цена EUR (€)" }
        ];
      }
    }

    let activeVariants = [];
    if (this.tempVariants) {
      activeVariants = this.tempVariants;
    } else if (this.isFullRender) {
      activeVariants = isEditing ? this.editingProduct.variants : [];
    } else {
      activeVariants = this.collectVariantsFromDOM() || (isEditing ? this.editingProduct.variants : []);
    }
    if (!Array.isArray(activeVariants) || activeVariants.length === 0) {
      const newRow = {};
      this.currentColumns.forEach(c => {
        newRow[c.key] = "";
      });
      activeVariants = [newRow];
    }

    // Load saved templates for selection
    this.loadTemplates();
    const headersHTML = this.currentColumns.map((c, idx) => {
      const isPredefined = this.predefinedCols.some(opt => opt.key === c.key);
      return `
        <th style="padding: 8px; min-width: 120px; position: relative; text-align: center; vertical-align: top; background: #f8fafc; border: 1px solid var(--border-light);">
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
            <!-- Column Reordering Buttons -->
            <div style="display: flex; gap: 6px; margin-bottom: 2px;">
              <button type="button" class="btn btn-secondary btn-icon" onclick="Admin.moveColumnLeft('${c.key}')" style="width: 20px; height: 20px; font-size: 0.65rem; padding: 0;" title="Премести наляво" ${idx === 0 ? 'disabled' : ''}>◀</button>
              <button type="button" class="btn btn-secondary btn-icon" onclick="Admin.moveColumnRight('${c.key}')" style="width: 20px; height: 20px; font-size: 0.65rem; padding: 0;" title="Премести надясно" ${idx === this.currentColumns.length - 1 ? 'disabled' : ''}>▶</button>
            </div>
            
            <!-- Predefined Columns Select Dropdown -->
            <select class="form-control" onchange="Admin.changeColumnHeader('${c.key}', this.value)" style="font-size: 0.75rem; font-weight: 800; padding: 4px; border: 1px solid var(--primary); border-radius: 4px; width: 100%; cursor: pointer; text-align-last: center; height: 28px;">
              ${this.predefinedCols.map(opt => `<option value="${opt.key}" ${c.key === opt.key ? 'selected' : ''}>${opt.label}</option>`).join("")}
              <option value="custom" ${!isPredefined ? 'selected' : ''}>Друго...</option>
            </select>

            <!-- Custom Label Input (only shown if not predefined) -->
            ${!isPredefined ? `
              <input type="text" class="form-control text-center" value="${c.label}" 
                     onchange="Admin.renameColumnCustom('${c.key}', this.value)" 
                     style="font-size: 0.72rem; padding: 3px 6px; border: 1px dashed var(--primary); background: white; border-radius: 4px; width: 100%; margin-top: 2px;"
                     placeholder="Въведете име">
            ` : ''}

            <!-- Delete Column Button -->
            <button type="button" class="btn-admin-action btn-admin-danger" onclick="Admin.deleteColumn('${c.key}')" 
                    style="font-size: 0.65rem; padding: 2px 6px; height: 20px; line-height: 14px; margin-top: 4px; border-radius: 4px;" title="Изтрий колоната">Изтрий</button>
          </div>
        </th>
      `;
    }).join("");

    const rowsHTML = activeVariants.map((v, rIdx) => `
      <tr class="admin-variant-tr">
        <td style="padding: 5px; text-align: center; vertical-align: middle; width: 30px;">
          <div class="drag-handle" 
               style="cursor: grab; display: inline-flex; flex-direction: column; justify-content: center; gap: 3px; width: 12px; height: 18px;"
               onmousedown="Admin.startRowDrag(event, this)"
               ontouchstart="Admin.startRowDrag(event, this)">
            <span style="display: flex; gap: 3px;"><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span></span>
            <span style="display: flex; gap: 3px;"><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span></span>
            <span style="display: flex; gap: 3px;"><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span><span style="width: 3.5px; height: 3.5px; border-radius: 50%; background: #94a3b8;"></span></span>
          </div>
        </td>
        ${this.currentColumns.map(c => {
          const val = v[c.key] !== undefined ? v[c.key] : '';
          const isPrice = c.key === 'priceEur';
          return `
            <td data-label="${c.label}" style="padding: 5px;">
              <input type="text" 
                     class="form-control var-cell" 
                     data-key="${c.key}" 
                     value="${val}" 
                     style="padding: 6px; font-size: 0.8rem; ${isPrice ? 'font-weight: 700; border-color: var(--accent);' : ''}">
            </td>
          `;
        }).join("")}
        <td data-label="Действия" style="padding: 5px; text-align: center;">
          <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem;" onclick="this.parentElement.parentElement.remove()">×</button>
        </td>
      </tr>
    `).join("");

    return `
      <div class="form-group mt-20">
        <label style="font-weight: 800; display: block; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; color: var(--primary);">📏 Таблица с размери, цени и детайли (Еднакви с продуктовата таблица)</label>
        <p class="text-muted font-xs" style="margin-bottom: 15px;">Всички полета и колони са изцяло редактируеми. Можете да променяте имената на колоните, да добавяте нови или да ги изтривате.</p>
        
        ${this.renderTemplatesManager()}

        <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addColumn()">➕ Добави Нова Колона</button>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addNewVariantRow()">➕ Добави Нов Размер (Ред)</button>
        </div>

        <div class="admin-table-responsive" style="max-width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-light);">
          <table class="admin-table" style="min-width: 900px; font-size: 0.85rem; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="padding: 8px; width: 30px; text-align: center;"></th>
                ${headersHTML}
                <th style="padding: 8px; width: 60px; text-align: center;">Действие</th>
              </tr>
            </thead>
            <tbody id="admin-variants-tbody">
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderTemplatesManager() {
    this.loadTemplates();
    const templateOptions = this.savedTemplates.map(t => `
      <option value="${this.escapeAttr(t.id)}">${this.escapeHtml(t.name)}</option>
    `).join("");
    const savedTemplateRows = this.savedTemplates.length > 0 ? this.savedTemplates.map(t => {
      const safeId = this.escapeAttr(t.id);
      const safeName = this.escapeAttr(t.name);
      return `
        <div class="admin-template-row" style="padding: 10px; border: 1px solid var(--border-light); border-radius: 6px; background: white;">
          <input type="text" id="template-name-${safeId}" class="form-control" value="${safeName}" style="height: 34px; padding: 6px; font-weight: 700;">
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.loadTemplateById('${safeId}')">Зареди</button>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.renameTemplate('${safeId}', document.getElementById('template-name-${safeId}').value)">Преименувай</button>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.updateTemplateFromCurrentColumns('${safeId}')">Обнови</button>
          <button type="button" class="btn-admin-action btn-admin-danger" onclick="Admin.deleteTemplate('${safeId}')">Изтрий</button>
        </div>
      `;
    }).join("") : `
      <div class="text-muted font-xs" style="padding: 10px;">Няма запазени шаблони.</div>
    `;

    return `
      <div style="margin-bottom: 20px;">
        <button type="button" class="btn btn-secondary btn-small" onclick="Admin.toggleTemplatesPanel()" style="margin-bottom: ${this.templatesPanelOpen ? '12px' : '0'};">
          ${this.templatesPanelOpen ? 'Скрий шаблоните' : 'Покажи запазени таблици'}
        </button>
        ${this.templatesPanelOpen ? `
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid var(--border-light);">
            <div style="display: flex; gap: 20px; align-items: end; flex-wrap: wrap; margin-bottom: 15px;">
              <div>
                <label style="font-weight: 700; font-size: 0.8rem; color: #475569; display: block; margin-bottom: 5px;">📋 Избери запазена таблица:</label>
                <select id="template-select" class="form-control" style="width: 250px; padding: 6px; font-weight: 700; height: 36px;">
                  <option value="">-- Изберете шаблон --</option>
                  ${templateOptions}
                </select>
              </div>
              <button type="button" class="btn btn-secondary" onclick="Admin.loadTemplateById(document.getElementById('template-select').value)" style="height: 36px; padding: 0 15px;">Зареди</button>
              <div>
                <label style="font-weight: 700; font-size: 0.8rem; color: #475569; display: block; margin-bottom: 5px;">💾 Запази текущата таблица:</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <input type="text" id="new-template-name" class="form-control" placeholder="напр. Шаблон за Въздух" style="width: 220px; padding: 6px; height: 36px;">
                  <button type="button" class="btn btn-secondary" onclick="Admin.saveTemplate(document.getElementById('new-template-name').value)" style="height: 36px; padding: 0 15px;">Запази</button>
                </div>
              </div>
            </div>
            <div style="display: grid; gap: 8px;">
              ${savedTemplateRows}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  escapeAttr(value) {
    return this.escapeHtml(value);
  },

  toggleTemplatesPanel() {
    const activeVariants = this.collectVariantsFromDOM();
    this.templatesPanelOpen = !this.templatesPanelOpen;
    this.refreshVariantsTable(activeVariants);
  },

  toggleSpecialOfferFields() {
    const checkbox = document.getElementById("prod-is-special");
    const fields = document.getElementById("prod-special-fields");
    const typeSelect = document.getElementById("prod-special-type");
    const textGroup = document.getElementById("prod-special-text-group");

    if (fields && checkbox) {
      fields.style.display = checkbox.checked ? "block" : "none";
    }
    if (textGroup && typeSelect) {
      textGroup.style.display = checkbox && checkbox.checked && typeSelect.value === "other" ? "block" : "none";
    }
  },

  getSpecialOfferLabel(type, customText = "") {
    if (type === "hot") return "ГОРЕЩА ОФЕРТА";
    if (type === "other") return (customText || "").trim();
    return "СЕЗОННО НАМАЛЕНИЕ";
  },

  collectVariantsFromDOM() {
    // Use admin-specific ID to avoid conflict with catalog's #prod-variants-tbody
    const tbody = document.getElementById("admin-variants-tbody");
    if (!tbody) return null;
    
    const variants = [];
    tbody.querySelectorAll(".admin-variant-tr").forEach(row => {
      const v = {};
      let hasValue = false;
      row.querySelectorAll(".var-cell").forEach(input => {
        const key = input.getAttribute("data-key");
        const val = (input.value || "").trim();
        if (val !== "") {
          hasValue = true;
        }
        if (key === 'code' || key === 'inch') {
          v[key] = val;
        } else {
          v[key] = (isNaN(val) || val === '') ? val : parseFloat(val);
        }
      });
      if (hasValue) {
        variants.push(v);
      }
    });
    return variants;
  },

  renameColumn(key, newLabel) {
    if (!this.currentColumns) return;
    const col = this.currentColumns.find(c => c.key === key);
    if (col) {
      col.label = newLabel.trim();
    }
    const activeVariants = this.collectVariantsFromDOM();
    this.refreshVariantsTable(activeVariants);
  },

  moveColumnLeft(key) {
    const activeVariants = this.collectVariantsFromDOM();
    const idx = this.currentColumns.findIndex(c => c.key === key);
    if (idx > 0) {
      const temp = this.currentColumns[idx];
      this.currentColumns[idx] = this.currentColumns[idx - 1];
      this.currentColumns[idx - 1] = temp;
      this.refreshVariantsTable(activeVariants);
    }
  },

  moveColumnRight(key) {
    const activeVariants = this.collectVariantsFromDOM();
    const idx = this.currentColumns.findIndex(c => c.key === key);
    if (idx !== -1 && idx < this.currentColumns.length - 1) {
      const temp = this.currentColumns[idx];
      this.currentColumns[idx] = this.currentColumns[idx + 1];
      this.currentColumns[idx + 1] = temp;
      this.refreshVariantsTable(activeVariants);
    }
  },

  changeColumnHeader(oldKey, newKey) {
    const activeVariants = this.collectVariantsFromDOM();
    if (!this.currentColumns) return;

    const col = this.currentColumns.find(c => c.key === oldKey);
    if (!col) return;

    if (newKey === "custom") {
      const customKey = "col_" + Date.now();
      col.key = customKey;
      col.label = "Нова колона";
      if (activeVariants) {
        activeVariants.forEach(v => {
          v[customKey] = v[oldKey] !== undefined ? v[oldKey] : "";
          delete v[oldKey];
        });
      }
      this.refreshVariantsTable(activeVariants);
      return;
    }

    if (this.currentColumns.some(c => c.key === newKey && c.key !== oldKey)) {
      Admin.notify("Тази колона вече съществува в таблицата!");
      this.refreshVariantsTable(activeVariants);
      return;
    }

    const predefinedOpt = this.predefinedCols.find(opt => opt.key === newKey);
    if (predefinedOpt) {
      col.key = newKey;
      col.label = predefinedOpt.label;
      if (activeVariants) {
        activeVariants.forEach(v => {
          v[newKey] = v[oldKey] !== undefined ? v[oldKey] : "";
          delete v[oldKey];
        });
      }
      this.refreshVariantsTable(activeVariants);
    }
  },

  renameColumnCustom(key, newLabel) {
    if (!this.currentColumns) return;
    const col = this.currentColumns.find(c => c.key === key);
    if (col) {
      col.label = newLabel.trim();
    }
    const activeVariants = this.collectVariantsFromDOM();
    this.refreshVariantsTable(activeVariants);
  },

  async deleteColumn(key) {
    if (await this.confirmDialog("Сигурни ли сте, че искате да изтриете тази колона? Данните в нея ще бъдат премахнати.")) {
      const activeVariants = this.collectVariantsFromDOM();
      if (activeVariants) {
        activeVariants.forEach(v => {
          delete v[key];
        });
      }
      this.currentColumns = this.currentColumns.filter(c => c.key !== key);
      this.refreshVariantsTable(activeVariants);
    }
  },

  addColumn() {
    const key = "col_" + Date.now();
    const activeVariants = this.collectVariantsFromDOM();
    if (activeVariants) {
      activeVariants.forEach(v => {
        v[key] = "";
      });
    }
    if (!this.currentColumns) this.currentColumns = [];
    this.currentColumns.push({ key, label: "Нова колона" });
    this.refreshVariantsTable(activeVariants);
  },

  addNewVariantRow() {
    const activeVariants = this.collectVariantsFromDOM() || [];
    const newRow = {};
    if (!this.currentColumns) return;
    this.currentColumns.forEach(c => {
      newRow[c.key] = "";
    });
    activeVariants.push(newRow);
    this.refreshVariantsTable(activeVariants);
  },

  refreshVariantsTable(variants = null) {
    const container = document.getElementById("variants-table-container");
    if (container) {
      if (variants) {
        this.tempVariants = variants;
      }
      container.innerHTML = this.renderVariantsTable();
      this.tempVariants = null;
    }
  },

  initProductFormHandlers() {
    // Register file input listener
    const fileInput = document.getElementById("prod-images-upload");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        Admin.isProcessingImages = true;
        Admin.updateImageUploadStatus(`Обработват се и се качват ${files.length} снимки...`);

        try {
          const processedImages = await Promise.all(files.map(file => Admin.compressImageFile(file)));
          
          let uploadCount = 0;
          for (let i = 0; i < processedImages.length; i++) {
            const dataUrl = processedImages[i];
            if (!dataUrl) continue;

            const blob = Admin.base64ToBlob(dataUrl, "image/webp");
            if (blob) {
              const fileObj = new File([blob], `image_${Date.now()}_${i}.webp`, { type: "image/webp" });
              const res = await HydroluxBackend.uploadPdf(fileObj);
              if (res && res.ok && res.url) {
                Admin.uploadedImages.push(res.url);
                uploadCount++;
              }
            }
          }
          
          Admin.renderImagePreviews();
          Admin.updateImageUploadStatus(`Успешно качени ${uploadCount} снимки.`);
        } catch (err) {
          console.error("Image upload failed", err);
          Admin.notify("Не успяхме да качим снимките. Моля опитайте с по-малки JPG/PNG файлове.");
        } finally {
          Admin.isProcessingImages = false;
          Admin.updateProductSubmitState();
          fileInput.value = "";
        }
      });
    }

    // Register PDF input listener
    const pdfInput = document.getElementById("prod-pdf-upload");
    if (pdfInput) {
      pdfInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Limit size to 10 MB per file
        const maxSize = 10 * 1024 * 1024;

        // Pre-validate before showing the uploading state.
        const validFiles = [];
        for (const file of files) {
          if (file.type !== "application/pdf") {
            Admin.notify(`Файлът "${file.name}" не е валиден PDF документ.`);
            continue;
          }
          if (file.size > maxSize) {
            Admin.notify(`Файлът "${file.name}" е твърде голям (над 10 MB).`);
            continue;
          }
          validFiles.push(file);
        }

        if (validFiles.length === 0) {
          pdfInput.value = "";
          return;
        }

        // PDFs are uploaded to Convex file storage (not embedded as base64 in
        // the products document, which has a ~1 MB limit). We keep only a light
        // reference { name, url, storageId } on the product.
        Admin.isProcessingPdfs = true;
        Admin.renderPdfList();

        for (const file of validFiles) {
          try {
            const result = await HydroluxBackend.uploadPdf(file);
            if (!result || !result.ok || !result.url) {
              throw new Error("Сървърът не върна валиден линк към файла.");
            }
            if (!Admin.uploadedPdfs) Admin.uploadedPdfs = [];
            Admin.uploadedPdfs.push({ name: file.name, url: result.url, storageId: result.storageId });
            Admin.renderPdfList();
          } catch (err) {
            console.error("PDF upload failed", err);
            Admin.notify(`Не успяхме да качим файла "${file.name}". Моля проверете интернет връзката и опитайте отново.`);
          }
        }

        Admin.isProcessingPdfs = false;
        pdfInput.value = "";
        Admin.renderPdfList();
      });
    }

    // Populate Category + Subcategory + Sub-subcategory selectors
    const categoryCheckboxes = document.querySelectorAll('input[name="prod-categories"]');
    const subcategoriesContainer = document.getElementById("prod-subcategories-checkboxes");
    
    const getSelectedCategories = () => {
      const checked = document.querySelectorAll('input[name="prod-categories"]:checked');
      return Array.from(checked).map(cb => cb.value);
    };

    if (categoryCheckboxes.length > 0 && subcategoriesContainer) {
      const isEditing = this.editingProduct !== null;
      
      let initialSubIds = [];
      let initialSubSubIds = [];
      if (isEditing) {
        initialSubIds = this.editingProduct.subcategories || (this.editingProduct.subcategory ? [this.editingProduct.subcategory] : []);
        initialSubSubIds = this.editingProduct.subsubcategories || (this.editingProduct.subsubcategory ? [this.editingProduct.subsubcategory] : []);
      }
      
      const selectedCats = getSelectedCategories();
      this.handleProductCategoryChange(selectedCats, initialSubIds, initialSubSubIds);

      categoryCheckboxes.forEach(cb => {
        cb.addEventListener("change", () => {
          const cats = getSelectedCategories();
          this.handleProductCategoryChange(cats);
        });
      });
    }

    // Populate thumbnails preview
    this.renderImagePreviews();
    this.updateProductSubmitState();

    // Populate template variant row if empty
    const tbody = document.getElementById("admin-variants-tbody");
    if (tbody && tbody.children.length === 0) {
      this.addNewVariantRow();
    }

    // Register event listeners on the description editor to save its text selection
    const editor = document.getElementById("prod-description-editor");
    if (editor) {
      editor.addEventListener("mouseup", () => Admin.saveSelection());
      editor.addEventListener("keyup", () => Admin.saveSelection());
      editor.addEventListener("blur", () => Admin.saveSelection());
    }
  },

  // Inner HTML for the attached-PDFs list. Kept separate so we can re-render
  // just this container (not the whole form) and avoid wiping unsaved inputs.
  renderPdfListItems() {
    const uniqueNames = this.getUniquePdfDisplayNames();
    const datalistOptions = uniqueNames.map(name => `<option value="${this.escapeAttr(name)}">`).join("");
    const datalistHtml = `<datalist id="pdf-names-suggestions">${datalistOptions}</datalist>`;

    const items = (this.uploadedPdfs && this.uploadedPdfs.length > 0)
      ? this.uploadedPdfs.map((pdf, idx) => `
          <div style="display: flex; flex-direction: column; gap: 6px; padding: 10px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <span style="color: #16a34a; font-weight: bold; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;" title="${this.escapeHtml(pdf.name)}">📄 ${this.escapeHtml(pdf.name)}</span>
              <button type="button" class="btn btn-secondary btn-small" onclick="Admin.removeUploadedPdf(${idx})" style="padding: 2px 8px; font-size: 0.7rem; height: auto; margin: 0; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Изтрий</button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.75rem; font-weight: bold; color: #16a34a; white-space: nowrap;">Име за показване:</span>
              <input type="text" class="form-control" list="pdf-names-suggestions" value="${this.escapeAttr(pdf.displayName || '')}" placeholder="напр. Инструкция за монтаж" oninput="Admin.updatePdfDisplayName(${idx}, this.value)" style="height: 28px; padding: 4px 8px; font-size: 0.75rem; border: 1px solid #cbd5e1; border-radius: 4px; flex: 1;">
            </div>
          </div>
        `).join("")
      : '<span class="text-muted font-xs">Няма прикачени PDF файлове.</span>';
    const uploading = this.isProcessingPdfs
      ? '<span style="color: #16a34a; font-weight: bold; font-size: 0.85rem;">⏳ Качване на PDF файл(ове)...</span>'
      : '';
    return items + uploading + datalistHtml;
  },

  // Re-renders only the PDF list container, preserving the rest of the form.
  renderPdfList() {
    const container = document.getElementById("prod-pdfs-list-container");
    if (container) {
      container.innerHTML = this.renderPdfListItems();
    }
  },

  removeUploadedPdf(idx) {
    if (this.uploadedPdfs && this.uploadedPdfs[idx]) {
      this.uploadedPdfs.splice(idx, 1);
      this.renderPdfList();
    }
  },

  updatePdfDisplayName(idx, val) {
    if (this.uploadedPdfs && this.uploadedPdfs[idx]) {
      this.uploadedPdfs[idx].displayName = val;
    }
  },

  compressImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = event => {
        const originalDataUrl = event.target.result;

        if (file.type === "image/svg+xml") {
          resolve(originalDataUrl);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const maxSide = 1200;
          const ratio = Math.min(1, maxSide / img.naturalWidth, maxSide / img.naturalHeight);
          const width = Math.max(1, Math.round(img.naturalWidth * ratio));
          const height = Math.max(1, Math.round(img.naturalHeight * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve(originalDataUrl);
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/webp", 0.82);
          resolve(compressedDataUrl.length < originalDataUrl.length ? compressedDataUrl : originalDataUrl);
        };
        img.onerror = () => resolve(originalDataUrl);
        img.src = originalDataUrl;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  updateImageUploadStatus(message = "") {
    const status = document.getElementById("prod-images-status");
    if (status) {
      status.textContent = message;
    }
    this.updateProductSubmitState();
  },

  updateProductSubmitState() {
    const button = document.getElementById("admin-product-submit-btn");
    if (!button) return;

    button.disabled = this.isProcessingImages;
    button.style.opacity = this.isProcessingImages ? "0.65" : "";
    button.style.cursor = this.isProcessingImages ? "not-allowed" : "";
  },

  renderImagePreviews() {
    const previewContainer = document.getElementById("prod-images-preview");
    if (!previewContainer) return;

    previewContainer.innerHTML = this.uploadedImages.map((img, idx) => {
      if (!img) return '';
      return `
        <div class="image-preview-wrapper" draggable="true" data-index="${idx}">
          <div class="image-preview-drag-handle">⠿</div>
          ${idx === 0 ? `<div class="image-preview-crown" title="Главно лице на продукта">👑 Главна</div>` : ''}
          <img src="${img}" class="image-preview-thumbnail">
          <div class="image-preview-delete" onclick="Admin.removeUploadedImage(${idx}, event)">×</div>
        </div>
      `;
    }).join("");

    this.setupDragAndDrop();
  },

  removeUploadedImage(index, event) {
    event.stopPropagation();
    this.uploadedImages.splice(index, 1);
    this.renderImagePreviews();
  },

  // Touch & Mouse Drag and Drop Reordering Engine
  setupDragAndDrop() {
    const container = document.getElementById("prod-images-preview");
    if (!container) return;

    let draggedItem = null;

    container.querySelectorAll(".image-preview-wrapper").forEach(item => {
      // 1. Desktop mouse events
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        if (item !== draggedItem) {
          const children = Array.from(container.children);
          const draggedIdx = children.indexOf(draggedItem);
          const targetIdx = children.indexOf(item);

          if (draggedIdx < targetIdx) {
            container.insertBefore(draggedItem, item.nextSibling);
          } else {
            container.insertBefore(draggedItem, item);
          }

          // Sync with uploadedImages memory state
          const reorderedImages = [];
          Array.from(container.children).forEach(wrapper => {
            const idx = parseInt(wrapper.getAttribute("data-index"));
            reorderedImages.push(Admin.uploadedImages[idx]);
          });

          Admin.uploadedImages = reorderedImages;
          Admin.renderImagePreviews(); // Re-render to update crowns & indices
        }
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });

      // 2. Mobile touch events for true drag & drop reordering
      item.addEventListener("touchstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
      }, { passive: true });

      item.addEventListener("touchmove", (e) => {
        if (!draggedItem) return;
        
        // Prevent default screen scrolling during active drag
        if (e.cancelable) {
          e.preventDefault();
        }
        
        const touch = e.touches[0];
        
        // Disable pointer events temporarily on the dragged item
        const origPE = draggedItem.style.pointerEvents;
        draggedItem.style.pointerEvents = "none";
        
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        draggedItem.style.pointerEvents = origPE;
        
        if (!element) return;
        
        const hoverItem = element.closest(".image-preview-wrapper");
        if (hoverItem && hoverItem !== draggedItem && hoverItem.parentNode === container) {
          const children = Array.from(container.children);
          const draggedIdx = children.indexOf(draggedItem);
          const hoverIdx = children.indexOf(hoverItem);
          
          if (draggedIdx < hoverIdx) {
            container.insertBefore(draggedItem, hoverItem.nextSibling);
          } else {
            container.insertBefore(draggedItem, hoverItem);
          }
        }
      }, { passive: false });

      item.addEventListener("touchend", () => {
        if (!draggedItem) return;
        item.classList.remove("dragging");
        
        // Sync reordered state with the memory array Admin.uploadedImages
        const reorderedImages = [];
        Array.from(container.children).forEach(wrapper => {
          const originalIdx = parseInt(wrapper.getAttribute("data-index"));
          reorderedImages.push(Admin.uploadedImages[originalIdx]);
        });
        
        Admin.uploadedImages = reorderedImages;
        Admin.renderImagePreviews(); // Re-render to update crowns & indices
        
        draggedItem = null;
      });

      item.addEventListener("touchcancel", () => {
        if (!draggedItem) return;
        item.classList.remove("dragging");
        draggedItem = null;
      });
    });
  },

  async startEditProduct(prodId) {
    const prod = CONFIG.products.find(p => p.id === prodId);
    if (prod) {
      this.editingProduct = prod;
      this.uploadedImages = [...prod.images]; // Load existing images
      this.uploadedPdfs = prod.pdfs ? prod.pdfs.map(p => ({ ...p })) : [];
      if (prod.pdf) {
        this.uploadedPdfs.push({ name: "Техническа спецификация (PDF)", data: prod.pdf });
      }
      this.currentColumns = prod.columns ? [...prod.columns] : null; // Load product columns
      this.tempVariants = prod.variants ? prod.variants.map(v => ({ ...v })) : null;
      this.render();
      this.tempVariants = null;
      window.scrollTo({ top: 150, behavior: "smooth" });

      // Automatically migrate any legacy base64 PDF in the background for this product if present
      const legacyPdfs = this.uploadedPdfs.filter(pdf => pdf && pdf.data && typeof pdf.data === "string" && pdf.data.startsWith("data:application/pdf"));
      if (legacyPdfs.length > 0) {
        this.isProcessingPdfs = true;
        this.renderPdfList();

        for (const pdf of legacyPdfs) {
          try {
            console.log(`Uploading legacy PDF "${pdf.name}" to Convex storage during edit...`);
            const blob = this.base64ToBlob(pdf.data);
            if (blob) {
              const file = new File([blob], pdf.name || "specification.pdf", { type: "application/pdf" });
              const result = await HydroluxBackend.uploadPdf(file);
              if (result && result.ok && result.url) {
                pdf.url = result.url;
                pdf.storageId = result.storageId;
                delete pdf.data;
                console.log(`Successfully migrated PDF during edit: "${pdf.name}"`);
              }
            }
          } catch (e) {
            console.error("Failed to upload legacy PDF during edit", e);
          }
        }

        this.isProcessingPdfs = false;
        this.renderPdfList();
      }
    }
  },

  cancelProductEdit() {
    this.resetProductFormState();
    this.render();
  },

  async persistProductChanges(changeFn) {
    // Make sure the FULL product catalog is loaded before saving, otherwise we
    // could persist a partial product list to Convex and wipe other products.
    if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
      try {
        await CONFIG.loadCatalog();
      } catch (e) {
        console.warn("Catalog not fully loaded before save", e);
      }
    }

    const previousProducts = JSON.stringify(CONFIG.products);
    const previousCategories = JSON.stringify(CONFIG.categories);

    try {
      changeFn();
      await CONFIG.saveState();
      return true;
    } catch (err) {
      try {
        CONFIG.products = JSON.parse(previousProducts);
        CONFIG.categories = JSON.parse(previousCategories);
        localStorage.setItem("hydrolux_products", previousProducts);
        localStorage.setItem("hydrolux_categories", previousCategories);
      } catch (restoreErr) {
        console.error("Could not restore previous admin state", restoreErr);
      }

      console.error("Could not save product changes", err);
      Admin.notify("Продуктът не беше записан в Convex. Моля проверете интернет връзката и опитайте отново.");
      return false;
    }
  },

  async handleProductSubmit(event) {
    event.preventDefault();

    if (this.isProcessingImages) {
      Admin.notify("Моля изчакайте снимките да се обработят и опитайте отново.");
      return;
    }

    if (this.isProcessingPdfs) {
      Admin.notify("Моля изчакайте PDF файловете да се качат и опитайте отново.");
      return;
    }

    const submitBtn = document.getElementById("admin-product-submit-btn");
    let originalBtnHtml = "";
    if (submitBtn) {
      submitBtn.disabled = true;
      originalBtnHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = "⏳ Записване... Моля, изчакайте.";
    }

    try {
      const name = (document.getElementById("prod-name")?.value || "").trim();
      const code = (document.getElementById("prod-code")?.value || "").trim();
      
      const categoryCheckboxes = document.querySelectorAll('input[name="prod-categories"]:checked');
      const categories = Array.from(categoryCheckboxes).map(cb => cb.value);
      const category = categories[0] || "";
      
      const subcategoryCheckboxes = document.querySelectorAll('input[name="prod-subcategories"]:checked');
      const subcategories = Array.from(subcategoryCheckboxes).map(cb => cb.value);
      const subcategory = subcategories[0] || "";
      
      const subsubcategoryCheckboxes = document.querySelectorAll('input[name="prod-subsubcategories"]:checked');
      const subsubcategories = Array.from(subsubcategoryCheckboxes).map(cb => cb.value);
      const subsubcategory = subsubcategories[0] || "";
      const brandSelect = document.getElementById("prod-brand-select");
      let brand = "";
      if (brandSelect) {
        if (brandSelect.value === "__NEW_BRAND__") {
          brand = (document.getElementById("prod-brand-custom-input")?.value || "").trim();
        } else {
          brand = brandSelect.value;
        }
      }

      // JS-based validation for required core fields (replaces silent HTML5 blocks)
      if (!name) { Admin.notify("Моля въведете Име на продукта!"); document.getElementById("prod-name")?.focus(); return; }
      if (!code) { Admin.notify("Моля въведете Код / Артикулен номер!"); document.getElementById("prod-code")?.focus(); return; }
      if (categories.length === 0) { Admin.notify("Моля изберете поне една Категория!"); return; }
      const editor = document.getElementById("prod-description-editor");
      const description = editor ? (editor.innerHTML || "").trim() : "";
      const tagsInput = document.getElementById("prod-tags")?.value || "";
      const isSpecial = document.getElementById("prod-is-special")?.checked || false;
      const specialOfferType = isSpecial ? (document.getElementById("prod-special-type")?.value || "") : "";
      const specialOfferText = isSpecial && specialOfferType === "other"
        ? (document.getElementById("prod-special-text")?.value || "").trim()
        : "";

      if (isSpecial && specialOfferType === "other" && !specialOfferText) {
        Admin.notify("Моля въведете текст за специалното предложение!");
        document.getElementById("prod-special-text")?.focus();
        return;
      }

      const tags = tagsInput ? tagsInput.split(",").map(t => (t || "").trim()) : [];
      
      // Read all uploaded base64 / url images in order
      const images = this.uploadedImages.filter(img => img !== null && img !== "");

      if (images.length === 0) {
        Admin.notify("Моля качете поне една снимка от устройството!");
        return;
      }

      // 1. Collect technical specifications
      const specs = [];
      document.querySelectorAll(".admin-spec-row").forEach(row => {
        const keyEl = row.querySelector(".spec-key");
        const valEl = row.querySelector(".spec-val");
        const key = (keyEl?.value || "").trim();
        const val = (valEl?.value || "").trim();
        if (key && val) {
          specs.push({ key, value: val });
        }
      });

      // 2. Collect dynamic size/variant columns using our DOM collector
      const variants = this.collectVariantsFromDOM();

      if (!variants || variants.length === 0) {
        Admin.notify("Моля добавете поне един размер в таблицата!");
        return;
      }

      if (this.editingProduct) {
        // EDIT MODE
        let editAppliedSuccessfully = false;
        const saved = await this.persistProductChanges(() => {
          const target = CONFIG.products.find(p => p.id === this.editingProduct.id);
          if (target) {
            editAppliedSuccessfully = true;
            target.name = name;
            target.code = code;
            target.category = category;
            target.categories = categories;
            target.subcategory = subcategory;
            target.subcategories = subcategories;
            target.subsubcategory = subsubcategory;
            target.subsubcategories = subsubcategories;
            target.brand = brand;
            target.description = description;
            target.tags = tags;
            target.isSpecial = isSpecial;
            target.specialOfferType = specialOfferType;
            target.specialOfferText = specialOfferText;
            target.specialOfferLabel = isSpecial ? this.getSpecialOfferLabel(specialOfferType, specialOfferText) : "";
            target.images = images;
            target.pdfs = this.uploadedPdfs || [];
            target.pdf = null;
            target.specs = specs;
            target.columns = this.currentColumns; // Save columns schema
            target.variants = variants;
          }
        });
        if (!saved) return;
        if (!editAppliedSuccessfully) {
          // The product to edit was no longer in CONFIG.products — without
          // this guard the form would silently show "успешно" while none of the
          // edits were actually applied. Tell the user the truth and re-render
          // so they can find the product again.
          Admin.notify("Продуктът, който редактирате, вече не съществува в каталога. Презаредете страницата и опитайте отново.");
          this.resetProductFormState();
          this.render();
          return;
        }
        this.resetProductFormState();
        Admin.notify("Продуктът е успешно редактиран и обновен на сайта!");
      } else {
        // CREATE MODE
        // NOTE: ids must start with "prod-" / "custom-" or be all-digits,
        // otherwise filterOldItems() in config.js treats them as legacy items
        // and strips them on load (they would vanish from the public site).
        const slug = name.toLowerCase()
          .replace(/[^а-яa-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .replace(/[а-я]/g, m => {
            const cyr = "абвгдежзийклмнопрстуфхцчшщъьюя";
            const lat = ["a","b","v","g","d","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sht","a","y","yu","ya"];
            const idx = cyr.indexOf(m);
            return idx > -1 ? lat[idx] : m;
          });
        const id = `prod-${slug}`;

        if (CONFIG.products.some(p => p.id === id)) {
          Admin.notify("Продукт с това име вече съществува!");
          return;
        }

        const newProduct = {
          id,
          code,
          name,
          category,
          categories,
          subcategory,
          subcategories,
          subsubcategory,
          subsubcategories,
          brand,
          rating: 5.0,
          reviewsCount: 1,
          views: 12,
          inStock: true,
          isSpecial,
          specialOfferType,
          specialOfferText,
          specialOfferLabel: isSpecial ? this.getSpecialOfferLabel(specialOfferType, specialOfferText) : "",
          tags,
          description,
          specs,
          images,
          pdfs: this.uploadedPdfs || [],
          columns: this.currentColumns, // Save columns schema
          variants
        };

        const saved = await this.persistProductChanges(() => {
          CONFIG.products.push(newProduct);
        });
        if (!saved) return;
        this.resetProductFormState();
        Admin.notify("Продуктът е успешно добавен!");
      }

      this.propagateStateChanges();
      this.render();
    } catch (error) {
      console.error("Error submitting product:", error);
      Admin.notify("Възникна грешка при запазване: " + error.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  },

  async deleteProduct(productId) {
    if (!(await this.confirmDialog("Наистина ли искате да изтриете този продукт?"))) return;

    // Ensure the full catalog is loaded so the post-delete save writes the
    // complete product list (minus this one) back to the database.
    if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
      try {
        await CONFIG.loadCatalog();
      } catch (e) {
        console.warn("Catalog not fully loaded before delete", e);
      }
    }

    const product = CONFIG.products.find(p => p.id === productId);

    // Archive the product in Convex BEFORE removing it, so it can always be
    // recovered. If the archive fails, abort the deletion to avoid data loss.
    if (product && typeof HydroluxBackend !== "undefined") {
      try {
        const res = await HydroluxBackend.archiveProduct(product, "deleted");
        if (!res || res.ok === false) throw new Error(res && res.error);
      } catch (err) {
        console.error("Неуспешно архивиране на продукта", err);
        const proceed = await this.confirmDialog(
          "Продуктът не можа да бъде архивиран в Convex (няма връзка?).\n" +
          "Ако продължите, изтриването НЯМА да може да се възстанови.\n\n" +
          "Сигурни ли сте, че искате да изтриете без архив?",
          { confirmText: "Изтрий без архив", cancelText: "Отказ" }
        );
        if (!proceed) return;
      }
    }

    if (this.editingProduct && this.editingProduct.id === productId) {
      this.resetProductFormState();
    }

    const previousProducts = JSON.stringify(CONFIG.products);
    const previousDeletedProducts = JSON.stringify([...CONFIG.deletedProductIds]);

    try {
      await CONFIG.deleteProduct(productId);
      Admin.notify("Продуктът е изтрит успешно!");
    } catch (err) {
      CONFIG.products = JSON.parse(previousProducts);
      CONFIG.deletedProductIds = new Set(JSON.parse(previousDeletedProducts));
      localStorage.setItem("hydrolux_products", previousProducts);
      localStorage.setItem("hydrolux_deleted_product_ids", previousDeletedProducts);
      console.error("Failed to delete product", err);
      Admin.notify("Неуспешно изтриване: " + err.message);
      return;
    }

    this.propagateStateChanges();
    this.render();
  },

  async moveProduct(prodId, direction) {
    const catId = this.filterCategory;
    if (!catId) {
      Admin.notify("Моля, филтрирайте продуктите по категория първо, за да можете да ги подреждате!");
      return;
    }

    const filtered = CONFIG.products.filter(p => {
      const productCats = p.categories || (p.category ? [p.category] : []);
      return productCats.includes(catId);
    });

    const idxFiltered = filtered.findIndex(p => p.id === prodId);
    if (idxFiltered === -1) return;

    let targetIdx = -1;
    let otherIdx = -1;

    if (direction === 'up' && idxFiltered > 0) {
      const targetProd = filtered[idxFiltered];
      const prevProd = filtered[idxFiltered - 1];
      targetIdx = CONFIG.products.findIndex(p => p.id === targetProd.id);
      otherIdx = CONFIG.products.findIndex(p => p.id === prevProd.id);
    } else if (direction === 'down' && idxFiltered < filtered.length - 1) {
      const targetProd = filtered[idxFiltered];
      const nextProd = filtered[idxFiltered + 1];
      targetIdx = CONFIG.products.findIndex(p => p.id === targetProd.id);
      otherIdx = CONFIG.products.findIndex(p => p.id === nextProd.id);
    }

    if (targetIdx !== -1 && otherIdx !== -1) {
      const previousProducts = JSON.stringify(CONFIG.products);
      
      const temp = CONFIG.products[targetIdx];
      CONFIG.products[targetIdx] = CONFIG.products[otherIdx];
      CONFIG.products[otherIdx] = temp;

      try {
        await CONFIG.saveState();
        this.propagateStateChanges();
        this.filterProductsList();
      } catch (err) {
        CONFIG.products = JSON.parse(previousProducts);
        localStorage.setItem("hydrolux_products", previousProducts);
        console.error("Failed to save product reordering", err);
        Admin.notify("Грешка при пренареждане: " + err.message);
        this.filterProductsList();
      }
    }
  },

  // ==========================================================================
  // CATEGORIES WORKSPACE
  // ==========================================================================
  renderCategoriesWorkspace() {
    const categories = CONFIG.categories;

    let categoryRows = categories.map(c => {
      const productCount = CONFIG.products.filter(p => {
        const productCats = p.categories || (p.category ? [p.category] : []);
        return productCats.includes(c.id);
      }).length;
      return `
        <tr class="admin-table-row category-draggable-row" draggable="true" data-id="${c.id}" style="cursor: move;">
          <td data-label="Икона"><span style="font-size: 1.4rem; display: flex; align-items: center; gap: 8px;"><span style="color: #94a3b8; cursor: move; user-select: none; font-size: 0.95rem;">⠿</span> ${c.icon || '📦'}</span></td>
          <td data-label="Име"><strong>${c.name}</strong></td>
          <td data-label="Брой продукти"><span class="admin-badge admin-badge-success">${productCount} продукта</span></td>
          <td data-label="Действия">
            <div class="admin-actions-cell">
              <button class="btn-admin-action btn-admin-edit" onclick="Admin.startEditCategory('${c.id}')">✏️ Редактирай</button>
              <button class="btn-admin-action btn-admin-danger" onclick="Admin.deleteCategory('${c.id}')">✕ Изтрий</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (categories.length === 0) {
      categoryRows = `<tr><td colspan="4" class="text-center text-muted" style="padding: 30px; color: #94a3b8;">Няма въведени категории.</td></tr>`;
    }

    const isEditing = this.editingCategory !== null;

    return `
      <div class="admin-header-row">
        <h2>Управление на Категории</h2>
        <span class="admin-badge admin-badge-category">${categories.length} Категории</span>
      </div>

      ${CONFIG.isStateLoadingFromServer === false && CONFIG.isStateLoadedFromServer === false ? `
        <div style="background-color: #fee2e2; border: 1.5px solid #ef4444; color: #b91c1c; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; font-size: 0.9rem; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
          <span style="display: flex; align-items: center; gap: 6px;">⚠️ Базата данни от сървъра (Convex) не е заредена успешно. Всички промени са блокирани, за да се избегне загуба на данни.</span>
          <span style="font-size: 0.8rem; font-family: monospace; color: #991b1b; margin-top: 4px;">Детайли за грешката: ${CONFIG.serverLoadError || 'Failed to fetch (възможно е разширение като Adblock / Brave Shield да блокира достъпа)'}</span>
          <span style="font-size: 0.85rem; font-weight: 500; margin-top: 4px;">👉 Моля, спрете Adblock / Brave Shield за този сайт, проверете връзката си и презаредете страницата.</span>
        </div>
      ` : ''}

      <!-- Add or Edit Category Form -->
      <div class="admin-form-card">
        <h4>${isEditing ? `✏️ Редактиране на категория: "${this.editingCategory.name}"` : '📁 Добавяне на нова категория'}</h4>
        <form onsubmit="Admin.handleCategorySubmit(event)">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Име на категорията <span class="text-accent">*</span></label>
              <input type="text" id="cat-name" class="form-control" value="${isEditing ? this.editingCategory.name : ''}" placeholder="напр. Маркучи за пара" required>
            </div>
            <div class="form-group">
              <label>Икона / Емоджи (не е задължително)</label>
              <input type="text" id="cat-icon" class="form-control" value="${isEditing ? (this.editingCategory.icon || '') : ''}" placeholder="напр. 🌡️ (по подразбиране е 📦)">
            </div>
          </div>
          
          <div class="form-group" style="margin-top: 15px;">
            <label style="display: block; margin-bottom: 8px;">Снимка на категорията</label>
            <img id="cat-image-preview" src="${isEditing ? (this.editingCategory.image || '') : ''}" style="max-width: 120px; max-height: 120px; display: ${isEditing && this.editingCategory.image ? 'block' : 'none'}; border-radius: 8px; border: 1.5px solid #cbd5e1; margin-bottom: 12px; object-fit: cover; aspect-ratio: 1/1;">
            
            <input type="hidden" id="cat-image" value="${isEditing ? (this.editingCategory.image || '') : ''}">
            <input type="file" id="cat-file-input" accept="image/*" onchange="Admin.handleCategoryFileSelect(event)" style="display: none;">
            
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('cat-file-input').click()">📁 Избери от устройството</button>
            </div>
            <p class="font-xs text-muted mt-5" style="margin-bottom: 0;">* Изберете снимка от Вашето устройство за тази категория.</p>
          </div>
          
          <!-- SUB-CATEGORIES SECTION -->
          <div class="form-group" style="margin-top: 15px; border-top: 1px dashed var(--border-light); padding-top: 15px;">
            <label style="font-weight: 800; color: var(--primary); display: block; margin-bottom: 8px;">🏷️ Подкатегории</label>
            <div id="admin-subcategories-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              <!-- Populated dynamically -->
            </div>
            <div style="display: flex; gap: 8px; align-items: center; max-width: 500px;">
              <input type="text" id="new-subcategory-name" class="form-control" placeholder="Име на подкатегория (напр. 1SN / 2SN маркучи)">
              <button type="button" class="btn btn-secondary" onclick="Admin.addSubcategory()" style="white-space: nowrap;">Добави</button>
            </div>
          </div>

          <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button type="submit" class="btn btn-accent">💾 ${isEditing ? 'Запази промените' : 'Запази Категорията'}</button>
            ${isEditing ? `
              <button type="button" class="btn btn-secondary" onclick="Admin.cancelCategoryEdit()">Отказ</button>
            ` : ''}
          </div>
        </form>
      </div>

      <!-- Current Categories Table (No ID column, clean design) -->
      <h3 style="font-weight: 800; font-size: 1.2rem; margin-top: 35px; margin-bottom: 15px; color: #1e293b;">Налични категории</h3>
      <div style="overflow-x: auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th width="40">Икона</th>
              <th>Име</th>
              <th>Брой продукти</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRows}
          </tbody>
        </table>
      </div>
    `;
  },

  startEditCategory(catId) {
    const cat = CONFIG.categories.find(c => c.id === catId);
    if (cat) {
      this.editingCategory = cat;
      this.tempSubcategories = cat.subcategories ? cat.subcategories.map(s => ({
        ...s,
        subcategories: s.subcategories ? s.subcategories.map(ss => ({ ...ss })) : []
      })) : [];
      this.render();
      window.scrollTo({ top: 150, behavior: "smooth" });
    }
  },

  cancelCategoryEdit() {
    this.editingCategory = null;
    this.tempSubcategories = [];
    this.render();
  },

  async handleCategorySubmit(event) {
    event.preventDefault();

    // saveState() also writes the product list, so ensure the full catalog is
    // loaded before persisting category changes.
    if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
      try { await CONFIG.loadCatalog(); } catch (e) { console.warn("Catalog not loaded before category save", e); }
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    let originalBtnHtml = "";
    if (submitBtn) {
      submitBtn.disabled = true;
      originalBtnHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = "⏳ Записване...";
    }

    try {
      const name = document.getElementById("cat-name").value.trim();
      const icon = document.getElementById("cat-icon").value.trim() || "📦";
      const image = document.getElementById("cat-image").value.trim();

      if (this.editingCategory) {
        // EDIT MODE
        const previousCategories = JSON.stringify(CONFIG.categories);
        const target = CONFIG.categories.find(c => c.id === this.editingCategory.id);
        if (target) {
          target.name = name;
          target.icon = icon;
          target.image = image;
          target.subcategories = this.tempSubcategories || [];
        }
        try {
          await CONFIG.saveState();
          this.editingCategory = null;
          this.tempSubcategories = [];
          Admin.notify("Категорията е успешно актуализирана!");
        } catch (err) {
          CONFIG.categories = JSON.parse(previousCategories);
          localStorage.setItem("hydrolux_categories", previousCategories);
          console.error("Failed to save category changes", err);
          Admin.notify("Категорията не беше записана: " + err.message);
          return;
        }
      } else {
        // CREATE MODE
        // NOTE: the id MUST start with "custom-" (or be all-digits) — otherwise
        // filterOldItems() treats it as a legacy item and strips it on the next
        // load, making the new category silently disappear.
        const slug = name.toLowerCase()
          .replace(/[^а-яa-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .replace(/[а-я]/g, m => {
            const cyr = "абвгдежзийклмнопрстуфхцчшщъьюя";
            const lat = ["a","b","v","g","d","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sht","a","y","yu","ya"];
            const idx = cyr.indexOf(m);
            return idx > -1 ? lat[idx] : m;
          });
        const id = `custom-${slug}`;

        if (CONFIG.categories.some(c => c.id === id)) {
          Admin.notify("Категория с това име вече съществува!");
          return;
        }

        const newCategory = {
          id,
          name,
          icon,
          image,
          subcategories: this.tempSubcategories || []
        };

        try {
          await CONFIG.addCategory(newCategory);
          this.tempSubcategories = [];
          Admin.notify("Категорията е успешно създадена!");
        } catch (err) {
          CONFIG.categories = CONFIG.categories.filter(c => c.id !== newCategory.id);
          localStorage.setItem("hydrolux_categories", JSON.stringify(CONFIG.categories));
          console.error("Failed to add category", err);
          Admin.notify("Категорията не беше създадена: " + err.message);
          return;
        }
      }

      this.propagateStateChanges();
      this.render();
    } catch (err) {
      console.error("Category submit error", err);
      Admin.notify("Грешка при запис на категорията: " + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  },

  async deleteCategory(categoryId) {
    if (await this.confirmDialog("Наистина ли искате да изтриете тази категория? Всички продукти в нея няма да имат свързана категория.")) {
      // saveState() also persists the product list, so make sure the full
      // catalog is loaded first to avoid writing a partial product set.
      if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
        try { await CONFIG.loadCatalog(); } catch (e) { console.warn("Catalog not loaded before category delete", e); }
      }

      const previousCategories = JSON.stringify(CONFIG.categories);
      const previousDeletedCategories = JSON.stringify([...CONFIG.deletedCategoryIds]);

      try {
        await CONFIG.deleteCategory(categoryId);
        Admin.notify("Категорията е изтрита успешно!");
      } catch (err) {
        CONFIG.categories = JSON.parse(previousCategories);
        CONFIG.deletedCategoryIds = new Set(JSON.parse(previousDeletedCategories));
        localStorage.setItem("hydrolux_categories", previousCategories);
        localStorage.setItem("hydrolux_deleted_category_ids", previousDeletedCategories);
        console.error("Failed to delete category", err);
        Admin.notify("Неуспешно изтриване: " + err.message);
        return;
      }

      this.propagateStateChanges();
      this.render();
    }
  },

  async handleCategoryFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (typeof Cart !== 'undefined' && typeof Cart.showToast === 'function') {
      Cart.showToast("Обработване и качване на снимката...");
    }

    try {
      const compressedDataUrl = await this.compressImageFile(file);
      if (!compressedDataUrl) return;

      const mimeMatch = compressedDataUrl.match(/^data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/webp";
      const extension = mimeType.split("/")[1] || "webp";

      const blob = this.base64ToBlob(compressedDataUrl, mimeType);
      if (blob) {
        const fileObj = new File([blob], `cat_${Date.now()}.${extension}`, { type: mimeType });
        const res = await HydroluxBackend.uploadPdf(fileObj);
        if (res && res.ok && res.url) {
          const catImageInput = document.getElementById("cat-image");
          if (catImageInput) catImageInput.value = res.url;

          const preview = document.getElementById("cat-image-preview");
          if (preview) {
            preview.src = res.url;
            preview.style.display = "block";
          }

          if (typeof Cart !== 'undefined' && typeof Cart.showToast === 'function') {
            Cart.showToast("Снимката е качена успешно!");
          }
        } else {
          throw new Error("Неуспешно качване на сървъра.");
        }
      }
    } catch (err) {
      console.error("Category image upload failed", err);
      Admin.notify("Не успяхме да качим снимката на категорията. Моля опитайте отново.");
    }
  },



  // Propagates active memory/localStorage state to all visible SPA views instantly
  // Safe to call from both the SPA (#admin) and standalone (/admin) page
  propagateStateChanges() {
    if (typeof App !== 'undefined') {
      if (typeof App.renderQuickCategories === 'function') App.renderQuickCategories();
      if (typeof App.renderSearchCategories === 'function') App.renderSearchCategories();
      if (typeof App.renderFeaturedProductsHome === 'function') App.renderFeaturedProductsHome();
      if (typeof App.renderHeaderNavDropdown === 'function') App.renderHeaderNavDropdown();
      if (typeof App.renderHomeCategories === 'function') App.renderHomeCategories();
    }
    if (typeof Catalog !== 'undefined') {
      if (typeof Catalog.renderSidebar === 'function') Catalog.renderSidebar();
      if (typeof Catalog.applyFiltersAndRender === 'function') Catalog.applyFiltersAndRender();
    }
  },

  loadTemplates() {
    const raw = localStorage.getItem("hydrolux_table_templates");
    if (raw) {
      try {
        this.savedTemplates = JSON.parse(raw);
        if (!Array.isArray(this.savedTemplates)) {
          this.savedTemplates = [];
        }
      } catch (e) {
        this.savedTemplates = [];
      }
    } else {
      this.savedTemplates = [
        {
          id: "standard",
          name: "Стандартен (Маркучи)",
          columns: [
            { key: "code", label: "Код на размер" },
            { key: "innerDb", label: "Вътр. ø (мм)" },
            { key: "inch", label: "Инч" },
            { key: "outerDb", label: "Външ. ø (мм)" },
            { key: "pressure", label: "Работно нал.(Bar)" },
            { key: "bend", label: "Радиус огъване(мм)" },
            { key: "weight", label: "Тегло кг/м" },
            { key: "rollLength", label: "Дълж. ролка(м)" },
            { key: "priceEur", label: "Цена EUR (€)" }
          ]
        }
      ];
      localStorage.setItem("hydrolux_table_templates", JSON.stringify(this.savedTemplates));
    }
  },

  async saveTemplates() {
    const previousTemplates = localStorage.getItem("hydrolux_table_templates");
    localStorage.setItem("hydrolux_table_templates", JSON.stringify(this.savedTemplates));
    if (typeof HydroluxBackend !== "undefined") {
      try {
        await HydroluxBackend.saveStateValue("tableTemplates", this.savedTemplates);
      } catch (err) {
        if (previousTemplates !== null) {
          localStorage.setItem("hydrolux_table_templates", previousTemplates);
          this.savedTemplates = JSON.parse(previousTemplates);
        }
        console.error("Convex template sync failed", err);
        Admin.notify("Шаблоните не бяха записани в Convex: " + err.message);
      }
    }
  },

  cloneColumns(columns) {
    return (columns || []).map(c => ({ ...c }));
  },

  saveTemplate(name) {
    if (!name || !name.trim()) {
      Admin.notify("Моля въведете име на шаблона!");
      return;
    }
    this.loadTemplates();
    if (!this.currentColumns || this.currentColumns.length === 0) {
      Admin.notify("Няма колони за запазване!");
      return;
    }
    const id = "tpl_" + Date.now();
    this.savedTemplates.push({
      id,
      name: name.trim(),
      columns: this.cloneColumns(this.currentColumns)
    });
    this.saveTemplates();
    this.templatesPanelOpen = true;
    Admin.notify(`Шаблонът "${name}" е запазен успешно!`);
    this.refreshVariantsTable();
  },

  renameTemplate(id, name) {
    const nextName = name ? name.trim() : "";
    if (!nextName) {
      Admin.notify("Моля въведете име на шаблона!");
      return;
    }

    this.loadTemplates();
    const tpl = this.savedTemplates.find(t => t.id === id);
    if (!tpl) return;

    tpl.name = nextName;
    this.saveTemplates();
    this.templatesPanelOpen = true;
    Admin.notify("Името на шаблона е обновено!");
    this.refreshVariantsTable();
  },

  updateTemplateFromCurrentColumns(id) {
    if (!this.currentColumns || this.currentColumns.length === 0) {
      Admin.notify("Няма колони за обновяване на шаблона!");
      return;
    }

    this.loadTemplates();
    const tpl = this.savedTemplates.find(t => t.id === id);
    if (!tpl) return;

    tpl.columns = this.cloneColumns(this.currentColumns);
    this.saveTemplates();
    this.templatesPanelOpen = true;
    Admin.notify(`Шаблонът "${tpl.name}" е обновен с текущите колони!`);
    this.refreshVariantsTable();
  },

  async deleteTemplate(id) {
    this.loadTemplates();
    const tpl = this.savedTemplates.find(t => t.id === id);
    if (!tpl) return;

    if (!(await this.confirmDialog(`Сигурни ли сте, че искате да изтриете шаблона "${tpl.name}"?`))) {
      return;
    }

    this.savedTemplates = this.savedTemplates.filter(t => t.id !== id);
    this.saveTemplates();
    this.templatesPanelOpen = true;
    this.refreshVariantsTable();
  },

  loadTemplateById(id) {
    if (!id) return;
    this.loadTemplates();
    const tpl = this.savedTemplates.find(t => t.id === id);
    if (tpl) {
      this.currentColumns = this.cloneColumns(tpl.columns);
      const activeVariants = this.collectVariantsFromDOM() || [];
      if (activeVariants.length === 0) {
        const newRow = {};
        this.currentColumns.forEach(c => {
          newRow[c.key] = "";
        });
        activeVariants.push(newRow);
      }
      this.templatesPanelOpen = true;
      this.refreshVariantsTable(activeVariants);
    }
  },

  handleProductCategoryChange(catIds, selectedSubIds = [], selectedSubSubIds = []) {
    if (!Array.isArray(catIds)) {
      catIds = catIds ? [catIds] : [];
    }
    if (!Array.isArray(selectedSubIds)) {
      selectedSubIds = selectedSubIds ? [selectedSubIds] : [];
    }
    if (!Array.isArray(selectedSubSubIds)) {
      selectedSubSubIds = selectedSubSubIds ? [selectedSubSubIds] : [];
    }

    const subGroup = document.getElementById("prod-subcategory-group");
    const subContainer = document.getElementById("prod-subcategories-checkboxes");
    if (!subGroup || !subContainer) return;

    // Gather all subcategories from all selected categories
    let allSubs = [];
    catIds.forEach(catId => {
      const cat = CONFIG.categories.find(c => c.id === catId);
      if (cat && cat.subcategories) {
        cat.subcategories.forEach(sub => {
          const displayLabel = catIds.length > 1 ? `${cat.name} > ${sub.name}` : sub.name;
          allSubs.push({ ...sub, displayLabel, parentCatId: cat.id });
        });
      }
    });

    if (allSubs.length > 0) {
      subGroup.style.display = "block";
      subContainer.innerHTML = allSubs.map(sub => {
        const isChecked = selectedSubIds.includes(sub.id);
        return `
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.85rem; cursor: pointer; color: var(--text-dark); margin: 0;">
            <input type="checkbox" name="prod-subcategories" value="${sub.id}" data-parent-cat="${sub.parentCatId}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent);">
            <span>${sub.displayLabel}</span>
          </label>
        `;
      }).join("");

      const subCheckboxes = subContainer.querySelectorAll('input[name="prod-subcategories"]');
      subCheckboxes.forEach(cb => {
        cb.addEventListener("change", () => {
          const selectedSubs = Array.from(subContainer.querySelectorAll('input[name="prod-subcategories"]:checked')).map(scb => scb.value);
          this.handleProductSubcategoryChange(catIds, selectedSubs, selectedSubSubIds);
        });
      });

      const currentSelectedSubs = Array.from(subContainer.querySelectorAll('input[name="prod-subcategories"]:checked')).map(scb => scb.value);
      this.handleProductSubcategoryChange(catIds, currentSelectedSubs, selectedSubSubIds);
    } else {
      subGroup.style.display = "none";
      subContainer.innerHTML = "";
      this.handleProductSubcategoryChange(catIds, [], []);
    }
  },

  handleProductSubcategoryChange(catIds, subIds, selectedSubSubIds = []) {
    if (!Array.isArray(catIds)) {
      catIds = catIds ? [catIds] : [];
    }
    if (!Array.isArray(subIds)) {
      subIds = subIds ? [subIds] : [];
    }
    if (!Array.isArray(selectedSubSubIds)) {
      selectedSubSubIds = selectedSubSubIds ? [selectedSubSubIds] : [];
    }

    const subsubGroup = document.getElementById("prod-subsubcategory-group");
    const subsubContainer = document.getElementById("prod-subsubcategories-checkboxes");
    if (!subsubGroup || !subsubContainer) return;

    if (catIds.length === 0 || subIds.length === 0) {
      subsubGroup.style.display = "none";
      subsubContainer.innerHTML = "";
      return;
    }

    let allSubSubs = [];
    catIds.forEach(catId => {
      const cat = CONFIG.categories.find(c => c.id === catId);
      if (cat && cat.subcategories) {
        cat.subcategories.forEach(sub => {
          if (subIds.includes(sub.id) && sub.subcategories) {
            sub.subcategories.forEach(subsub => {
              const displayLabel = subIds.length > 1 
                ? `${sub.name} > ${subsub.name}` 
                : subsub.name;
              allSubSubs.push({ ...subsub, displayLabel, parentSubId: sub.id });
            });
          }
        });
      }
    });

    if (allSubSubs.length > 0) {
      subsubGroup.style.display = "block";
      subsubContainer.innerHTML = allSubSubs.map(subsub => {
        const isChecked = selectedSubSubIds.includes(subsub.id);
        return `
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.85rem; cursor: pointer; color: var(--text-dark); margin: 0;">
            <input type="checkbox" name="prod-subsubcategories" value="${subsub.id}" data-parent-sub="${subsub.parentSubId}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent);">
            <span>${subsub.displayLabel}</span>
          </label>
        `;
      }).join("");
    } else {
      subsubGroup.style.display = "none";
      subsubContainer.innerHTML = "";
    }
  },

  renderSubcategoriesList() {
    const listContainer = document.getElementById("admin-subcategories-list");
    if (!listContainer) return;

    if (!this.tempSubcategories || this.tempSubcategories.length === 0) {
      listContainer.innerHTML = `<span class="text-muted font-xs">Няма въведени подкатегории.</span>`;
      return;
    }

    listContainer.innerHTML = this.tempSubcategories.map(sub => {
      const nestedList = (sub.subcategories || []).map(ss => `
        <div class="subsubcategory-draggable-item" draggable="true" data-sub-id="${sub.id}" data-id="${ss.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8rem; margin-bottom: 4px; cursor: move; user-select: none;">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #94a3b8; cursor: move; user-select: none;">⠿</span>
            📄 ${ss.name}
          </span>
          <button type="button" class="btn-icon-danger" onclick="Admin.deleteSubSubcategory('${sub.id}', '${ss.id}')" style="width: 20px; height: 20px; font-size: 0.75rem; line-height: 1; padding: 0; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
      `).join("");

      return `
        <div class="subcategory-draggable-item" draggable="true" data-id="${sub.id}" style="background-color: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 10px; border: 1px solid #cbd5e1; cursor: move;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 700; font-size: 0.9rem; color: var(--primary); display: flex; align-items: center; gap: 6px;">
              <span style="color: #94a3b8; cursor: move; user-select: none;">⠿</span>
              📂 ${sub.name}
            </span>
            <button type="button" class="btn-admin-action btn-admin-danger" onclick="Admin.deleteSubcategory('${sub.id}')" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px;">✕ Изтрий</button>
          </div>
          
          <!-- Nested Sub-subcategories list -->
          <div style="padding-left: 15px; border-left: 2px solid var(--accent); margin-bottom: 8px;">
            <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Под-подкатегории:</div>
            <div class="subsubcategory-list-container" data-sub-id="${sub.id}">
              ${nestedList || `<span class="text-muted font-xs" style="font-style: italic; display: block; margin-bottom: 4px;">Няма въведени под-подкатегории.</span>`}
            </div>
          </div>

          <!-- Add Nested Sub-subcategory form -->
          <div style="display: flex; gap: 8px; align-items: center; padding-left: 15px;">
            <input type="text" id="new-subsubcategory-name-${sub.id}" class="form-control" placeholder="Име на под-подкатегория" style="height: 30px; font-size: 0.8rem; padding: 4px 8px; margin: 0;">
            <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addSubSubcategory('${sub.id}')" style="white-space: nowrap; height: 30px; font-size: 0.75rem; padding: 0 12px;">+ Добави</button>
          </div>
        </div>
      `;
    }).join("");

    this.setupSubcategoriesDragAndDrop();
    this.setupSubSubcategoriesDragAndDrop();
  },

  setupCategoriesDragAndDrop() {
    const tableBody = document.querySelector(".admin-table tbody");
    if (!tableBody || this.activeTab !== "categories") return;

    let draggedItem = null;

    tableBody.querySelectorAll(".category-draggable-row").forEach(item => {
      // 1. Mouse Drag (Desktop)
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        
        if (item !== draggedItem) {
          const children = Array.from(tableBody.children);
          const draggedIdx = children.indexOf(draggedItem);
          const targetIdx = children.indexOf(item);

          if (draggedIdx < targetIdx) {
            tableBody.insertBefore(draggedItem, item.nextSibling);
          } else {
            tableBody.insertBefore(draggedItem, item);
          }
        }
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        
        // Sync order with CONFIG.categories
        const reorderedCats = [];
        Array.from(tableBody.children).forEach(row => {
          const catId = row.getAttribute("data-id");
          const catObj = CONFIG.categories.find(c => c.id === catId);
          if (catObj) reorderedCats.push(catObj);
        });

        CONFIG.categories = reorderedCats;
        CONFIG.saveState();
        Admin.propagateStateChanges();
        Admin.render();
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });

      // 2. Touch Drag (Mobile)
      item.addEventListener("touchstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
      }, { passive: true });

      item.addEventListener("touchmove", (e) => {
        if (!draggedItem) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        
        // Disable pointer events temporarily on the dragged item
        const origPE = draggedItem.style.pointerEvents;
        draggedItem.style.pointerEvents = "none";
        
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        draggedItem.style.pointerEvents = origPE;
        
        if (!element) return;

        const hoverItem = element.closest(".category-draggable-row");
        if (hoverItem && hoverItem !== draggedItem && hoverItem.parentNode === tableBody) {
          const children = Array.from(tableBody.children);
          const draggedIdx = children.indexOf(draggedItem);
          const hoverIdx = children.indexOf(hoverItem);

          if (draggedIdx < hoverIdx) {
            tableBody.insertBefore(draggedItem, hoverItem.nextSibling);
          } else {
            tableBody.insertBefore(draggedItem, hoverItem);
          }
        }
      }, { passive: false });

      item.addEventListener("touchend", () => {
        if (!draggedItem) return;
        item.classList.remove("dragging");

        // Sync order with CONFIG.categories
        const reorderedCats = [];
        Array.from(tableBody.children).forEach(row => {
          const catId = row.getAttribute("data-id");
          const catObj = CONFIG.categories.find(c => c.id === catId);
          if (catObj) reorderedCats.push(catObj);
        });

        CONFIG.categories = reorderedCats;
        CONFIG.saveState();
        Admin.propagateStateChanges();
        Admin.render();
      });
    });
  },

  setupProductsDragAndDrop() {
    const tableBody = document.querySelector("#admin-products-list-table tbody");
    if (!tableBody || this.activeTab !== "products") return;

    let draggedItem = null;

    tableBody.querySelectorAll(".product-draggable-row").forEach(item => {
      // 1. Mouse Drag (Desktop)
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (item !== draggedItem) {
          const children = Array.from(tableBody.children);
          const draggedIdx = children.indexOf(draggedItem);
          const targetIdx = children.indexOf(item);

          if (draggedIdx < targetIdx) {
            tableBody.insertBefore(draggedItem, item.nextSibling);
          } else {
            tableBody.insertBefore(draggedItem, item);
          }
        }
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        this.syncProductOrder(tableBody);
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });

      // 2. Touch Drag (Mobile)
      item.addEventListener("touchstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
      }, { passive: true });

      item.addEventListener("touchmove", (e) => {
        if (!draggedItem) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        
        // Disable pointer events temporarily on the dragged item
        const origPE = draggedItem.style.pointerEvents;
        draggedItem.style.pointerEvents = "none";
        
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        draggedItem.style.pointerEvents = origPE;
        
        if (!element) return;

        const hoverItem = element.closest(".product-draggable-row");
        if (hoverItem && hoverItem !== draggedItem && hoverItem.parentNode === tableBody) {
          const children = Array.from(tableBody.children);
          const draggedIdx = children.indexOf(draggedItem);
          const hoverIdx = children.indexOf(hoverItem);

          if (draggedIdx < hoverIdx) {
            tableBody.insertBefore(draggedItem, hoverItem.nextSibling);
          } else {
            tableBody.insertBefore(draggedItem, hoverItem);
          }
        }
      }, { passive: false });

      item.addEventListener("touchend", () => {
        if (!draggedItem) return;
        item.classList.remove("dragging");

        // Sync order with CONFIG.products
        this.syncProductOrder(tableBody);
      });
    });
  },

  syncProductOrder(tableBody) {
    const reorderedIds = Array.from(tableBody.querySelectorAll(".product-draggable-row"))
      .map(row => row.getAttribute("data-id"));
    
    if (reorderedIds.length < 2) return;

    // Find the global indices of these products in CONFIG.products
    const indexMap = reorderedIds.map(id => {
      return {
        id: id,
        globalIdx: CONFIG.products.findIndex(p => p.id === id)
      };
    });

    // Extract the global indices and sort them ascending
    const globalIndices = indexMap
      .map(item => item.globalIdx)
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (globalIndices.length !== reorderedIds.length) {
      console.warn("Some products were not found in global list");
      return;
    }

    // Store previous products state for rollback in case of error
    const previousProducts = JSON.stringify(CONFIG.products);

    // Create a copy of the products array to modify
    const newProducts = [...CONFIG.products];

    // Place the reordered products at the sorted global indices
    reorderedIds.forEach((id, index) => {
      const targetGlobalIndex = globalIndices[index];
      const product = CONFIG.products.find(p => p.id === id);
      newProducts[targetGlobalIndex] = product;
    });

    CONFIG.products = newProducts;

    CONFIG.saveState()
      .then(() => {
        this.propagateStateChanges();
        this.filterProductsList();
      })
      .catch(err => {
        CONFIG.products = JSON.parse(previousProducts);
        localStorage.setItem("hydrolux_products", previousProducts);
        console.error("Failed to save product drag-and-drop reordering", err);
        Admin.notify("Грешка при пренареждане: " + err.message);
        this.filterProductsList();
      });
  },

  setupSubcategoriesDragAndDrop() {
    const listContainer = document.getElementById("admin-subcategories-list");
    if (!listContainer || this.activeTab !== "categories" || !this.tempSubcategories) return;

    let draggedItem = null;

    listContainer.querySelectorAll(".subcategory-draggable-item").forEach(item => {
      // 1. Mouse Drag (Desktop)
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        if (item !== draggedItem) {
          const children = Array.from(listContainer.children);
          const draggedIdx = children.indexOf(draggedItem);
          const targetIdx = children.indexOf(item);

          if (draggedIdx < targetIdx) {
            listContainer.insertBefore(draggedItem, item.nextSibling);
          } else {
            listContainer.insertBefore(draggedItem, item);
          }

          // Sync order with tempSubcategories
          const reorderedSubs = [];
          Array.from(listContainer.children).forEach(node => {
            const subId = node.getAttribute("data-id");
            const subObj = Admin.tempSubcategories.find(s => s.id === subId);
            if (subObj) reorderedSubs.push(subObj);
          });

          Admin.tempSubcategories = reorderedSubs;
          Admin.renderSubcategoriesList();
        }
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });

      // 2. Touch Drag (Mobile)
      item.addEventListener("touchstart", (e) => {
        draggedItem = item;
        item.classList.add("dragging");
      }, { passive: true });

      item.addEventListener("touchmove", (e) => {
        if (!draggedItem) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        
        // Disable pointer events temporarily on the dragged item
        const origPE = draggedItem.style.pointerEvents;
        draggedItem.style.pointerEvents = "none";
        
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        draggedItem.style.pointerEvents = origPE;
        
        if (!element) return;

        const hoverItem = element.closest(".subcategory-draggable-item");
        if (hoverItem && hoverItem !== draggedItem && hoverItem.parentNode === listContainer) {
          const children = Array.from(listContainer.children);
          const draggedIdx = children.indexOf(draggedItem);
          const hoverIdx = children.indexOf(hoverItem);

          if (draggedIdx < hoverIdx) {
            listContainer.insertBefore(draggedItem, hoverItem.nextSibling);
          } else {
            listContainer.insertBefore(draggedItem, hoverItem);
          }
        }
      }, { passive: false });

      item.addEventListener("touchend", () => {
        if (!draggedItem) return;
        item.classList.remove("dragging");

        // Sync order with tempSubcategories
        const reorderedSubs = [];
        Array.from(listContainer.children).forEach(node => {
          const subId = node.getAttribute("data-id");
          const subObj = Admin.tempSubcategories.find(s => s.id === subId);
          if (subObj) reorderedSubs.push(subObj);
        });

        Admin.tempSubcategories = reorderedSubs;
        Admin.renderSubcategoriesList();
      });
    });
  },

  setupSubSubcategoriesDragAndDrop() {
    const listContainers = document.querySelectorAll(".subsubcategory-list-container");
    if (listContainers.length === 0 || this.activeTab !== "categories" || !this.tempSubcategories) return;

    let draggedItem = null;

    listContainers.forEach(container => {
      const subId = container.getAttribute("data-sub-id");
      const subObj = this.tempSubcategories.find(s => s.id === subId);
      if (!subObj) return;

      container.querySelectorAll(".subsubcategory-draggable-item").forEach(item => {
        // 1. Mouse Drag (Desktop)
        item.addEventListener("dragstart", (e) => {
          draggedItem = item;
          item.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });

        item.addEventListener("drop", (e) => {
          e.preventDefault();
          if (item !== draggedItem) {
            const children = Array.from(container.children);
            const draggedIdx = children.indexOf(draggedItem);
            const targetIdx = children.indexOf(item);

            if (draggedIdx < targetIdx) {
              container.insertBefore(draggedItem, item.nextSibling);
            } else {
              container.insertBefore(draggedItem, item);
            }

            // Sync order with tempSubcategories' sub.subcategories
            const reorderedSubSubs = [];
            Array.from(container.children).forEach(node => {
              const subsubId = node.getAttribute("data-id");
              const subsubObj = subObj.subcategories.find(ss => ss.id === subsubId);
              if (subsubObj) reorderedSubSubs.push(subsubObj);
            });

            subObj.subcategories = reorderedSubSubs;
            Admin.renderSubcategoriesList();
          }
        });

        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
          draggedItem = null;
        });

        // 2. Touch Drag (Mobile)
        item.addEventListener("touchstart", (e) => {
          draggedItem = item;
          item.classList.add("dragging");
        }, { passive: true });

        item.addEventListener("touchmove", (e) => {
          if (!draggedItem) return;
          if (e.cancelable) e.preventDefault();

          const touch = e.touches[0];
          
          // Disable pointer events temporarily on the dragged item
          const origPE = draggedItem.style.pointerEvents;
          draggedItem.style.pointerEvents = "none";
          
          const element = document.elementFromPoint(touch.clientX, touch.clientY);
          
          draggedItem.style.pointerEvents = origPE;
          
          if (!element) return;

          const hoverItem = element.closest(".subsubcategory-draggable-item");
          if (hoverItem && hoverItem !== draggedItem && hoverItem.parentNode === container) {
            const children = Array.from(container.children);
            const draggedIdx = children.indexOf(draggedItem);
            const hoverIdx = children.indexOf(hoverItem);

            if (draggedIdx < hoverIdx) {
              container.insertBefore(draggedItem, hoverItem.nextSibling);
            } else {
              container.insertBefore(draggedItem, hoverItem);
            }
          }
        }, { passive: false });

        item.addEventListener("touchend", () => {
          if (!draggedItem) return;
          item.classList.remove("dragging");

          // Sync order with tempSubcategories' sub.subcategories
          const reorderedSubSubs = [];
          Array.from(container.children).forEach(node => {
            const subsubId = node.getAttribute("data-id");
            const subsubObj = subObj.subcategories.find(ss => ss.id === subsubId);
            if (subsubObj) reorderedSubSubs.push(subsubObj);
          });

          subObj.subcategories = reorderedSubSubs;
          Admin.renderSubcategoriesList();
        });
      });
    });
  },

  addSubcategory() {
    const input = document.getElementById("new-subcategory-name");
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    
    // Generate a unique ID
    const subId = "sub-" + name.toLowerCase()
      .replace(/[^а-яa-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .replace(/[а-я]/g, m => {
        const cyr = "абвгдежзийклмнопрстуфхцчшщъьюя";
        const lat = ["a","b","v","g","d","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sht","a","y","yu","ya"];
        const idx = cyr.indexOf(m);
        return idx > -1 ? lat[idx] : m;
      }) + "-" + Math.floor(1000 + Math.random() * 9000);

    if (!this.tempSubcategories) this.tempSubcategories = [];
    this.tempSubcategories.push({ id: subId, name, subcategories: [] });
    input.value = "";
    this.renderSubcategoriesList();
  },

  deleteSubcategory(subId) {
    if (this.tempSubcategories) {
      this.tempSubcategories = this.tempSubcategories.filter(s => s.id !== subId);
      this.renderSubcategoriesList();
    }
  },

  addSubSubcategory(subId) {
    const input = document.getElementById(`new-subsubcategory-name-${subId}`);
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    // Find the subcategory
    const sub = this.tempSubcategories.find(s => s.id === subId);
    if (!sub) return;

    // Generate unique ID for sub-subcategory
    const subsubId = "subsub-" + name.toLowerCase()
      .replace(/[^а-яa-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .replace(/[а-я]/g, m => {
        const cyr = "абвгдежзийклмнопрстуфхцчшщъьюя";
        const lat = ["a","b","v","g","d","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","ts","ch","sh","sht","a","y","yu","ya"];
        const idx = cyr.indexOf(m);
        return idx > -1 ? lat[idx] : m;
      }) + "-" + Math.floor(1000 + Math.random() * 9000);

    if (!sub.subcategories) sub.subcategories = [];
    sub.subcategories.push({ id: subsubId, name });
    input.value = "";
    this.renderSubcategoriesList();
  },

  deleteSubSubcategory(subId, subsubId) {
    const sub = this.tempSubcategories.find(s => s.id === subId);
    if (sub && sub.subcategories) {
      sub.subcategories = sub.subcategories.filter(ss => ss.id !== subsubId);
      this.renderSubcategoriesList();
    }
  },

  // ==========================================================================
  // ORDERS WORKSPACE & BLACKLIST SYSTEM
  // ==========================================================================
  allOrders: [],
  filteredOrders: [],

  renderOrdersWorkspace() {
    return `
      <div class="admin-header-row">
        <h2>📋 Поръчки на клиенти</h2>
      </div>

      <!-- Statistics bar -->
      <div class="orders-summary-bar" id="admin-orders-summary-bar">
        <!-- Dynamic Summary stats -->
      </div>

      <!-- Filters Panel -->
      <div class="admin-form-card" style="padding: 20px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr auto; gap: 15px; align-items: end; flex-wrap: wrap;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; width: 100%;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: #475569;">Търсене на поръчка</label>
              <input type="text" id="order-search-input" class="form-control" placeholder="Търсене по име, телефон, имейл или номер на поръчка..." oninput="Admin.applyOrdersFilter()">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: #475569;">Филтър по статус</label>
              <select id="order-status-filter" class="form-control" onchange="Admin.applyOrdersFilter()">
                <option value="">Всички статуси</option>
                <option value="new">Нови</option>
                <option value="paid">Платени</option>
                <option value="shipped">Изпратени</option>
                <option value="completed">Завършени</option>
                <option value="unclaimed">Непотърсени</option>
                <option value="canceled">Анулирани</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem; font-weight: 700; color: #475569;">Период</label>
              <select id="order-date-filter" class="form-control" onchange="Admin.applyOrdersFilter()">
                <option value="today" selected>Днес</option>
                <option value="yesterday">Вчера</option>
                <option value="last7">Последните 7 дни</option>
                <option value="last14">Последните 14 дни</option>
                <option value="last30">Последните 30 дни</option>
                <option value="max">Максимум (всички)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- List of Orders -->
      <div id="admin-orders-list">
        <div style="text-align: center; padding: 40px;">
          <div class="mypos-spinner" style="width: 40px; height: 40px; border: 4px solid rgba(15, 61, 112, 0.1); border-top-color: #0f3d70; border-radius: 50%; animation: mypos-spin 1s infinite linear; margin: 0 auto 15px;"></div>
          <p>Зареждане на поръчките...</p>
        </div>
      </div>
    `;
  },

  async loadOrders() {
    const listEl = document.getElementById("admin-orders-list");
    
    try {
      const response = await HydroluxBackend.getAllOrders();
      if (response && response.ok) {
        this.allOrders = response.orders || [];
        this.filteredOrders = [...this.allOrders];
        // Automatically apply the default "today" filter on load
        this.applyOrdersFilter();
      } else {
        throw new Error("Неуспешно изтегляне на поръчките");
      }
    } catch (err) {
      console.error(err);
      if (listEl) {
        listEl.innerHTML = `<div class="alert alert-danger" style="text-align: center; padding: 20px;">Грешка при зареждане на поръчките: ${err.message}</div>`;
      }
    }
  },

  renderOrdersSummary(startTs = 0, endTs = Infinity) {
    const summaryBar = document.getElementById("admin-orders-summary-bar");
    if (!summaryBar) return;

    // Filter orders within the selected time window
    const periodOrders = this.allOrders.filter(o => o.createdAt >= startTs && o.createdAt <= endTs);
    // Exclude canceled orders from the turnover calculation
    const activePeriodOrders = periodOrders.filter(o => o.status !== "canceled");
    
    const count = periodOrders.length;
    let totalEur = 0;
    activePeriodOrders.forEach(o => {
      totalEur += parseFloat(o.totals.eur) || 0;
    });
    const totalBgn = totalEur * 1.95583;

    summaryBar.innerHTML = `
      <div class="orders-summary-card" style="border-left: 4px solid var(--primary);">
        <div class="orders-summary-icon" style="color: var(--primary); background-color: rgba(13, 110, 253, 0.1);">📦</div>
        <div class="orders-summary-info">
          <h5>Поръчки за периода</h5>
          <strong>${count}</strong>
        </div>
      </div>
      <div class="orders-summary-card" style="border-left: 4px solid #10b981;">
        <div class="orders-summary-icon" style="color: #10b981; background-color: #f0fdf4;">💰</div>
        <div class="orders-summary-info">
          <h5>Оборот за периода</h5>
          <strong>${totalEur.toFixed(2)} € (${totalBgn.toFixed(2)} лв.)</strong>
        </div>
      </div>
    `;
  },

  renderOrdersList() {
    const listEl = document.getElementById("admin-orders-list");
    if (!listEl) return;

    if (this.filteredOrders.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px; background-color: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px;">
          <h4 style="color: #64748b; margin-bottom: 0;">Няма намерени поръчки за избрания период.</h4>
        </div>
      `;
      return;
    }

    // Build blacklist sets (from orders marked as unclaimed)
    const blacklistedPhones = new Set();
    const blacklistedEmails = new Set();
    
    this.allOrders.forEach(o => {
      if (o.status === "unclaimed") {
        if (o.customer && o.customer.phone) {
          blacklistedPhones.add(this.normalizePhone(o.customer.phone));
        }
        if (o.customer && o.customer.email) {
          blacklistedEmails.add(o.customer.email.toLowerCase().trim());
        }
      }
    });

    listEl.innerHTML = this.filteredOrders.map(order => {
      const normalPhone = order.customer ? this.normalizePhone(order.customer.phone) : "";
      const emailLower = order.customer && order.customer.email ? order.customer.email.toLowerCase().trim() : "";
      
      // Determine blacklist status: match email or normalized phone (last 9 digits)
      let isBlacklisted = false;
      if (order.status !== "unclaimed") {
        if (normalPhone && Array.from(blacklistedPhones).some(p => p.slice(-9) === normalPhone.slice(-9))) {
          isBlacklisted = true;
        }
        if (emailLower && blacklistedEmails.has(emailLower)) {
          isBlacklisted = true;
        }
      }

      const statusMap = {
        new: { label: "Нова", class: "order-badge-new" },
        paid: { label: "Платена", class: "order-badge-paid" },
        shipped: { label: "Изпратена", class: "order-badge-shipped" },
        completed: { label: "Завършена", class: "order-badge-completed" },
        unclaimed: { label: "Непотърсена пратка", class: "order-badge-unclaimed" },
        canceled: { label: "Анулирана", class: "order-badge-canceled" }
      };
      
      const statusDetails = statusMap[order.status] || { label: order.status, class: "order-badge-canceled" };

      const deliveryMap = {
        address: "🚚 До личен / служебен адрес",
        office: "🏢 До офис на Еконт",
        shop: "🏬 Вземане от магазина (гр. Монтана)"
      };
      const deliveryText = deliveryMap[order.delivery] || order.delivery;

      const paymentMap = {
        cod: "💵 Наложен платеж",
        bank: "🏦 Банков превод",
        card: "💳 С карта (myPOS)"
      };
      const paymentText = paymentMap[order.paymentMethod] || order.paymentMethod;

      let invoiceHtml = "";
      if (order.invoiceDetails) {
        invoiceHtml = `
          <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 15px; margin-top: 12px; font-size: 0.8rem; text-align: left;">
            <strong style="color: #1e293b;">🧾 Данни за фактура:</strong><br>
            Фирма: <strong>${this.escapeHtml(order.invoiceDetails.companyName)}</strong><br>
            ЕИК/Булстат: <strong>${this.escapeHtml(order.invoiceDetails.bulstat)}</strong><br>
            МОЛ: <strong>${this.escapeHtml(order.invoiceDetails.mol)}</strong><br>
            Адрес: <strong>${this.escapeHtml(order.invoiceDetails.address)}</strong>
          </div>
        `;
      }

      let warningHtml = "";
      if (isBlacklisted) {
        warningHtml = `
          <div class="blacklist-warn-glow" style="background: linear-gradient(135deg, #fffbeb, #fee2e2); border: 2px solid #ef4444; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.3rem;">⚠️</span>
            <div style="color: #b91c1c; font-weight: 800; font-size: 0.85rem; text-align: left;">
              ВНИМАНИЕ: Клиентът има предходна НЕПОТЪРСЕНА пратка в системата!
            </div>
          </div>
        `;
      }

      const orderDate = new Date(order.createdAt).toLocaleString('bg-BG');
      const bgnTotal = order.totals.eur * 1.95583;

      return `
        <div class="order-card" style="text-align: left;">
          ${warningHtml}
          
          <div class="order-card-header">
            <div class="order-number-date">
              <h4 style="margin: 0; font-size: 1.15rem; font-weight: 800;">Поръчка #${this.escapeHtml(order.orderNumber)}</h4>
              <span style="font-size: 0.8rem; color: #64748b;">Създадена на: ${orderDate}</span>
            </div>

            <div class="order-card-status-controls">
              <span class="order-badge ${statusDetails.class}">${this.escapeHtml(statusDetails.label)}</span>

              <select class="form-control" style="width: auto; height: 36px; padding: 4px 10px; font-size: 0.85rem; margin-bottom: 0;" onchange="Admin.changeOrderStatus('${this.escapeAttr(order.orderNumber)}', this.value)">
                <option value="new" ${order.status === 'new' ? 'selected' : ''}>Нова</option>
                <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Платена</option>
                <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Изпратена</option>
                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завършена</option>
                <option value="unclaimed" ${order.status === 'unclaimed' ? 'selected' : ''}>Непотърсена пратка</option>
                <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Анулирана</option>
              </select>
            </div>
          </div>
          
          <div class="order-grid-details">
            <!-- Customer column -->
            <div class="order-details-col order-customer-info">
              <h5>👤 Детайли за клиента & Доставка</h5>
              <p>Клиент: <strong>${this.escapeHtml(order.customer.name)}</strong></p>
              <p>Телефон: <strong>${this.escapeHtml(order.customer.phone)}</strong></p>
              <p>Имейл: <strong>${this.escapeHtml(order.customer.email)}</strong></p>
              <p style="margin-top: 10px;">Доставка: <strong>${this.escapeHtml(deliveryText)}</strong></p>
              ${order.delivery !== "shop" ? `<p>Град / ПК: <strong>${this.escapeHtml(order.city)} (ПК: ${this.escapeHtml(order.postcode)})</strong></p>` : ""}
              ${order.delivery !== "shop" ? `<p>Адрес/Офис: <strong>${this.escapeHtml(order.address)}</strong></p>` : ""}
              <p style="margin-top: 10px;">Плащане: <strong>${this.escapeHtml(paymentText)}</strong></p>
              ${invoiceHtml}
            </div>
            
            <!-- Items column -->
            <div class="order-details-col">
              <h5>📦 Поръчани артикули</h5>
              <table class="order-items-table">
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th style="text-align: center;">Кол.</th>
                    <th style="text-align: right;">Цена</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => {
                    const productObj = (typeof CONFIG !== "undefined" && CONFIG.products) ? CONFIG.products.find(p => p.id === item.productId) : null;
                    const baseCode = productObj ? productObj.code : "";
                    let codeHtml = "";

                    // Resolve the specific code for this item (using code, variantCode, or baseCode fallback)
                    const itemCode = item.code || ((item.variantCode && item.variantCode !== "CUSTOM-SPEC") ? item.variantCode : baseCode);

                    if (itemCode) {
                      if (baseCode && baseCode !== itemCode) {
                        codeHtml = `<div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">Код: <strong>${this.escapeHtml(itemCode)}</strong> <span style="color: #94a3b8; font-size: 0.7rem;">(Базов: ${this.escapeHtml(baseCode)})</span></div>`;
                      } else {
                        codeHtml = `<div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">Код: <strong>${this.escapeHtml(itemCode)}</strong></div>`;
                      }
                    } else if (item.isCustomHose) {
                      codeHtml = `<div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">Код: <strong>ИНДИВИДУАЛЕН</strong></div>`;
                    } else {
                      codeHtml = `<div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">Код: <strong>${this.escapeHtml(item.productId || "Няма код")}</strong></div>`;
                    }

                    return `
                      <tr>
                        <td style="text-align: left;">
                          <strong>${this.escapeHtml(item.name)}</strong>
                          ${codeHtml}
                          ${item.variantName ? `<div style="font-size: 0.75rem; color: #64748b;">${this.escapeHtml(item.variantName)}</div>` : ""}
                          ${item.specsText ? `<div style="font-size: 0.7rem; color: #94a3b8;">${this.escapeHtml(item.specsText)}</div>` : ""}
                        </td>
                        <td style="text-align: center;">${this.escapeHtml(item.quantity)}</td>
                        <td style="text-align: right;">${formatPrice(item.priceEur * item.quantity).eur}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
              
              <div style="margin-top: 15px; text-align: right; font-size: 1.05rem;">
                <span style="color: #64748b; font-size: 0.85rem;">ОБЩО С ДДС:</span>
                <strong style="color: var(--primary); font-weight: 800;">
                  ${order.totals.eur.toFixed(2)} € (${bgnTotal.toFixed(2)} лв.)
                </strong>
              </div>

              ${order.notes ? `
                <div style="background-color: #fffbeb; border-left: 3px solid #f59e0b; padding: 10px 12px; margin-top: 15px; font-size: 0.8rem; border-radius: 0 6px 6px 0; text-align: left;">
                  <strong>Бележка:</strong> ${this.escapeHtml(order.notes)}
                </div>
              ` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  applyOrdersFilter() {
    const searchInput = document.getElementById("order-search-input");
    const statusSelect = document.getElementById("order-status-filter");
    const dateSelect = document.getElementById("order-date-filter");
    
    if (!searchInput || !statusSelect || !dateSelect) return;

    const query = searchInput.value.toLowerCase().trim();
    const status = statusSelect.value;
    const dateRange = dateSelect.value;

    // Determine timestamp range
    let startTs = 0;
    let endTs = Infinity;
    const now = Date.now();

    if (dateRange === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      startTs = start.getTime();
      endTs = now;
    } else if (dateRange === "yesterday") {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      startTs = start.getTime();
      
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      endTs = end.getTime();
    } else if (dateRange === "last7") {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      startTs = start.getTime();
      endTs = now;
    } else if (dateRange === "last14") {
      const start = new Date();
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      startTs = start.getTime();
      endTs = now;
    } else if (dateRange === "last30") {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      startTs = start.getTime();
      endTs = now;
    }

    // Dynamic metrics summary update for the selected period
    this.renderOrdersSummary(startTs, endTs);

    this.filteredOrders = this.allOrders.filter(order => {
      // 1. Search filter
      let searchMatch = true;
      if (query) {
        searchMatch = 
          order.orderNumber.toLowerCase().includes(query) ||
          (order.customer.name && order.customer.name.toLowerCase().includes(query)) ||
          (order.customer.phone && order.customer.phone.toLowerCase().includes(query)) ||
          (order.customer.email && order.customer.email.toLowerCase().includes(query)) ||
          (order.city && order.city.toLowerCase().includes(query)) ||
          (order.address && order.address.toLowerCase().includes(query));
      }

      // 2. Status filter
      let statusMatch = true;
      if (status) {
        statusMatch = order.status === status;
      }

      // 3. Date filter
      const dateMatch = order.createdAt >= startTs && order.createdAt <= endTs;

      return searchMatch && statusMatch && dateMatch;
    });

    this.renderOrdersList();
  },

  async changeOrderStatus(orderNumber, newStatus) {
    try {
      const response = await HydroluxBackend.updateOrderStatus(orderNumber, newStatus);
      if (response && response.ok) {
        // Update local object
        const order = this.allOrders.find(o => o.orderNumber === orderNumber);
        if (order) order.status = newStatus;
        
        this.showToast("Статусът е актуализиран успешно!");
        this.applyOrdersFilter();
      } else {
        throw new Error(response.error || "Неуспешна актуализация");
      }
    } catch (err) {
      console.error(err);
      Admin.notify(`Грешка при актуализиране на статуса: ${err.message}`);
    }
  },

  showToast(message) {
    if (typeof Cart !== "undefined" && Cart.showToast) {
      Cart.showToast(message);
      return;
    }

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

  normalizePhone(phone) {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
  },

  activeCrimpingTab: "hoses",

  switchCrimpingTab(subTab) {
    this.activeCrimpingTab = subTab;
    this.render();
  },

  renderCrimpingWorkspace() {
    const options = CONFIG.builderOptions || { hoseTypes: [], sizes: [], fittings: [], sleeves: [] };
    
    // Sub-tab links
    const tabsHtml = `
      <div class="admin-header-row">
        <div>
          <h2>⚙️ Настройки за кримпване (Асемблиране на маркучи)</h2>
        </div>
      </div>
      
      <div class="crimping-tabs" style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 2px solid var(--border-light); padding-bottom: 12px; flex-wrap: wrap;">
        <button type="button" class="btn btn-admin-action ${this.activeCrimpingTab === 'hoses' ? 'btn-admin-edit' : 'btn-secondary'}" onclick="Admin.switchCrimpingTab('hoses')" style="padding: 10px 18px; border-radius: 8px; font-weight: 700; ${this.activeCrimpingTab === 'hoses' ? 'background-color: var(--accent); color: white;' : ''}">🩺 Типове маркучи</button>
        <button type="button" class="btn btn-admin-action ${this.activeCrimpingTab === 'sizes' ? 'btn-admin-edit' : 'btn-secondary'}" onclick="Admin.switchCrimpingTab('sizes')" style="padding: 10px 18px; border-radius: 8px; font-weight: 700; ${this.activeCrimpingTab === 'sizes' ? 'background-color: var(--accent); color: white;' : ''}">📏 Размери (DN)</button>
        <button type="button" class="btn btn-admin-action ${this.activeCrimpingTab === 'fittings' ? 'btn-admin-edit' : 'btn-secondary'}" onclick="Admin.switchCrimpingTab('fittings')" style="padding: 10px 18px; border-radius: 8px; font-weight: 700; ${this.activeCrimpingTab === 'fittings' ? 'background-color: var(--accent); color: white;' : ''}">🔩 Накрайници</button>
        <button type="button" class="btn btn-admin-action ${this.activeCrimpingTab === 'sleeves' ? 'btn-admin-edit' : 'btn-secondary'}" onclick="Admin.switchCrimpingTab('sleeves')" style="padding: 10px 18px; border-radius: 8px; font-weight: 700; ${this.activeCrimpingTab === 'sleeves' ? 'background-color: var(--accent); color: white;' : ''}">🛡️ Ръкави</button>
      </div>
    `;

    // 1. Hoses Tab Content
    const sizes = options.sizes || [];
    const hosesHtml = `
      <div id="crimping-tab-hoses" class="crimping-tab-content" style="display: ${this.activeCrimpingTab === 'hoses' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0; font-weight: 800; color: #1e293b;">🩺 Управление на маркучи</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addCrimpingHoseRow()">＋ Нов маркуч</button>
        </div>
        <div class="admin-table-responsive" style="max-width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-light); margin-bottom: 20px;">
          <table class="admin-table" style="min-width: 800px; font-size: 0.85rem; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 12px; width: 120px;">ID (код)</th>
                <th style="padding: 12px; min-width: 200px;">Име на маркуч</th>
                <th style="padding: 12px; width: 110px;">Базова цена (€/м)</th>
                ${sizes.map(s => {
                  const sizeShortName = s.name.split(" ")[0];
                  return `<th style="padding: 12px; width: 90px; text-align: center;">${sizeShortName}<br><span style="font-size: 0.7rem; color: #94a3b8; font-weight: 500;">Налягане (Bar)</span></th>`;
                }).join("")}
                <th style="padding: 12px; width: 70px; text-align: center;">Действие</th>
              </tr>
            </thead>
            <tbody id="crimping-hoses-tbody">
              ${(options.hoseTypes || []).map((h, hIdx) => `
                <tr class="crimping-hose-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px;"><input type="text" class="form-control hose-id" value="${h.id}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="text" class="form-control hose-name" value="${this.escapeAttr(h.name)}" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="number" step="0.01" class="form-control hose-price" value="${h.basePriceEurPerMeter}" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
                  ${sizes.map(s => {
                    const sizeShortName = s.name.split(" ")[0];
                    const press = h.pressures && h.pressures[sizeShortName] !== undefined ? h.pressures[sizeShortName] : 0;
                    return `
                      <td style="padding: 8px; text-align: center;">
                        <input type="number" class="form-control text-center hose-pressure-input" data-size-key="${sizeShortName}" value="${press}" style="padding: 6px; font-size: 0.8rem; height: 34px; width: 75px; margin: 0 auto; color: #2be885; font-weight: 700; background-color: #061c36;">
                      </td>
                    `;
                  }).join("")}
                  <td style="padding: 8px; text-align: center;">
                    <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 2. Sizes Tab Content
    const sizesHtml = `
      <div id="crimping-tab-sizes" class="crimping-tab-content" style="display: ${this.activeCrimpingTab === 'sizes' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0; font-weight: 800; color: #1e293b;">📏 Управление на диаметри/размери</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addCrimpingSizeRow()">＋ Нов размер</button>
        </div>
        <div class="admin-table-responsive" style="max-width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-light); margin-bottom: 20px;">
          <table class="admin-table" style="min-width: 600px; font-size: 0.85rem; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 12px; width: 150px;">ID (напр. 1/4)</th>
                <th style="padding: 12px;">Име / Диаметър (напр. 1/4" (DN06))</th>
                <th style="padding: 12px; width: 180px;">Оскъпяващ Фактор (1.0 - 3.0)</th>
                <th style="padding: 12px; width: 80px; text-align: center;">Действие</th>
              </tr>
            </thead>
            <tbody id="crimping-sizes-tbody">
              ${(options.sizes || []).map((s, sIdx) => `
                <tr class="crimping-size-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px;"><input type="text" class="form-control size-id" value="${s.id}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="text" class="form-control size-name" value="${this.escapeAttr(s.name)}" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="number" step="0.01" class="form-control size-factor" value="${s.factor}" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
                  <td style="padding: 8px; text-align: center;">
                    <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 3. Fittings Tab Content
    const fittingsHtml = `
      <div id="crimping-tab-fittings" class="crimping-tab-content" style="display: ${this.activeCrimpingTab === 'fittings' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0; font-weight: 800; color: #1e293b;">🔩 Управление на накрайници</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addCrimpingFittingRow()">＋ Нов накрайник</button>
        </div>
        <div class="admin-table-responsive" style="max-width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-light); margin-bottom: 20px;">
          <table class="admin-table" style="min-width: 900px; font-size: 0.85rem; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 12px; width: 140px;">ID</th>
                <th style="padding: 12px; min-width: 160px;">Име на накрайник</th>
                <th style="padding: 12px; width: 130px;">Категория</th>
                <th style="padding: 12px; width: 110px;">Форма/Ъгъл</th>
                ${sizes.map(s => {
                  const sizeShortName = s.name.split(" ")[0];
                  return `<th style="padding: 12px; width: 85px; text-align: center;">${sizeShortName}<br><span style="font-size: 0.7rem; color: #94a3b8; font-weight: 500;">Цена (€)</span></th>`;
                }).join("")}
                <th style="padding: 12px; width: 90px; text-align: center;">Икона</th>
                <th style="padding: 12px; width: 70px; text-align: center;">Действие</th>
              </tr>
            </thead>
            <tbody id="crimping-fittings-tbody">
              ${(options.fittings || []).map((f, fIdx) => {
                const angle = f.angle || "straight";
                return `
                  <tr class="crimping-fitting-row" style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px;"><input type="text" class="form-control fitting-id" value="${f.id}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
                    <td style="padding: 8px;"><input type="text" class="form-control fitting-name" value="${this.escapeAttr(f.name)}" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                    <td style="padding: 8px;"><input type="text" class="form-control fitting-category" value="${this.escapeAttr(f.category || '')}" placeholder="напр. DKOL Метрични" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                    <td style="padding: 8px;">
                      <select class="form-control fitting-angle" style="padding: 6px; font-size: 0.8rem; height: 34px;">
                        <option value="straight" ${angle === 'straight' ? 'selected' : ''}>Прав</option>
                        <option value="90" ${angle === '90' ? 'selected' : ''}>90° коляно</option>
                        <option value="45" ${angle === '45' ? 'selected' : ''}>45° коляно</option>
                        <option value="none" ${angle === 'none' ? 'selected' : ''}>Без</option>
                      </select>
                    </td>
                    ${sizes.map(s => {
                      const price = f.prices && f.prices[s.id] !== undefined ? f.prices[s.id] : "";
                      return `
                        <td style="padding: 8px; text-align: center;">
                          <input type="number" step="0.01" class="form-control text-center fitting-price-input" data-size-id="${s.id}" value="${price}" style="padding: 6px; font-size: 0.8rem; height: 34px; width: 75px; margin: 0 auto; font-weight: 700;">
                        </td>
                      `;
                    }).join("")}
                    <td style="padding: 8px;"><input type="text" class="form-control text-center fitting-icon" value="${this.escapeAttr(f.icon || '')}" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                    <td style="padding: 8px; text-align: center;">
                      <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 4. Sleeves Tab Content
    const sleevesHtml = `
      <div id="crimping-tab-sleeves" class="crimping-tab-content" style="display: ${this.activeCrimpingTab === 'sleeves' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0; font-weight: 800; color: #1e293b;">🛡️ Управление на предпазни ръкави</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="Admin.addCrimpingSleeveRow()">＋ Нов ръкав</button>
        </div>
        <div class="admin-table-responsive" style="max-width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-light); margin-bottom: 20px;">
          <table class="admin-table" style="min-width: 600px; font-size: 0.85rem; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="padding: 12px; width: 180px;">ID</th>
                <th style="padding: 12px;">Име на предпазен ръкав</th>
                <th style="padding: 12px; width: 140px;">Цена EUR/м (€)</th>
                <th style="padding: 12px; width: 80px; text-align: center;">Действие</th>
              </tr>
            </thead>
            <tbody id="crimping-sleeves-tbody">
              ${(options.sleeves || []).map((sl, slIdx) => `
                <tr class="crimping-sleeve-row" style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 8px;"><input type="text" class="form-control sleeve-id" value="${sl.id}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="text" class="form-control sleeve-name" value="${this.escapeAttr(sl.name)}" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
                  <td style="padding: 8px;"><input type="number" step="0.01" class="form-control sleeve-price" value="${sl.priceEurPerMeter !== undefined ? sl.priceEurPerMeter : 0}" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
                  <td style="padding: 8px; text-align: center;">
                    <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 5. Actions row
    const actionsHtml = `
      <div class="divider" style="margin-top: 30px; margin-bottom: 20px;"></div>
      <div style="display: flex; gap: 12px;">
        <button type="button" class="btn btn-accent btn-large" style="min-width: 240px;" onclick="Admin.saveCrimpingSettings()">💾 Запази настройките за кримпване</button>
      </div>
    `;

    return tabsHtml + hosesHtml + sizesHtml + fittingsHtml + sleevesHtml + actionsHtml;
  },

  addCrimpingHoseRow() {
    const tbody = document.getElementById("crimping-hoses-tbody");
    if (!tbody) return;
    const sizes = CONFIG.builderOptions.sizes || [];
    const newHoseId = "hose-" + Date.now();
    const tr = document.createElement("tr");
    tr.className = "crimping-hose-row";
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 8px;"><input type="text" class="form-control hose-id" value="${newHoseId}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
      <td style="padding: 8px;"><input type="text" class="form-control hose-name" value="Нов маркуч" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px;"><input type="number" step="0.01" class="form-control hose-price" value="1.00" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
      ${sizes.map(s => {
        const sizeShortName = s.name.split(" ")[0];
        return `
          <td style="padding: 8px; text-align: center;">
            <input type="number" class="form-control text-center hose-pressure-input" data-size-key="${sizeShortName}" value="0" style="padding: 6px; font-size: 0.8rem; height: 34px; width: 75px; margin: 0 auto; color: #2be885; font-weight: 700; background-color: #061c36;">
          </td>
        `;
      }).join("")}
      <td style="padding: 8px; text-align: center;">
        <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  addCrimpingSizeRow() {
    const tbody = document.getElementById("crimping-sizes-tbody");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.className = "crimping-size-row";
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 8px;"><input type="text" class="form-control size-id" value="new-size" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
      <td style="padding: 8px;"><input type="text" class="form-control size-name" value="Размер диаметър" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px;"><input type="number" step="0.01" class="form-control size-factor" value="1.0" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
      <td style="padding: 8px; text-align: center;">
        <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  addCrimpingFittingRow() {
    const tbody = document.getElementById("crimping-fittings-tbody");
    if (!tbody) return;
    const sizes = CONFIG.builderOptions.sizes || [];
    const tr = document.createElement("tr");
    tr.className = "crimping-fitting-row";
    tr.style.borderBottom = "1px solid #f1f5f9";
    
    const sizePricesHtml = sizes.map(s => `
      <td style="padding: 8px; text-align: center;">
        <input type="number" step="0.01" class="form-control text-center fitting-price-input" data-size-id="${s.id}" value="0.00" style="padding: 6px; font-size: 0.8rem; height: 34px; width: 75px; margin: 0 auto; font-weight: 700;">
      </td>
    `).join("");

    tr.innerHTML = `
      <td style="padding: 8px;"><input type="text" class="form-control fitting-id" value="fitting-${Date.now()}" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
      <td style="padding: 8px;"><input type="text" class="form-control fitting-name" value="Нов накрайник" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px;"><input type="text" class="form-control fitting-category" value="Нова категория" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px;">
        <select class="form-control fitting-angle" style="padding: 6px; font-size: 0.8rem; height: 34px;">
          <option value="straight">Прав</option>
          <option value="90">90° коляно</option>
          <option value="45">45° коляно</option>
          <option value="none">Без</option>
        </select>
      </td>
      ${sizePricesHtml}
      <td style="padding: 8px;"><input type="text" class="form-control text-center fitting-icon" value="➡️" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px; text-align: center;">
        <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  addCrimpingSleeveRow() {
    const tbody = document.getElementById("crimping-sleeves-tbody");
    if (!tbody) return;
    const tr = document.createElement("tr");
    tr.className = "crimping-sleeve-row";
    tr.style.borderBottom = "1px solid #f1f5f9";
    tr.innerHTML = `
      <td style="padding: 8px;"><input type="text" class="form-control sleeve-id" value="new-sleeve" style="padding: 6px; font-size: 0.8rem; font-weight: 700; height: 34px;"></td>
      <td style="padding: 8px;"><input type="text" class="form-control sleeve-name" value="Нов ръкав" style="padding: 6px; font-size: 0.8rem; height: 34px;"></td>
      <td style="padding: 8px;"><input type="number" step="0.01" class="form-control sleeve-price" value="0.00" style="padding: 6px; font-size: 0.8rem; height: 34px; font-weight: 700;"></td>
      <td style="padding: 8px; text-align: center;">
        <button type="button" class="btn-icon-danger" style="width: 32px; height: 32px; font-size: 0.9rem; margin: 0 auto;" onclick="this.parentElement.parentElement.remove()">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  async saveCrimpingSettings() {
    // Collect Hoses
    const hoseTypes = [];
    document.querySelectorAll(".crimping-hose-row").forEach(row => {
      const id = row.querySelector(".hose-id").value.trim();
      const name = row.querySelector(".hose-name").value.trim();
      const basePriceEurPerMeter = parseFloat(row.querySelector(".hose-price").value) || 0.0;
      
      const pressures = {};
      row.querySelectorAll(".hose-pressure-input").forEach(input => {
        const sizeKey = input.getAttribute("data-size-key");
        const pressureVal = parseInt(input.value) || 0;
        pressures[sizeKey] = pressureVal;
      });
      
      if (id && name) {
        hoseTypes.push({ id, name, basePriceEurPerMeter, pressures });
      }
    });

    // Collect Sizes
    const sizes = [];
    document.querySelectorAll(".crimping-size-row").forEach(row => {
      const id = row.querySelector(".size-id").value.trim();
      const name = row.querySelector(".size-name").value.trim();
      const factor = parseFloat(row.querySelector(".size-factor").value) || 1.0;
      if (id && name) {
        sizes.push({ id, name, factor });
      }
    });

    // Collect Fittings
    const fittings = [];
    document.querySelectorAll(".crimping-fitting-row").forEach(row => {
      const id = row.querySelector(".fitting-id").value.trim();
      const name = row.querySelector(".fitting-name").value.trim();
      const category = row.querySelector(".fitting-category").value.trim() || "Други";
      const angle = row.querySelector(".fitting-angle").value || "straight";
      const icon = row.querySelector(".fitting-icon").value.trim() || "➡️";
      
      const prices = {};
      row.querySelectorAll(".fitting-price-input").forEach(input => {
        const sizeId = input.getAttribute("data-size-id");
        const priceVal = parseFloat(input.value);
        if (!isNaN(priceVal)) {
          prices[sizeId] = priceVal;
        }
      });

      if (id && name) {
        fittings.push({ id, name, category, angle, prices, icon });
      }
    });

    // Collect Sleeves
    const sleeves = [];
    document.querySelectorAll(".crimping-sleeve-row").forEach(row => {
      const id = row.querySelector(".sleeve-id").value.trim();
      const name = row.querySelector(".sleeve-name").value.trim();
      const priceEurPerMeter = parseFloat(row.querySelector(".sleeve-price").value) || 0.0;
      if (id && name) {
        sleeves.push({ id, name, priceEurPerMeter });
      }
    });

    // Construct the options object
    const newOptions = {
      hoseTypes,
      sizes,
      fittings,
      sleeves
    };

    CONFIG.builderOptions = newOptions;

    try {
      await CONFIG.saveState();
      
      // Sync instantly to HoseBuilder
      if (typeof HoseBuilder !== "undefined") {
        HoseBuilder.init();
        HoseBuilder.render();
      }

      this.showToast("Настройките за кримпване са запазени успешно и се отразяват моментално на сайта!");
      
      // Re-render admin too to sync dynamic pressures layout if sizes changed
      this.render();
    } catch (err) {
      console.error(err);
      Admin.notify("Възникна грешка при запазване: " + err.message);
    }
  },

  normalizePhone(phone) {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
  },

  startOrderPolling() {
    if (this.orderPollingInterval) {
      clearInterval(this.orderPollingInterval);
    }
    this.checkForNewOrders();
    this.orderPollingInterval = setInterval(() => {
      const adminActive = (typeof App !== "undefined" && App.currentView === "admin") || 
                          (document.getElementById("admin-view")?.classList.contains("active"));
      if (adminActive) {
        this.checkForNewOrders();
      }
    }, 4000); // Check every 4 seconds for instant real-time notifications
  },

  startLiveVisitorsTracker() {
    if (this.visitorsInterval) {
      clearInterval(this.visitorsInterval);
    }

    let sessionId = sessionStorage.getItem("hydrolux_session_id");
    if (!sessionId) {
      sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2);
      sessionStorage.setItem("hydrolux_session_id", sessionId);
    }

    const updateCount = async () => {
      try {
        // Send heartbeat for admin session
        await fetch(`${HydroluxBackend.httpUrl}/api/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }).catch(err => console.warn("Failed to send admin heartbeat:", err));

        // Get active count
        const res = await HydroluxBackend.request("/api/visitors/active");
        if (res && res.ok) {
          const badge = document.getElementById("live-visitors-badge");
          const countSpan = document.getElementById("live-visitors-count");
          if (badge && countSpan) {
            countSpan.textContent = res.count || 0;
            badge.style.display = "inline-flex";
          }
        }
      } catch (err) {
        console.warn("Failed to fetch active visitors:", err);
      }
    };

    updateCount();
    this.visitorsInterval = setInterval(updateCount, 15000);
  },

  async checkForNewOrders() {
    try {
      const response = await HydroluxBackend.getAllOrders();
      if (!response || !response.ok) return;

      const orders = response.orders || [];
      if (orders.length === 0) return;

      let acknowledged = [];
      const stored = localStorage.getItem("hydrolux_acknowledged_orders");
      if (stored) {
        try {
          acknowledged = JSON.parse(stored);
        } catch (e) {
          acknowledged = [];
        }
      }

      if (stored === null) {
        acknowledged = orders.map(o => o.orderNumber);
        localStorage.setItem("hydrolux_acknowledged_orders", JSON.stringify(acknowledged));
        return;
      }

      const newOrders = orders.filter(o => !acknowledged.includes(o.orderNumber) && o.status !== "canceled");

      if (newOrders.length > 0) {
        this.showNewOrdersNotification(newOrders);
      }
    } catch (err) {
      console.error("Грешка при проверка за нови поръчки:", err);
    }
  },

  playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = audioCtx.currentTime;
      playTone(523.25, now, 0.25);
      playTone(659.25, now + 0.12, 0.25);
      playTone(783.99, now + 0.24, 0.4);
    } catch (e) {
      console.warn("Неуспешно възпроизвеждане на звук:", e);
    }
  },

  showNewOrdersNotification(newOrders) {
    this.currentlyNotifiedOrderNumbers = newOrders.map(o => o.orderNumber);

    let modal = document.getElementById("admin-new-orders-modal");
    if (modal) {
      const contentEl = document.getElementById("admin-new-orders-list-content");
      if (contentEl) {
        contentEl.innerHTML = this.renderNewOrdersListHTML(newOrders);
      }
      return;
    }

    this.playNotificationSound();

    modal = document.createElement("div");
    modal.id = "admin-new-orders-modal";
    modal.className = "admin-orders-notification-overlay";
    modal.innerHTML = `
      <div class="admin-orders-notification-card">
        <div class="bell-animation-wrapper">
          <div class="bell-pulse"></div>
          <div class="bell-icon">🔔</div>
        </div>
        <h2>Нова поръчка!</h2>
        <p class="notification-subtitle">Имате нови поръчки, очакващи обработка:</p>
        <div id="admin-new-orders-list-content" class="new-orders-scroll-list">
          ${this.renderNewOrdersListHTML(newOrders)}
        </div>
        <button class="notification-ack-btn" onclick="Admin.acknowledgeNewOrders()">
          Разбрах
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  },

  renderNewOrdersListHTML(newOrders) {
    return newOrders.map(o => {
      const name = o.customer?.fullName || o.customer?.name || "Анонимен клиент";
      const total = o.totals?.total !== undefined ? parseFloat(o.totals.total).toFixed(2) : "0.00";
      const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
      const formattedDate = new Date(o.createdAt).toLocaleString("bg-BG", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      return `
        <div class="new-order-item-card">
          <div class="new-order-header">
            <span class="new-order-number">${this.escapeHtml(o.orderNumber)}</span>
            <span class="new-order-date">${formattedDate}</span>
          </div>
          <div class="new-order-details">
            <div><strong>Клиент:</strong> ${this.escapeHtml(name)}</div>
            <div><strong>Телефон:</strong> ${this.escapeHtml(o.customer?.phone || "Не е въведен")}</div>
            <div><strong>Артикули:</strong> ${itemsCount} бр.</div>
            <div class="new-order-price"><strong>Сума:</strong> ${total} лв.</div>
          </div>
        </div>
      `;
    }).join("");
  },

  acknowledgeNewOrders(orderNumbers) {
    const numsToAck = orderNumbers || this.currentlyNotifiedOrderNumbers || [];
    let acknowledged = [];
    const stored = localStorage.getItem("hydrolux_acknowledged_orders");
    if (stored) {
      try {
        acknowledged = JSON.parse(stored);
      } catch (e) {
        acknowledged = [];
      }
    }

    numsToAck.forEach(num => {
      if (!acknowledged.includes(num)) {
        acknowledged.push(num);
      }
    });

    localStorage.setItem("hydrolux_acknowledged_orders", JSON.stringify(acknowledged));

    const modal = document.getElementById("admin-new-orders-modal");
    if (modal) {
      modal.classList.add("fade-out");
      setTimeout(() => {
        modal.remove();
      }, 300);
    }

    if (this.activeTab === "orders") {
      this.loadOrders();
    }
  },

  base64ToBlob(base64Data, contentType = "application/pdf") {
    try {
      const parts = base64Data.split(",");
      const dataStr = parts.length > 1 ? parts[1] : parts[0];
      const byteCharacters = atob(dataStr);
      const byteArrays = [];
      const sliceSize = 512;
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      return new Blob(byteArrays, { type: contentType });
    } catch (e) {
      console.error("Error converting base64 to blob:", e);
      return null;
    }
  },

  async migrateLegacyPdfs() {
    if (typeof HydroluxBackend === "undefined" || !CONFIG.products) return;

    let migratedAny = false;
    console.log("Checking for legacy base64 PDFs to migrate...");

    for (const prod of CONFIG.products) {
      // 1. Migrate legacy prod.pdf field
      if (prod.pdf && typeof prod.pdf === "string" && prod.pdf.startsWith("data:application/pdf")) {
        console.log(`Migrating legacy pdf field for product "${prod.name}"...`);
        try {
          const blob = this.base64ToBlob(prod.pdf);
          if (blob) {
            const fileName = prod.name ? `${prod.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf` : "specification.pdf";
            const file = new File([blob], fileName, { type: "application/pdf" });
            const result = await HydroluxBackend.uploadPdf(file);
            if (result && result.ok && result.url) {
              if (!prod.pdfs) prod.pdfs = [];
              prod.pdfs.push({
                name: "Техническа спецификация (PDF)",
                url: result.url,
                storageId: result.storageId
              });
              prod.pdf = null;
              migratedAny = true;
              console.log(`Successfully migrated pdf field for "${prod.name}".`);
            }
          }
        } catch (e) {
          console.error(`Error migrating pdf field for product "${prod.name}":`, e);
        }
      }

      // 2. Migrate legacy items inside prod.pdfs array
      if (prod.pdfs && Array.isArray(prod.pdfs)) {
        for (let i = 0; i < prod.pdfs.length; i++) {
          const pdfItem = prod.pdfs[i];
          if (pdfItem && pdfItem.data && typeof pdfItem.data === "string" && pdfItem.data.startsWith("data:application/pdf")) {
            console.log(`Migrating legacy pdf inside pdfs array for product "${prod.name}" (item name: "${pdfItem.name}")...`);
            try {
              const blob = this.base64ToBlob(pdfItem.data);
              if (blob) {
                const fileName = pdfItem.name || "specification.pdf";
                const file = new File([blob], fileName, { type: "application/pdf" });
                const result = await HydroluxBackend.uploadPdf(file);
                if (result && result.ok && result.url) {
                  pdfItem.url = result.url;
                  pdfItem.storageId = result.storageId;
                  delete pdfItem.data;
                  migratedAny = true;
                  console.log(`Successfully migrated pdf item "${pdfItem.name}" for "${prod.name}".`);
                }
              }
            } catch (e) {
              console.error(`Error migrating pdf item for product "${prod.name}":`, e);
            }
          }
        }
      }
    }

    if (migratedAny) {
      console.log("Saving migrated product state to Convex...");
      try {
        await CONFIG.saveState();
        this.propagateStateChanges();
        this.render();
        console.log("Migration state saved successfully!");
      } catch (e) {
        console.error("Failed to save migrated product state to Convex:", e);
      }
    } else {
      console.log("No legacy base64 PDFs found. Database is clean.");
    }
  },

  async migrateLegacyImages() {
    if (typeof HydroluxBackend === "undefined" || !CONFIG.products) return;

    let migratedAny = false;
    console.log("Checking for legacy base64 images to migrate...");

    // 1. Migrate product images
    for (const prod of CONFIG.products) {
      if (prod.images && Array.isArray(prod.images)) {
        for (let i = 0; i < prod.images.length; i++) {
          const img = prod.images[i];
          if (img && typeof img === "string" && img.startsWith("data:image/")) {
            console.log(`Migrating legacy base64 image for product "${prod.name}" (index: ${i})...`);
            try {
              // Extract MIME type from data URL
              const mimeMatch = img.match(/^data:([^;]+);/);
              const mimeType = mimeMatch ? mimeMatch[1] : "image/webp";
              const extension = mimeType.split("/")[1] || "webp";
              
              const blob = this.base64ToBlob(img, mimeType);
              if (blob) {
                const fileName = `img_${prod.id}_${i}.${extension}`;
                const file = new File([blob], fileName, { type: mimeType });
                const result = await HydroluxBackend.uploadPdf(file); // reuse generic file uploader
                if (result && result.ok && result.url) {
                  prod.images[i] = result.url;
                  migratedAny = true;
                  console.log(`Successfully migrated image ${i} for "${prod.name}".`);
                }
              }
            } catch (e) {
              console.error(`Error migrating image ${i} for product "${prod.name}":`, e);
            }
          }
        }
      }
    }

    // 2. Migrate category images
    if (CONFIG.categories && Array.isArray(CONFIG.categories)) {
      for (const cat of CONFIG.categories) {
        if (cat.image && typeof cat.image === "string" && cat.image.startsWith("data:image/")) {
          console.log(`Migrating legacy base64 image for category "${cat.name}"...`);
          try {
            const mimeMatch = cat.image.match(/^data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/webp";
            const extension = mimeType.split("/")[1] || "webp";

            const blob = this.base64ToBlob(cat.image, mimeType);
            if (blob) {
              const fileName = `cat_${cat.id}.${extension}`;
              const file = new File([blob], fileName, { type: mimeType });
              const result = await HydroluxBackend.uploadPdf(file);
              if (result && result.ok && result.url) {
                cat.image = result.url;
                migratedAny = true;
                console.log(`Successfully migrated image for category "${cat.name}".`);
              }
            }
          } catch (e) {
            console.error(`Error migrating image for category "${cat.name}":`, e);
          }
        }
      }
    }

    if (migratedAny) {
      console.log("Saving migrated images state to Convex...");
      try {
        await CONFIG.saveState();
        this.propagateStateChanges();
        this.render();
        console.log("Image migration state saved successfully!");
      } catch (e) {
        console.error("Failed to save migrated images state to Convex:", e);
      }
    } else {
      console.log("No legacy base64 images found. Database is clean.");
    }
  },

  startRowDrag(e, handle) {
    const row = handle.closest(".admin-variant-tr");
    if (!row) return;

    e.preventDefault();

    this.draggedRow = row;
    row.classList.add("dragging");

    this.boundRowDragMove = (moveEvent) => this.handleRowDragMove(moveEvent);
    this.boundRowDragEnd = (endEvent) => this.handleRowDragEnd(endEvent);

    window.addEventListener("mousemove", this.boundRowDragMove);
    window.addEventListener("mouseup", this.boundRowDragEnd);
    window.addEventListener("touchmove", this.boundRowDragMove, { passive: false });
    window.addEventListener("touchend", this.boundRowDragEnd);
  },

  handleRowDragMove(e) {
    if (!this.draggedRow) return;

    if (e.type === "touchmove") {
      e.preventDefault();
    }

    const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

    const tbody = document.getElementById("admin-variants-tbody");
    if (!tbody) return;

    const rows = [...tbody.querySelectorAll(".admin-variant-tr")];
    const targetRow = rows.find(row => {
      if (row === this.draggedRow) return false;
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });

    if (targetRow) {
      const rect = targetRow.getBoundingClientRect();
      const next = clientY > (rect.top + rect.height / 2);
      if (next) {
        tbody.insertBefore(this.draggedRow, targetRow.nextSibling);
      } else {
        tbody.insertBefore(this.draggedRow, targetRow);
      }
    }
  },

  handleRowDragEnd(e) {
    if (this.draggedRow) {
      this.draggedRow.classList.remove("dragging");
      this.draggedRow = null;
    }

    window.removeEventListener("mousemove", this.boundRowDragMove);
    window.removeEventListener("mouseup", this.boundRowDragEnd);
    window.removeEventListener("touchmove", this.boundRowDragMove);
    window.removeEventListener("touchend", this.boundRowDragEnd);
  },

  getUniquePdfDisplayNames() {
    if (typeof CONFIG === "undefined" || !CONFIG.products) return [];
    const names = new Set();
    CONFIG.products.forEach(p => {
      if (Array.isArray(p.pdfs)) {
        p.pdfs.forEach(pdf => {
          if (pdf && pdf.displayName) {
            const trimmed = pdf.displayName.trim();
            if (trimmed) names.add(trimmed);
          }
        });
      }
    });
    return [...names].sort();
  },

  renderLoginForm() {
    return `
      <div style="display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 180px); padding: 20px; background-color: #f8fafc;">
        <div class="card" style="width: 100%; max-width: 420px; padding: 35px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); background: white; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 25px;">
            <img src="assets/logo.webp" alt="Хидролукс Груп" style="height: 50px; margin-bottom: 15px; object-fit: contain;" onerror="this.src='assets/logo.png'">
            <h3 style="margin: 0; color: #0f172a; font-weight: 800; font-size: 1.35rem;">Административен панел</h3>
            <p style="margin: 6px 0 0; color: #64748b; font-size: 0.85rem;">Моля, въведете парола за достъп</p>
          </div>
          
          <form onsubmit="Admin.handleAdminLogin(event)" style="display: flex; flex-direction: column; gap: 18px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-weight: 700; font-size: 0.82rem; color: #334155; margin-bottom: 6px; display: block;">Парола <span style="color: #ef4444;">*</span></label>
              <div style="position: relative;">
                <input type="password" id="admin-login-pass" class="form-control" placeholder="Въведете парола" required style="width: 100%; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 500; font-size: 0.95rem; transition: border-color 0.2s;">
              </div>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; color: #475569; cursor: pointer; user-select: none;">
                <input type="checkbox" id="admin-login-remember" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary);">
                Запомни ме на това устройство
              </label>
            </div>
            
            <button type="submit" id="admin-login-submit" style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); color: white; border: none; padding: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.15);">
              Вход в панела
            </button>
          </form>
          
          <div id="admin-login-error" style="display: none; background-color: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 10px 12px; border-radius: 8px; margin-top: 15px; font-size: 0.82rem; font-weight: 600; line-height: 1.4; text-align: center;"></div>
        </div>
      </div>
    `;
  },

  async handleAdminLogin(event) {
    event.preventDefault();
    const passInput = document.getElementById("admin-login-pass");
    const rememberCheckbox = document.getElementById("admin-login-remember");
    const errorDiv = document.getElementById("admin-login-error");
    const submitBtn = document.getElementById("admin-login-submit");

    if (!passInput) return;

    const password = passInput.value;
    const rememberMe = rememberCheckbox ? rememberCheckbox.checked : false;
    const clientId = localStorage.getItem("hydrolux_admin_client_id") || "unknown";

    if (errorDiv) errorDiv.style.display = "none";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = "⏳ Проверка...";
    }

    try {
      const res = await HydroluxBackend.adminLogin(password, clientId, rememberMe);
      if (res && res.ok) {
        if (rememberMe) {
          localStorage.setItem("hydrolux_admin_token", res.token);
        } else {
          sessionStorage.setItem("hydrolux_admin_token", res.token);
        }
        this.isAuthenticated = true;
        this.render();
        // Kick off catalog loading if it hasn't finished
        if (typeof CONFIG !== "undefined" && typeof CONFIG.loadCatalog === "function") {
          CONFIG.loadCatalog().then(() => {
            Admin.render();
          });
        }
      } else {
        if (errorDiv) {
          errorDiv.textContent = res.error || "Неуспешен вход.";
          errorDiv.style.display = "block";
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = "Вход в панела";
        }
      }
    } catch (err) {
      console.error("Login request failed", err);
      if (errorDiv) {
        errorDiv.textContent = "Възникна системна грешка при връзка със сървъра. Проверете интернет връзката си.";
        errorDiv.style.display = "block";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Вход в панела";
      }
    }
  },

  logout() {
    localStorage.removeItem("hydrolux_admin_token");
    sessionStorage.removeItem("hydrolux_admin_token");
    this.isAuthenticated = false;
    this.render();
  }
};
