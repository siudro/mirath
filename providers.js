/* providers.js — طبقة المزوّدين
   Google Gemini API  ↔  DeepSeek API (متوافق مع OpenAI)

   كل مزوّد يعرّف: اسمه، عنوانه، موديلاته، وكيف نبني الطلب ونقرأ الرد.
   app.js لا يعرف أي مزوّد بعينه — يطلب provider.chat() فقط.
*/

const PROVIDERS = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    // DeepSeek متوافق مع واجهة OpenAI
    baseUrl: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    keyHint: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyUrlLabel: "platform.deepseek.com/api_keys",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    defaultModel: "deepseek-flash",
    // Vision: deepseek-flash فقط. v4-pro لا يدعم الصور.
    imageModels: ["deepseek-flash"],
    supportsSearch: false,
    searchNote: "البحث في الإنترنت غير مدعوم في DeepSeek — الموديل يعتمد على معرفته.",

    /* ---- بناء الطلب بصيغة OpenAI ---- */
    buildBody({ systemPrompt, history, image, searchEnabled }) {
      const messages = [{ role: "system", content: systemPrompt }];

      for (const turn of history) {
        const textParts = [];
        const imageParts = [];

        for (const p of turn.parts || []) {
          if (p.text) textParts.push({ type: "text", text: p.text });
          if (p.inline_data) {
            imageParts.push({
              type: "image_url",
              image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` },
            });
          }
        }

        const content = imageParts.length
          ? [...textParts, ...imageParts]
          : textParts.map((t) => t.text).join("\n");

        messages.push({
          role: turn.role === "model" ? "assistant" : "user",
          content,
        });
      }

      return {
        model: null, // يُضبط عند الإرسال
        messages,
        max_tokens: 2048,
        stream: false,
        thinking: { type: "disabled" },
      };
    },

    /* ---- قراءة الرد ---- */
    readReply(json) {
      const choice = json.choices && json.choices[0];
      if (!choice) return null;
      const msg = choice.message || {};
      const out = (msg.content || "").trim();
      return out || null;
    },

    /* ---- الترويسات ---- */
    headers(key) {
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      };
    },

    /* ---- فحص المفتاح: قائمة الموديلات ---- */
    async listModels(key) {
      const r = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j.error && j.error.message) || `HTTP ${r.status}`);
      }
      const j = await r.json();
      return (j.data || []).map((m) => m.id);
    },
  },

  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com/apikey",
    models: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
    defaultModel: "gemini-3.8-flash",
    imageModels: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
    supportsSearch: true,
    searchNote: "البحث في الإنترنت عبر google_search.",

    buildBody({ systemPrompt, history, searchEnabled }) {
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        generationConfig: { maxOutputTokens: 2048 },
        safetySettings: [
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      };
      if (searchEnabled) body.tools = [{ google_search: {} }];
      return body;
    },

    readReply(json) {
      const c = json.candidates && json.candidates[0];
      if (!c) return null;
      const parts = (c.content && c.content.parts) || [];
      const out = parts.map((p) => p.text || "").join("").trim();
      return out || null;
    },

    headers() {
      return { "Content-Type": "application/json" };
    },

    async listModels(key) {
      const r = await fetch(`${this.baseUrl}/models?key=${encodeURIComponent(key)}&pageSize=200`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j.error && j.error.message) || `HTTP ${r.status}`);
      }
      const j = await r.json();
      return (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
    },
  },
};

const PROVIDER_LIST = [PROVIDERS.deepseek, PROVIDERS.gemini];
