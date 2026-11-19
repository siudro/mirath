/* app.js — منطق مِيراث
   لا يعرف أي مزوّد بعينه: يطلب PROVIDERS[providerId] من providers.js
*/

const el = {
  chat:         document.getElementById("chat"),
  form:         document.getElementById("form"),
  input:        document.getElementById("input"),
  sendBtn:      document.getElementById("sendBtn"),
  fileInput:    document.getElementById("fileInput"),
  preview:      document.getElementById("preview"),
  previewImg:   document.getElementById("previewImg"),
  removeImg:    document.getElementById("removeImg"),
  settingsBtn:  document.getElementById("settingsBtn"),
  settings:     document.getElementById("settings"),
  apiKey:       document.getElementById("apiKey"),
  modelSel:     document.getElementById("modelSel"),
  saveSettings: document.getElementById("saveSettings"),
  closeSettings:document.getElementById("closeSettings"),
  notice:       document.getElementById("notice"),
  searchToggle: document.getElementById("searchToggle"),
  searchState:  document.getElementById("searchState"),
  diagBtn:      document.getElementById("diagBtn"),
  diagOut:      document.getElementById("diagOut"),
  providerTabs: document.getElementById("providerTabs"),
  keyLink:      document.getElementById("keyLink"),
  keyStatus:    document.getElementById("keyStatus"),
  modelNote:    document.getElementById("modelNote"),
};

const LS = {
  provider: "mirath.provider",
  key:      (p) => `mirath.key.${p}`,
  model:    (p) => `mirath.model.${p}`,
  search:   "mirath.search",
};

const MAX_TURNS = 8;
const WAIT_MS   = 20000;

let history = [];
let pendingImage = null;
let busy = false;
let searchEnabled = true;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---------------- الحالة الحالية ---------------- */

function currentProviderId() {
  const id = localStorage.getItem(LS.provider);
  return PROVIDERS[id] ? id : "deepseek";
}

function currentProvider() {
  return PROVIDERS[currentProviderId()];
}

function currentKey() {
  return (localStorage.getItem(LS.key(currentProviderId())) || "").trim();
}

function currentModel() {
  const p = currentProvider();
  return localStorage.getItem(LS.model(p.id)) || p.defaultModel;
}

/* ---------------- التهيئة ---------------- */

function init() {
  const savedSearch = localStorage.getItem(LS.search);
  searchEnabled = savedSearch === null ? true : savedSearch === "1";
  syncSearchUI();

  const hasKey = Boolean(currentKey());
  if (!hasKey) openSettings();
  evaluateNotice(hasKey);
  autoGrow();
  renderProviderUI();
}

function evaluateNotice(hasKey) {
  el.notice.hidden = Boolean(hasKey);
  if (!hasKey) {
    el.notice.innerHTML =
      "<strong>لا يوجد مفتاح API.</strong> اضغط ⚙ واختر المزوّد وأدخل المفتاح. " +
      "المفتاح يُحفظ في متصفحك فقط.";
  } else {
    el.notice.innerHTML =
      "<strong>تنبيه:</strong> مِيراث مساعد أولي وليس طبيبًا. لا يشخّص ولا يصف دواءً. " +
      "في النزيف الشديد أو إصابة الانفجار — اذهب للطبيب أو اطلب إسعافًا فورًا.";
  }
}

/* ---------------- واجهة المزوّد ---------------- */

function renderProviderUI() {
  const p = currentProvider();

  // تبويبات
  Array.from(el.providerTabs.children).forEach((btn) => {
    const on = btn.dataset.provider === p.id;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });

  // المفتاح المحفوظ لهذا المزوّد
  el.apiKey.value = currentKey();
  el.apiKey.placeholder = p.keyHint;

  // رابط الحصول على المفتاح
  el.keyLink.href = p.keyUrl;
  el.keyLink.textContent = p.keyUrlLabel;

  // الموديلات
  el.modelSel.innerHTML = "";
  p.models.forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m + (p.imageModels.includes(m) ? " (يدعم الصور)" : "");
    el.modelSel.appendChild(o);
  });
  el.modelSel.value = currentModel();

  // ملاحظات المزوّد
  const notes = [];
  if (p.supportsSearch) {
    notes.push("البحث في الإنترنت مدعوم.");
  } else {
    notes.push("البحث في الإنترنت غير مدعوم مع هذا المزوّد.");
  }
  if (!p.imageModels.includes(el.modelSel.value)) {
    notes.push("هذا الموديل لا يقرأ الصور — اختر deepseek-flash.");
  }
  el.modelNote.textContent = notes.join(" ");

  // زر البحث يتبع قدرة المزوّد
  if (el.searchToggle) {
    el.searchToggle.disabled = !p.supportsSearch;
    el.searchToggle.title = p.supportsSearch ? "البحث في الإنترنت" : p.searchNote;
  }

  el.keyStatus.hidden = true;
}

function selectProvider(id) {
  if (!PROVIDERS[id]) return;
  localStorage.setItem(LS.provider, id);
  renderProviderUI();
  evaluateNotice(Boolean(currentKey()));
}

if (el.providerTabs) {
  el.providerTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".provider-tab");
    if (!btn) return;
    selectProvider(btn.dataset.provider);
  });
}

if (el.modelSel) {
  el.modelSel.addEventListener("change", () => {
    const p = currentProvider();
    const notes = [];
    notes.push(p.supportsSearch
      ? "البحث في الإنترنت مدعوم."
      : "البحث في الإنترنت غير مدعوم مع هذا المزوّد.");
    if (!p.imageModels.includes(el.modelSel.value)) {
      notes.push("هذا الموديل لا يقرأ الصور.");
    }
    el.modelNote.textContent = notes.join(" ");
  });
}

/* ---------------- البحث في الإنترنت ---------------- */

function syncSearchUI() {
  if (!el.searchToggle) return;
  el.searchToggle.setAttribute("aria-pressed", String(searchEnabled));
  el.searchToggle.classList.toggle("on", searchEnabled);
  if (el.searchState) el.searchState.textContent = searchEnabled ? "مفعّل" : "متوقف";
}

if (el.searchToggle) {
  el.searchToggle.addEventListener("click", () => {
    if (!currentProvider().supportsSearch) return;
    searchEnabled = !searchEnabled;
    localStorage.setItem(LS.search, searchEnabled ? "1" : "0");
    syncSearchUI();
  });
}

/* ---------------- الإعدادات ---------------- */

function openSettings() {
  el.settings.hidden = false;
  renderProviderUI();
  el.apiKey.focus();
}

function closeSettings() { el.settings.hidden = true; }

el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.settings.addEventListener("click", (e) => {
  if (e.target === el.settings) closeSettings();
});

el.saveSettings.addEventListener("click", () => {
  const p = currentProvider();
  const key = el.apiKey.value.trim();

  if (!key) {
    el.keyStatus.hidden = false;
    el.keyStatus.textContent = "أدخل المفتاح أولًا.";
    el.keyStatus.className = "key-status bad";
    return;
  }

  localStorage.setItem(LS.key(p.id), key);
  localStorage.setItem(LS.model(p.id), el.modelSel.value);
  evaluateNotice(true);

  el.keyStatus.hidden = false;
  el.keyStatus.textContent = `تم الحفظ — ${p.label} · ${el.modelSel.value}`;
  el.keyStatus.className = "key-status good";
  closeSettings();
});

/* ---------------- التشخيص ---------------- */

async function runDiagnostics() {
  const p = currentProvider();
  const key = el.apiKey.value.trim() || currentKey();
  const out = el.diagOut;
  out.hidden = false;

  if (!key) {
    out.textContent = "لا يوجد مفتاح. أدخله ثم اضغط حفظ.";
    return;
  }

  out.textContent = "جارٍ الفحص…";
  const lines = [];
  lines.push(`provider: ${p.label} (${p.id})`);
  lines.push(`key: ${key.slice(0, 6)}…${key.slice(-4)}  (${key.length} حرفًا)`);
  lines.push("");

  try {
    const models = await p.listModels(key);
    lines.push(`models.list: OK — ${models.length} موديل`);
    lines.push("");
    p.models.forEach((m) => {
      lines.push(`  ${models.includes(m) ? "متاح   " : "غير متاح"}  ${m}`);
    });
    lines.push("");
    lines.push(`الموديل المختار: ${el.modelSel.value}`);
  } catch (e) {
    lines.push("models.list: فشل");
    lines.push(e.message);
  }

  out.textContent = lines.join("\n");
}

if (el.diagBtn) el.diagBtn.addEventListener("click", runDiagnostics);

/* ---------------- محرّر النص ---------------- */

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

/* ---------------- الصور ---------------- */

el.fileInput.addEventListener("change", () => {
  const file = el.fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("أرفق صورة فقط.");
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    alert("حجم الصورة كبير. الحد ٤ ميغابايت.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    pendingImage = { dataUrl, base64: dataUrl.split(",")[1], mimeType: file.type };
    el.previewImg.src = dataUrl;
    el.preview.hidden = false;
  };
  reader.readAsDataURL(file);
});

el.removeImg.addEventListener("click", clearImage);

function clearImage() {
  pendingImage = null;
  el.preview.hidden = true;
  el.previewImg.removeAttribute("src");
  el.fileInput.value = "";
}

/* ---------------- رسم الرسائل ---------------- */

function addMessage(role, text, imageDataUrl) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (text) {
    text.split("\n").forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line || "\u00a0";
      bubble.appendChild(p);
    });
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
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.id = "typing";
  wrap.className = "msg bot typing";
  wrap.innerHTML = '<div class="bubble">أفكّر</div>';
  el.chat.appendChild(wrap);
  scrollToEnd();
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function scrollToEnd() { el.chat.scrollTop = el.chat.scrollHeight; }

function showWaiting(on) {
  const id = "waiting-note";
  const old = document.getElementById(id);
  if (old) old.remove();
  if (!on) return;
  const d = document.createElement("div");
  d.id = id;
  d.className = "msg bot";
  d.innerHTML = '<div class="bubble">تجاوزنا الحد اللحظي — أنتظر قليلًا ثم أُكمل…</div>';
  el.chat.appendChild(d);
  scrollToEnd();
}

/* ---------------- الإرسال ---------------- */

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const text = el.input.value.trim();
  if (!text && !pendingImage) return;

  const provider = currentProvider();
  const key = currentKey();
  if (!key) { openSettings(); return; }

  const model = currentModel();
  const imgSnapshot = pendingImage ? pendingImage.dataUrl : null;
  addMessage("user", text, imgSnapshot);

  const parts = [];
  if (text) parts.push({ text });
  if (pendingImage) {
    parts.push({
      inline_data: { mime_type: pendingImage.mimeType, data: pendingImage.base64 },
    });
  }
  history.push({ role: "user", parts });

  // صورة + موديل بلا رؤية: لا نُرسل طلبًا بلا فائدة — نوقف ونشرح.
  if (imgSnapshot && !provider.imageModels.includes(model)) {
    addMessage("error",
      `الموديل ${model} لا يقرأ الصور. افتح ⚙ واختر موديلًا يدعم الصور` +
      (provider.id === "deepseek" ? " (deepseek-flash)." : ".") +
      " — أو أرسل وصفًا نصيًا للجرح.");
    history.pop();
    el.input.value = text;
    autoGrow();
    clearImage();
    return;
  }

  el.input.value = "";
  autoGrow();
  clearImage();
  setBusy(true);
  addTyping();

  try {
    const reply = await chatWith(provider, key, model);
    removeTyping();
    addMessage("bot", reply);
    history.push({ role: "model", parts: [{ text: reply }] });
  } catch (err) {
    removeTyping();
    addMessage("error", err.message);
    history.pop();
  } finally {
    setBusy(false);
  }
});

function setBusy(state) {
  busy = state;
  el.sendBtn.disabled = state;
  el.input.disabled = state;
}

/* ---------------- استدعاء المزوّد ---------------- */

function historyWindow() {
  return history.slice(-MAX_TURNS);
}

async function chatWith(provider, key, model) {
  const body =
    provider.id === "gemini"
      ? geminiBody(model)
      : provider.buildBody({
          systemPrompt: SYSTEM_PROMPT,
          history: historyWindow(),
          searchEnabled,
        });

  if (provider.id !== "gemini") body.model = model;

  const url =
    provider.id === "gemini"
      ? `${provider.baseUrl}/${model}:generateContent?key=${encodeURIComponent(key)}`
      : `${provider.baseUrl}${provider.chatPath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: provider.headers(key),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error && j.error.message) detail = j.error.message;
      else if (j.message) detail = j.message;
    } catch (_) { /* تجاهل */ }
    throw new Error(friendlyError(res.status, detail, provider));
  }

  const json = await res.json();
  const reply = provider.readReply(json);
  if (!reply) throw new Error("لم يصل رد من الموديل. أعد المحاولة.");
  return reply;
}

function geminiBody(model) {
  const isV3 = /^gemini-(3|4)/.test(model);
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: historyWindow(),
    generationConfig: { maxOutputTokens: 2048 },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };
  if (isV3) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  else body.generationConfig.temperature = 0.4;
  if (searchEnabled) body.tools = [{ google_search: {} }];
  return body;
}

function friendlyError(status, detail, provider) {
  const d = String(detail || "").toLowerCase();

  if (status === 401 || d.includes("invalid") && d.includes("key") || d.includes("authentication")) {
    return `المفتاح غير صحيح لـ ${provider.label}. راجع ⚙.`;
  }
  if (status === 402 || d.includes("insufficient balance") || d.includes("余额") || d.includes("balance")) {
    return `${provider.label}: رصيد الحساب غير كافٍ. اشحن الحساب من لوحة المزوّد.`;
  }
  if (status === 403) return `${provider.label}: المفتاح لا يملك صلاحية على هذا الموديل.`;
  if (status === 404) return `${provider.label}: الموديل غير موجود لهذا الحساب. جرّب موديلًا آخر من ⚙.`;
  if (status === 429) return `${provider.label}: تجاوزت حد الاستخدام. انتظر قليلًا ثم أعد المحاولة.`;
  if (status >= 500) return `${provider.label}: الخدمة متعطّلة مؤقتًا. أعد المحاولة.`;
  return detail;
}

init();
