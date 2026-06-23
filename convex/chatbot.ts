import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const chatbot = internalAction({
  args: {
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    catalog: v.string(),
  },
  handler: async (ctx, args) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Defensive caps: this endpoint is public, so bound the payload that can be
    // forwarded to (paid) LLM providers to prevent cost abuse / DoS.
    const MAX_MESSAGES = 20;
    const MAX_MSG_LEN = 4000;
    const MAX_CATALOG_LEN = 60000;

    args = {
      messages: (Array.isArray(args.messages) ? args.messages : [])
        .slice(-MAX_MESSAGES)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? "").slice(0, MAX_MSG_LEN),
        })),
      catalog: String(args.catalog ?? "").slice(0, MAX_CATALOG_LEN),
    };

    if (args.messages.length === 0) {
      return { ok: true, answer: "Здравейте! С какво мога да Ви помогна?" };
    }

    const systemPrompt = `You are a helpful AI assistant for the B2B store "Хидролукс Груп" in Montana, Bulgaria. 
You specialize in hydraulic and pneumatic hoses, fittings, connectors, valves, and components.
You speak only Bulgarian. Your answers should be professional and concise.

If the user is asking for product recommendations, match their request against the provided product catalog, and write their product ID in the format [RECOMMEND: prod_id] at the end of your response (e.g. "Препоръчвам Ви маркуч 2SN [RECOMMEND: hydraulic-hose-2sn]"). You can recommend multiple products.

Catalog context:
${args.catalog}`;

    if (geminiKey) {
      try {
        // Map messages to Gemini API format
        const contents = [];
        // Inject system prompt into first user message or handle it
        contents.push({
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nUser request starts below:` }]
        });

        for (const msg of args.messages) {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
          });
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ contents }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer) {
            return { ok: true, answer };
          }
        }
      } catch (err) {
        console.error("Gemini API call failed", err);
      }
    }

    if (openaiKey) {
      try {
        const messages = [
          { role: "system", content: systemPrompt },
          ...args.messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content;
          if (answer) {
            return { ok: true, answer };
          }
        }
      } catch (err) {
        console.error("OpenAI API call failed", err);
      }
    }

    // Smart Rule-based fallback if no LLM keys are configured
    const userQuery = args.messages[args.messages.length - 1].content.toLowerCase();
    let answer = "Здравейте! Аз съм Вашият AI асистент в Хидролукс Груп. ";
    
    // Parse catalog
    let catalogList: any[] = [];
    try {
      catalogList = JSON.parse(args.catalog);
    } catch (e) {}

    const recommendations: string[] = [];

    // Simple keyword mapping
    if (userQuery.includes("маркуч") || userQuery.includes("markuch")) {
      const match = catalogList.find(p => p.name.toLowerCase().includes("маркуч") || p.id.includes("hose"));
      if (match) recommendations.push(match.id);
      answer += "Хидролукс предлага разнообразие от маркучи за високо налягане, хидравлика и пневматика. ";
    }
    if (userQuery.includes("фитинг") || userQuery.includes("накрайник") || userQuery.includes("fiting")) {
      const match = catalogList.find(p => p.name.toLowerCase().includes("накрайник") || p.id.includes("fitting"));
      if (match) recommendations.push(match.id);
      answer += "Предлагаме хидравлични и пневматични накрайници (фитинги), включително метрични (DKOL), инчови (BSP, JIC) и много други. ";
    }
    if (userQuery.includes("бърза връзка") || userQuery.includes("coupling")) {
      const match = catalogList.find(p => p.name.toLowerCase().includes("връзка") || p.id.includes("coupling"));
      if (match) recommendations.push(match.id);
      answer += "Имаме богата гама от бързи връзки за въздух и хидравлика с висок дебит. ";
    }

    if (recommendations.length > 0) {
      answer += "Ето някои продукти, които може да Ви свършат работа:\n";
      recommendations.forEach(id => {
        answer += ` [RECOMMEND: ${id}]`;
      });
    } else {
      answer += "Можем да изработим всякакви хидравлични маркучи по Ваш размер на място в нашия сервиз в град Монтана на ул. „Индустриална“ 32г. Какво точно оборудване търсите?";
    }

    return { ok: true, answer };
  },
});
