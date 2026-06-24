// Hydrolux Premium Store - AI Chatbot Component
const Chatbot = {
  isOpen: false,
  messages: [],
  initialized: false,

  // Escapes untrusted text (user input and LLM output) before it is placed in
  // innerHTML, so a prompt-injected response cannot inject active markup.
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  init() {
    if (this.initialized) return;
    
    // Load chat history from session storage if any, otherwise welcome
    const saved = sessionStorage.getItem("hydrolux_chat_messages");
    if (saved) {
      try {
        this.messages = JSON.parse(saved);
      } catch (e) {
        this.messages = [];
      }
    }

    if (this.messages.length === 0) {
      this.messages.push({
        role: "assistant",
        content: "Здравейте! Аз съм Вашият AI асистент в Хидролукс. Как мога да Ви помогна днес? Мога да Ви предложа подходящи маркучи или да отговоря на въпроси за нашите услуги и сервиз."
      });
    }

    this.renderMessages();
    this.initialized = true;
  },

  toggle() {
    const windowEl = document.getElementById("ai-chatbot-window");
    if (!windowEl) return;

    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      windowEl.style.display = "flex";
      this.init();
      // Scroll to bottom
      const msgsEl = document.getElementById("chatbot-messages");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
      // Focus input
      setTimeout(() => {
        document.getElementById("chatbot-input")?.focus();
      }, 100);
    } else {
      windowEl.style.display = "none";
    }
  },

  renderMessages() {
    const msgsEl = document.getElementById("chatbot-messages");
    if (!msgsEl) return;

    msgsEl.innerHTML = this.messages.map(msg => {
      const isUser = msg.role === "user";
      const cls = isUser ? "user" : "bot";
      
      // Parse product recommendation tag: [RECOMMEND: prod_id]
      let parsedContent = msg.content;
      
      const recommendRegex = /\[RECOMMEND:\s*([a-zA-Z0-9_-]+)\]/g;
      let match;
      const recommendations = [];
      
      while ((match = recommendRegex.exec(msg.content)) !== null) {
        recommendations.push(match[1]);
      }
      
      // Remove recommendation tag from text display
      parsedContent = parsedContent.replace(recommendRegex, "").trim();

      // Escape any HTML in the message BEFORE re-adding our own <br> markup,
      // so untrusted text (typed by the user or returned by the LLM) is inert.
      parsedContent = this.escapeHtml(parsedContent).replace(/\n/g, "<br>");
      
      // Generate cards HTML for recommendations
      let carouselHtml = "";
      if (recommendations.length > 0) {
        const cardsHtml = recommendations.map(prodId => {
          const product = CONFIG.products.find(p => p.id === prodId);
          if (!product) return "";
          
          const coverImg = product.images[0] || "assets/cat_air_hoses.webp";
          const prices = product.variants.map(v => v.priceEur);
          const minPrice = Math.min(...prices);
          const priceText = formatPrice(minPrice, product.unit === "м").eur;
          
          return `
            <a class="chatbot-recommended-product" href="#product-detail/${product.id}" onclick="Chatbot.handleCardClick(event, '${product.id}')">
              <img src="${coverImg}" alt="${product.name}" class="chatbot-rec-img" onerror="this.src='assets/cat_air_hoses.webp'">
              <div class="chatbot-rec-info">
                <span class="chatbot-rec-name">${product.name}</span>
                <span class="chatbot-rec-brand">${product.brand || "Хидролукс"}</span>
                <span class="chatbot-rec-price">${priceText}</span>
              </div>
            </a>
          `;
        }).join("");

        // Generate carousel wrapper with arrows if recommendations.length > 2
        const showArrows = recommendations.length > 2;
        const carouselId = `carousel-${Math.random().toString(36).substr(2, 9)}`;
        carouselHtml = `
          <div class="chatbot-products-carousel-wrapper">
            ${showArrows ? `<button class="chatbot-carousel-btn prev" onclick="Chatbot.scrollCarousel('${carouselId}', -1)">&#10094;</button>` : ""}
            <div id="${carouselId}" class="chatbot-products-carousel">
              ${cardsHtml}
            </div>
            ${showArrows ? `<button class="chatbot-carousel-btn next" onclick="Chatbot.scrollCarousel('${carouselId}', 1)">&#10095;</button>` : ""}
          </div>
        `;
      }

      return `
        <div class="chatbot-message ${cls}">
          ${parsedContent}
          ${carouselHtml}
        </div>
      `;
    }).join("");

    // Scroll handling: scroll to the bottom of the container.
    // Use multiple timeouts to handle dynamic image/card height changes and keyboard overlay.
    setTimeout(() => {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, 50);
    setTimeout(() => {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, 250);
  },

  handleCardClick(event, prodId) {
    if (event && event.preventDefault) {
      event.preventDefault();
      event.stopPropagation();
    } else if (typeof event === "string" && !prodId) {
      prodId = event;
    }
    this.toggle(); // Close chatbot window
    if (prodId) {
      Catalog.openProductDetails(prodId);
    }
  },

  scrollCarousel(carouselId, direction) {
    const carousel = document.getElementById(carouselId);
    if (carousel) {
      const scrollAmount = (carousel.clientWidth / 2 + 4) * direction;
      carousel.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  },

  async sendMessage() {
    const inputEl = document.getElementById("chatbot-input");
    if (!inputEl) return;

    const query = inputEl.value.trim();
    if (!query) return;

    // Clear input
    inputEl.value = "";

    // 1. Add user message
    this.messages.push({ role: "user", content: query });
    this.renderMessages();
    this.saveMessages();

    // 2. Show typing indicator
    const typingEl = document.getElementById("chatbot-typing");
    if (typingEl) typingEl.style.display = "flex";
    
    const msgsEl = document.getElementById("chatbot-messages");
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // 3. Prepare serialized product catalog summary context
    const catalogSummary = CONFIG.products.map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      code: p.code,
      categories: p.categories || [p.category].filter(Boolean),
      startingPriceEur: Math.min(...p.variants.map(v => v.priceEur))
    }));

    // Filter messages history
    const apiMessagesHistory = this.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    try {
      // Call Convex HTTP Endpoint
      const response = await fetch(`${HydroluxBackend.httpUrl}/api/chatbot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: apiMessagesHistory,
          catalog: JSON.stringify(catalogSummary)
        })
      });

      if (!response.ok) {
        throw new Error(`Chatbot request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Hide typing indicator
      if (typingEl) typingEl.style.display = "none";

      if (data && data.ok) {
        this.messages.push({ role: "assistant", content: data.answer });
      } else {
        this.messages.push({ role: "assistant", content: "Съжалявам, възникна системна грешка при обработка на съобщението." });
      }
    } catch (err) {
      console.error("Chatbot API error:", err);
      if (typingEl) typingEl.style.display = "none";
      this.messages.push({ role: "assistant", content: "Възникна проблем с връзката. Моля, проверете интернет връзката си и опитайте отново." });
    }

    this.scrollToBotResponse = true;
    this.renderMessages();
    this.saveMessages();
  },

  saveMessages() {
    sessionStorage.setItem("hydrolux_chat_messages", JSON.stringify(this.messages));
  }
};
