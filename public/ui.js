/* ui.js — واجهة ميراث
   لا يعرف أي مزوّد: يكلّم الخادم عبر /api/chat (SSE) ويعرض ما يفعله الوكيل.
   الحالة الوحيدة في المتصفح: سجل المحادثات. لا مفاتيح، ولا أسرار. */

(function () {
  "use strict";

  /* ───────── مراجع DOM ───────── */
  const $ = (id) => document.getElementById(id);
  const el = {
    chat: $("chat"),
    stage: document.querySelector(".stage"),
    form: $("form"),
    input: $("input"),
    sendBtn: $("sendBtn"),
    fileInput: $("fileInput"),
    cameraInput: $("cameraInput"),
    preview: $("preview"),
    previewImg: $("previewImg"),
    removeImg: $("removeImg"),
    settings: $("settings"),
    settingsBtn: $("settingsBtn"),
    modelSel: $("modelSel"),
    diagBtn: $("diagBtn"),
    diagOut: $("diagOut"),
    keyStatus: $("keyStatus"),
    notice: $("notice"),
    trace: $("trace"),
    traceList: $("traceList"),
    historyBtn: $("historyBtn"),
    saveChatBtn: $("saveChatBtn"),
    workflowBtn: $("workflowBtn"),
    checklistBtn: $("checklistBtn"),
    historyModal: $("historyModal"),
    historyList: $("historyList"),
    historyEmpty: $("historyEmpty"),
    workflowModal: $("workflowModal"),
    workflowCanvas: $("workflowCanvas"),
    checklistModal: $("checklistModal"),
    checklistList: $("checklistList"),
    themeGrid: $("themeGrid"),
  };

  /* ───────── حالة ───────── */
  let transcript = [];          // [{role, text, image?, at}]
  let pendingImage = null;     // { dataUrl, base64, mime }
  let busy = false;
  let activeTrace = null;

  const STORE = {
    history: "mirath.history.v2",
    session: "mirath.session.v2",
    model: "mirath.model",
    theme: "mirath.theme",
  };

  const MAX_TURNS_FOR_API = 8;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  /* ───────── أدوات ───────── */

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function now() { return new Date().toISOString(); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToEnd() {
    if (!el.chat) return;
    requestAnimationFrame(() => {
      if (el.chat) el.chat.scrollTop = el.chat.scrollHeight;
    });
  }

  /* ───────── التهيئة ───────── */

  async function init() {
    if (el.notice) el.notice.hidden = true;
    autoGrow();
    renderChecklistModal();
    await checkHealth();
    restoreSession();
    if (!transcript.length) seedGreeting();
  }

  function seedGreeting() {
    // الرسالة الأولى موجودة في HTML — لا نكررها.
    if (el.chat.querySelector(".msg")) return;
    addMessage("bot", "سلامتك. أنا مِيراث — أساعدك في العناية بالجرح خطوة بخطوة.\nاكتب لي ما حدث، أو ارفع صورة للجرح.");
  }

  async function checkHealth() {
    try {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error("health " + r.status);
      const j = await r.json();
      if (!j.keyConfigured) {
        el.notice.hidden = false;
        el.notice.innerHTML =
          "<strong>الخادم بلا مفتاح.</strong> ضع <code>OPENAI_API_KEY</code> في بيئة الخادم ثم أعد التشغيل.";
      }
    } catch (e) {
      el.notice.hidden = false;
      el.notice.innerHTML =
        "<strong>لا أستطيع الوصول للخادم.</strong> تأكد أن الخادم يعمل ثم أعد تحميل الصفحة.";
    }
  }

  /* ───────── تخزين الجلسة ───────── */

  function saveSession() {
    try {
      localStorage.setItem(STORE.session, JSON.stringify(transcript));
    } catch (_) {}
  }

  function restoreSession() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE.session) || "null"); } catch (_) {}
    if (!Array.isArray(raw) || !raw.length) return;
    transcript = raw;
    // ارسم
    el.chat.innerHTML = "";
    for (const t of transcript) addMessage(t.role, t.text, t.image && t.image.dataUrl, { silent: true });
    scrollToEnd();
  }

  function resetSession() {
    transcript = [];
    localStorage.removeItem(STORE.session);
    el.chat.innerHTML = "";
    seedGreeting();
  }

  /* ───────── رسم الرسائل ───────── */

  function formatReply(text) {
    // تحويل بسيط وآمن: أسطر → فقرات، ثم تلوين الأحكام.
    const lines = String(text || "").split("\n");
    const frag = document.createDocumentFragment();
    let inList = null;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const isBullet = /^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
      if (isBullet && !inList) {
        inList = document.createElement(line.match(/^\d/) ? "ol" : "ul");
        frag.appendChild(inList);
      }
      if (!isBullet && inList) { inList = null; }

      const cleanText = line.replace(/^[-•*]\s+/, "").replace(/^\d+[.)]\s+/, "");
      const target = inList || document.createElement("p");

      // تقسيم على الأحكام لإضافة تسليط
      const parts = cleanText.split(/(✅|⚠️|❌)/g);
      for (const part of parts) {
        if (!part) continue;
        if (part === "✅") target.appendChild(mark("✅", "verdict-ok", true));
        else if (part === "⚠️") target.appendChild(mark("⚠️", "verdict-warn", true));
        else if (part === "❌") target.appendChild(mark("❌", "verdict-bad", true));
        else if (/غير موصى بها/.test(part) && !inList?.querySelector?.(".verdict-bad")) {
          // لو لم يوجد إيموجي: لون العبارة
          const words = part.split(/(غير موصى بها|غير مثبتة|مثبتة)/);
          for (const w of words) {
            if (!w) continue;
            if (/غير موصى بها/.test(w)) target.appendChild(mark(w, "verdict-bad"));
            else if (/غير مثبتة/.test(w)) target.appendChild(mark(w, "verdict-warn"));
            else if (w === "مثبتة") target.appendChild(mark(w, "verdict-ok"));
            else target.appendChild(document.createTextNode(w));
          }
        } else {
          target.appendChild(document.createTextNode(part));
        }
      }

      if (!inList) {
        // split-breaking marks means we built mark nodes on <p>, need per-part join
        frag.appendChild(target);
      }
    }

    return frag;
  }

  function mark(text, cls, emoji) {
    const s = document.createElement("span");
    s.className = cls + (emoji ? " emoji-mark" : "");
    s.textContent = text;
    return s;
  }  /* نسخة مبسطة من formatReply تمنع الأخطاء: نستخدمها بدلًا من السابقة. */
  function formatSimple(text) {
    const frag = document.createDocumentFragment();
    const lines = String(text || "").split("\n");
    let list = null;

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) { list = null; continue; }

      const bullet = line.match(/^\s*([-•*]|\d+[.)])\s+(.*)$/);
      if (bullet) {
        const ordered = /^\d/.test(bullet[1]);
        if (!list || (ordered && list.tagName !== "OL") || (!ordered && list.tagName !== "UL")) {
          list = document.createElement(ordered ? "ol" : "ul");
          frag.appendChild(list);
        }
        const li = document.createElement("li");
        appendWithMarks(li, bullet[2]);
        list.appendChild(li);
        continue;
      }

      list = null;
      const p = document.createElement("p");
      appendWithMarks(p, line.trim());
      frag.appendChild(p);
    }
    return frag;
  }

  function appendWithMarks(parent, text) {
    /* ★ لا نعتمد على الخطوط التعبيرية: بعض الأجهزة (خصوصًا في مناطق النزاع
       وأجهزة Windows القديمة) ترسم ✅ ⚠️ ❌ كمربعات فارغة — وهي علامة الحكم
       نفسها. نستبدلها برموز نصية موجودة في كل خط عربي. */
    const tokens = text.split(/(✅|⚠️|❌|⚠)/g);
    for (const tok of tokens) {
      if (!tok) continue;
      if (tok === "✅") parent.appendChild(mark("✔", "verdict-ok emoji-mark"));
      else if (tok === "⚠️" || tok === "⚠") parent.appendChild(mark("!", "verdict-warn emoji-mark"));
      else if (tok === "❌") parent.appendChild(mark("✘", "verdict-bad emoji-mark"));
      else {
        const sub = tok.split(/(غير موصى بها|غير مثبتة|\bمثبتة\b)/g);
        for (const s of sub) {
          if (!s) continue;
          if (s === "غير موصى بها") parent.appendChild(mark(s, "verdict-bad"));
          else if (s === "غير مثبتة") parent.appendChild(mark(s, "verdict-warn"));
          else if (s === "مثبتة") parent.appendChild(mark(s, "verdict-ok"));
          else parent.appendChild(document.createTextNode(s));
        }
      }
    }
  }

  function addMessage(role, text, imageDataUrl, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;

    if (role === "bot") {
      const av = document.createElement("div");
      av.className = "avatar";
      av.setAttribute("aria-hidden", "true");
      av.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 16c0-4-3-7-7-7 0 4 3 7 7 7z"/></svg>';
      wrap.appendChild(av);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (role === "bot") bubble.appendChild(formatSimple(text));
    else if (text) {
      for (const line of String(text).split("\n")) {
        const p = document.createElement("p");
        p.textContent = line || "\u00a0";
        bubble.appendChild(p);
      }
    }

    if (imageDataUrl) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = imageDataUrl;
      img.alt = "صورة مرفقة";
      bubble.appendChild(img);
    }

    wrap.appendChild(bubble);
    el.chat.appendChild(wrap);
    scrollToEnd();
    return { wrap, bubble };
  }

  /* ───────── عرض الأثر ───────── */

  const TRACE_ICONS = {
    triage:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    "read-image":
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 16c0-4-3-7-7-7 0 4 3 7 7 7z"/></svg>',
    lookup:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    websearch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    verify:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    "herb-image":
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 16c0-4-3-7-7-7 0 4 3 7 7 7z"/></svg>',
    compose:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  };

  function traceStart() {
    if (!el.trace || !el.traceList) return null;
    el.traceList.innerHTML = "";
    el.trace.hidden = false;
    activeTrace = { items: {}, order: [] };
    if (window.innerWidth <= 760) {
      // على الجوّال: اترك مساحة أسفل الشاشة
      el.chat.style.paddingBottom = "46dvh";
    }
    return activeTrace;
  }

  function traceEvent(ev) {
    if (!activeTrace || !el.traceList) return;
    const id = ev.id;
    let item = activeTrace.items[id];

    if (!item) {
      const li = document.createElement("li");
      li.className = "trace-item";
      li.dataset.id = id;
      li.innerHTML =
        '<span class="trace-icon">' + (TRACE_ICONS[id] || "•") + "</span>" +
        '<div class="trace-body">' +
        '<span class="trace-label">' + esc(ev.label || id) + "</span>" +
        '<span class="trace-note"></span>' +
        "</div>";
      el.traceList.appendChild(li);
      item = { li, note: li.querySelector(".trace-note") };
      activeTrace.items[id] = item;
      activeTrace.order.push(id);
    }

    item.li.dataset.phase = ev.phase;
    if (ev.phase === "start") {
      item.note.textContent = ev.detail || "";
    } else if (ev.phase === "end") {
      item.note.textContent = ev.note || "";
      if (ev.note && /اعتراض|خطأ|فشل/.test(ev.note)) item.li.classList.add("warn");
    }
    el.traceList.scrollTop = el.traceList.scrollHeight;
  }

  function traceEnd() {
    if (!activeTrace) return;
    // على الجوّال: أزل اللوحة بعد ثانية كي يرى الجواب
    const isMobile = window.innerWidth <= 760;
    setTimeout(() => {
      if (el.trace) el.trace.hidden = true;
      el.chat.style.paddingBottom = "";
      activeTrace = null;
    }, isMobile ? 900 : 1500);
  }

  /* ───────── الصور ───────── */

  function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("أرفق صورة فقط.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast("حجم الصورة كبير. الحد ٨ ميغابايت.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      pendingImage = { dataUrl, base64: dataUrl.split(",")[1], mime: file.type };
      el.previewImg.src = dataUrl;
      el.preview.hidden = false;
      scrollToEnd();
    };
    reader.readAsDataURL(file);
  }

  el.fileInput.addEventListener("change", () => {
    handleImageFile(el.fileInput.files && el.fileInput.files[0]);
  });
  el.cameraInput.addEventListener("change", () => {
    handleImageFile(el.cameraInput.files && el.cameraInput.files[0]);
  });

  el.removeImg.addEventListener("click", clearImage);

  function clearImage() {
    pendingImage = null;
    el.preview.hidden = true;
    el.previewImg.removeAttribute("src");
    el.fileInput.value = "";
    el.cameraInput.value = "";
  }

  /* ───────── محرّر النص ───────── */

  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 140) + "px";
  }

  el.input.addEventListener("input", autoGrow);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el.form.requestSubmit();
    }
  });

  /* ───────── الإرسال ───────── */

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;

    const text = el.input.value.trim();
    if (!text && !pendingImage) return;

    busy = true;
    setBusy(true);

    const snapshot = pendingImage
      ? { dataUrl: pendingImage.dataUrl, base64: pendingImage.base64, mime: pendingImage.mime }
      : null;

    addMessage("user", text, snapshot && snapshot.dataUrl);
    transcript.push({ role: "user", text, image: snapshot, at: now() });

    el.input.value = "";
    autoGrow();
    clearImage();

    const typing = addTyping();

    try {
      await streamChat(text, snapshot);
    } catch (err) {
      removeTyping(typing);
      addMessage("error", err.message || "تعذر إكمال الرد.");
    } finally {
      removeTyping(typing);
      setBusy(false);
      traceEnd();
      saveSession();
    }
  });

  function setBusy(state) {
    busy = state;
    el.sendBtn.disabled = state;
    el.input.disabled = state;
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "msg bot typing";
    const av = document.createElement("div");
    av.className = "avatar";
    av.setAttribute("aria-hidden", "true");
    av.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 16c0-4-3-7-7-7 0 4 3 7 7 7z"/></svg>';
    wrap.appendChild(av);

    const b = document.createElement("div");
    b.className = "bubble";
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("span");
      d.className = "typing-dot";
      b.appendChild(d);
    }
    wrap.appendChild(b);
    el.chat.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function removeTyping(node) {
    if (node && node.remove) node.remove();
    const t = document.querySelector(".typing");
    if (t) t.remove();
  }

  /* ───────── بث الرد ───────── */

  async function streamChat(text, snapshot) {
    const apiHistory = transcript
      .filter((t) => t.role === "user" || t.role === "bot")
      .slice(-MAX_TURNS_FOR_API)
      .map((t) => ({
        role: t.role === "bot" ? "assistant" : "user",
        text: t.text || "",
        image: t.image && t.image.base64 ? { base64: t.image.base64, mime: t.image.mime } : null,
      }));

    // آخر رسالة مستخدم هي التي أضفناها أوّلًا
    const last = apiHistory[apiHistory.length - 1];
    const body = {
      history: apiHistory.slice(0, -1),
      text: last && last.text,
      image: snapshot ? { base64: snapshot.base64, mime: snapshot.mime } : undefined,
    };

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok && !res.headers.get("content-type")?.includes("event-stream")) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.message) msg = j.message; } catch (_) {}
      throw new Error(msg);
    }

    traceStart();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final = null;

    // حذف مؤشر الكتابة عند بدء التتبع الفعلي
    const t0 = setInterval(() => {
      if (activeTrace) removeTyping();
    }, 300);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const evm = chunk.match(/^event:\s*(.+)$/m);
          const datam = chunk.match(/^data:\s*(.+)$/m);
          if (!evm || !datam) continue;

          let data;
          try { data = JSON.parse(datam[1]); } catch (_) { continue; }
          const event = evm[1].trim();

          if (event === "tool") traceEvent(data);
          else if (event === "answer") final = data;
          else if (event === "error") throw new Error(data.message || "تعذر إكمال الرد.");
        }
      }
    } finally {
      clearInterval(t0);
      removeTyping();
    }

    if (!final || !final.text) throw new Error("لم يصل رد. أعد المحاولة.");

    const { wrap, bubble } = addMessage("bot", final.text);

    // صور المواد — تُرفق بالرد، مع مصدرها
    if (final.images && final.images.length) {
      for (const g of final.images) {
        if (!g.images || !g.images.length) continue;
        const fig = document.createElement("figure");
        fig.className = "herb-figure";

        const img = document.createElement("img");
        img.src = g.images[0].thumb;
        img.alt = g.herb || "";
        img.loading = "lazy";
        img.onerror = () => { fig.remove(); };
        fig.appendChild(img);

        const cap = document.createElement("figcaption");
        cap.appendChild(document.createTextNode(g.herb + " — " + (g.source || "")));
        if (g.images[0].license) {
          cap.appendChild(document.createTextNode(" · " + g.images[0].license));
        }
        if (g.images[0].page) {
          const a = document.createElement("a");
          a.href = g.images[0].page;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = " المصدر";
          cap.appendChild(a);
        }
        fig.appendChild(cap);
        bubble.appendChild(fig);
      }
    }

    transcript.push({ role: "bot", text: final.text, at: now() });
    scrollToEnd();
  }

  /* ───────── الإعدادات + التشخيص ───────── */

  function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = false;
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
  }

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not([hidden])").forEach((m) => (m.hidden = true));
    }
  });

  el.settingsBtn.addEventListener("click", () => openModal("settings"));

  el.diagBtn.addEventListener("click", async () => {
    el.diagOut.hidden = false;
    el.diagOut.textContent = "جارٍ الفحص…";
    try {
      const r = await fetch("/api/health");
      const j = await r.json();
      el.diagOut.textContent = [
        "server: " + (r.ok ? "OK" : "ERROR " + r.status),
        "keyConfigured: " + j.keyConfigured,
        "writerModel: " + j.writerModel,
        "verifierModel: " + j.verifierModel,
        "herbs in KB: " + j.herbs,
        "checklist gates: " + j.gates,
      ].join("\n");
      el.keyStatus.hidden = false;
      el.keyStatus.className = "key-status " + (j.keyConfigured ? "good" : "bad");
      el.keyStatus.textContent = j.keyConfigured
        ? "المفتاح مضبوط على الخادم."
        : "لا يوجد مفتاح على الخادم — اضبط OPENAI_API_KEY.";
    } catch (e) {
      el.diagOut.textContent = "فشل: " + e.message;
    }
  });

  /* ───────── سجل المحادثات ───────── */

  function readHistory() {
    try {
      const j = JSON.parse(localStorage.getItem(STORE.history) || "[]");
      return Array.isArray(j) ? j : [];
    } catch (_) { return []; }
  }

  function writeHistory(list) {
    localStorage.setItem(STORE.history, JSON.stringify(list.slice(0, 50)));
  }

  function saveCurrentChat() {
    const turns = transcript.filter((t) => t.role === "user" || t.role === "bot");
    if (!turns.length) { toast("لا يوجد شيء لتحفظه بعد."); return; }

    const firstUser = turns.find((t) => t.role === "user");
    const title = (firstUser && firstUser.text ? firstUser.text : "محادثة بلا نص")
      .replace(/\s+/g, " ")
      .slice(0, 60);

    const list = readHistory();
    list.unshift({
      id: uid(),
      title: title || "محادثة",
      turns: turns.map((t) => ({ role: t.role, text: t.text, image: t.image, at: t.at })),
      count: turns.filter((t) => t.role === "user").length,
      savedAt: now(),
    });
    writeHistory(list);
    renderHistory();
    toast("تم الحفظ في السجل.");
  }

  function renderHistory() {
    const list = readHistory();
    el.historyList.innerHTML = "";
    el.historyEmpty.hidden = list.length > 0;

    for (const item of list) {
      const li = document.createElement("li");
      li.className = "history-item";

      const open = document.createElement("button");
      open.className = "history-open";
      open.type = "button";
      open.innerHTML =
        '<span class="history-title">' + esc(item.title) + "</span>" +
        '<span class="history-meta">' + item.count + " سؤالًا · " +
        new Date(item.savedAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) +
        "</span>";
      open.addEventListener("click", () => openHistory(item));
      li.appendChild(open);

      const del = document.createElement("button");
      del.className = "history-del";
      del.type = "button";
      del.setAttribute("aria-label", "حذف المحادثة");
      del.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      del.addEventListener("click", () => confirmDelete(item, li));
      li.appendChild(del);

      el.historyList.appendChild(li);
    }
    if (list.length) el.historyEmpty.hidden = true;
  }

  /* تأكيد الحذف قبل التنفيذ — لا حذف بضغطة واحدة */
  function confirmDelete(item, li) {
    if (li.querySelector(".confirm-row")) return;
    const row = document.createElement("div");
    row.className = "confirm-row";
    const yes = document.createElement("button");
    yes.className = "confirm-btn danger";
    yes.type = "button";
    yes.textContent = "حذف نهائي";
    const no = document.createElement("button");
    no.className = "confirm-btn";
    no.type = "button";
    no.textContent = "إلغاء";

    yes.addEventListener("click", () => {
      const list = readHistory().filter((x) => x.id !== item.id);
      writeHistory(list);
      renderHistory();
      toast("حُذفت المحادثة.");
    });
    no.addEventListener("click", () => row.remove());

    row.appendChild(yes);
    row.appendChild(no);
    li.appendChild(row);
  }

  function openHistory(item) {
    // استرجاع الجلسة السابقة في الساحة
    transcript = item.turns.slice();
    el.chat.innerHTML = "";
    for (const t of transcript) {
      addMessage(t.role === "bot" ? "bot" : "user", t.text, t.image && t.image.dataUrl);
    }
    saveSession();
    closeModal("historyModal");
    toast("فُتحت المحادثة.");
  }

  el.historyBtn.addEventListener("click", () => { renderHistory(); openModal("historyModal"); });
  el.saveChatBtn.addEventListener("click", saveCurrentChat);

  /* ───────── قائمة التحقق ───────── */

  function renderChecklistModal() {
    const list = (typeof GATES !== "undefined" && GATES) || [];
    el.checklistList.innerHTML = "";
    if (!list.length) {
      el.checklistList.innerHTML =
        "<li><strong>لم تُحمّل القائمة</strong><span>اتصل بصاحب المشروع — ملف التحقق مفقود.</span></li>";
      return;
    }
    for (const g of list) {
      const li = document.createElement("li");
      li.innerHTML =
        "<strong>" + esc(g.label) + "</strong><span>" + esc(g.detail) + "</span>";
      el.checklistList.appendChild(li);
    }
  }

  el.checklistBtn.addEventListener("click", () => openModal("checklistModal"));

  /* ───────── عرض سير العمل (SVG) ───────── */

  function renderWorkflow() {
    /* ★ RTL: المسار يبدأ من اليمين وينتهي يسارًا. كل عقدة تُرسم في موضعها
       بحيث يقرأ العربي السهم كما يقرأ النص. الصف الثاني يعود من اليسار لليمين
       ليكمل الحلقة، كما في مخططات الدورات. */
    const nodes = [
      { id: "in",   label: "المستخدم",   x: 780, y: 52 },
      { id: "img",  label: "صورة + نص",  x: 640, y: 52 },
      { id: "tri",  label: "فرز الخطورة", x: 500, y: 52 },
      { id: "kb",   label: "قاعدة الأدلة", x: 360, y: 52 },
      { id: "web",  label: "بحث علمي",   x: 220, y: 52 },
      { id: "w",    label: "كاتب",        x: 80,  y: 52 },
      { id: "v",    label: "مدقق",        x: 80,  y: 178 },
      { id: "ck",   label: "قائمة التحقق", x: 220, y: 178 },
      { id: "himg", label: "صورة المادة", x: 360, y: 178 },
      { id: "out",  label: "الرد",        x: 500, y: 178 },
    ];

    const links = [
      ["in", "img"], ["img", "tri"], ["tri", "kb"], ["kb", "web"], ["web", "w"],
      ["w", "v"], ["v", "ck"], ["ck", "himg"], ["himg", "out"],
    ];

    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const W = 880, H = 240;

    let svg = `<svg class="workflow-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="مسار عمل ميراث: من المستخدم إلى الرد، عبر فرز الخطورة وقاعدة الأدلة والبحث العلمي والكاتب والمدقق وقائمة التحقق">`;

    for (const [a, b] of links) {
      const A = byId[a], B = byId[b];
      const x1 = A.x, y1 = A.y, x2 = B.x, y2 = B.y;

      // بين الصفين: قوس عمودي عند نفس x
      if (x1 === x2) {
        const d = `M${x1},${y1} C${x1 + 42},${(y1 + y2) / 2} ${x2 + 42},${(y1 + y2) / 2} ${x2},${y2}`;
        svg += `<path class="wf-link" d="${d}"/>`;
        svg += `<circle class="wf-particle" r="2.6">
          <animateMotion dur="2.4s" repeatCount="indefinite" path="${d}"/>
        </circle>`;
        continue;
      }

      // بين عقدتين في نفس الصف: قوس أفقي
      const mx = (x1 + x2) / 2;
      const d = `M${x1},${y1} C${mx},${y1 - 16} ${mx},${y2 - 16} ${x2},${y2}`;
      svg += `<path class="wf-link" d="${d}"/>`;
      svg += `<circle class="wf-particle" r="2.6">
        <animateMotion dur="${2.2 + Math.random() * 1.4}s" repeatCount="indefinite" path="${d}"/>
      </circle>`;
    }

    for (const n of nodes) {
      svg += `<g class="wf-node" id="wf-${n.id}" transform="translate(${n.x},${n.y})">
        <circle r="21" fill="rgba(19,42,32,0.92)" stroke="rgba(116,198,157,0.26)"/>
        <text y="36">${esc(n.label)}</text>
      </g>`;
    }

    svg += "</svg>";

    const legend = `
      <div class="workflow-legend">
        <span><i class="legend-dot"></i> مسار الوكيل</span>
        <span>المدقق يستطيع اعتراض الكاتب</span>
        <span>الخطورة تُفرز قبل أي شيء</span>
      </div>`;

    el.workflowCanvas.innerHTML = svg + legend;

    // توهّج متتابع على العقد — بلا نهاية
    const order = ["in", "img", "tri", "kb", "web", "w", "v", "ck", "himg", "out"];
    let i = 0;
    if (el._wfTimer) clearInterval(el._wfTimer);
    el._wfTimer = setInterval(() => {
      if (el.workflowModal.hidden) return;
      order.forEach((id) => {
        const g = document.getElementById("wf-" + id);
        if (g) g.classList.remove("active");
      });
      for (let k = 0; k <= 1; k++) {
        const g = document.getElementById("wf-" + order[(i + k) % order.length]);
        if (g) g.classList.add("active");
      }
      i = (i + 1) % order.length;
    }, 820);
  }

  el.workflowBtn.addEventListener("click", () => {
    renderWorkflow();
    openModal("workflowModal");
  });

  /* ───────── المظهر (الخلفية) ───────── */

  const THEMES = ["forest", "dusk", "ocean", "sand", "plum"];

  function applyTheme(name) {
    const t = THEMES.includes(name) ? name : "forest";
    const body = document.body;
    if (!body) return;
    if (t === "forest") {
      if (body.removeAttribute) body.removeAttribute("data-theme");
    } else if (body.setAttribute) {
      body.setAttribute("data-theme", t);
    }
    if (el.themeGrid) {
      Array.from(el.themeGrid.querySelectorAll(".theme-swatch")).forEach((btn) => {
        btn.setAttribute("aria-checked", String(btn.dataset.theme === t));
      });
    }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(STORE.theme); } catch (_) {}
    applyTheme(saved || "forest");

    if (el.themeGrid) {
      el.themeGrid.addEventListener("click", (e) => {
        const btn = e.target.closest(".theme-swatch");
        if (!btn) return;
        const t = btn.dataset.theme;
        applyTheme(t);
        try { localStorage.setItem(STORE.theme, t); } catch (_) {}
        toast("غُيّر المظهر: " + (btn.querySelector(".sw-name")?.textContent || t));
      });
    }
  }

  initTheme();

  /* ───────── تنبيه صغير ───────── */

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.cssText =
        "position:fixed;bottom:96px;left:50%;transform:translateX(-50%);" +
        "padding:10px 18px;border-radius:12px;background:rgba(26,51,39,0.96);" +
        "border:1px solid rgba(116,198,157,0.24);color:#e8f3ec;font-size:0.84rem;" +
        "z-index:200;box-shadow:0 8px 32px rgba(0,0,0,0.5);transition:all .3s;" +
        "font-family:inherit;pointer-events:none;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  /* ───────── ابدأ ───────── */

  init();

  // للاختبارات: كشف دوال داخلية محدودة
  window.__mirath = {
    formatSimple,
    addMessage,
    transcript: () => transcript,
    saveCurrentChat,
    readHistory,
    writeHistory,
  };
})();
