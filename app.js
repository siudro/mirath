/* app.js — منطق مِيراث
   يتصل بـ Gemini API، يحفظ المفتاح محليًا، يدعم الصور.
   لا شيء يُرسل لأي جهة غير Google.
*/

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const el = {
  chat:        document.getElementById("chat"),
  form:        document.getElementById("form"),
  input:       document.getElementById("input"),
  sendBtn:     document.getElementById("sendBtn"),
  fileInput:   document.getElementById("fileInput"),
  preview:     document.getElementById("preview"),
  previewImg:  document.getElementById("previewImg"),
  removeImg:   document.getElementById("removeImg"),
  settingsBtn: document.getElementById("settingsBtn"),
  settings:    document.getElementById("settings"),
  apiKey:      document.getElementById("apiKey"),
  modelSel:    document.getElementById("modelSel"),
  saveSettings:document.getElementById("saveSettings"),
  closeSettings:document.getElementById("closeSettings"),
  notice:      document.getElementById("notice"),
  searchToggle:document.getElementById("searchToggle"),
  searchState: document.getElementById("searchState"),
};

const STORE_KEY  = "mirath.apiKey";
const MODEL_KEY  = "mirath.model";
const SEARCH_KEY = "mirath.search";

/* المحادثة بصيغة Gemini:
   [{ role: "user" | "model", parts: [{ text }] | [{ inline_data }] }] */
let history = [];
let pendingImage = null;   // { dataUrl, base64, mimeType }
let busy = false;
let searchEnabled = true;  // البحث في الإنترنت — مفعّل افتراضيًا

/* ---------------- التهيئة ---------------- */

function init() {
  const saved = localStorage.getItem(STORE_KEY);
  const savedModel = localStorage.getItem(MODEL_KEY);
  if (saved) el.apiKey.value = saved;
  if (savedModel) el.modelSel.value = savedModel;

  const savedSearch = localStorage.getItem(SEARCH_KEY);
  searchEnabled = savedSearch === null ? true : savedSearch === "1";
  syncSearchUI();

  if (!saved) openSettings();
  evaluateNotice(saved);
  autoGrow();
}

function evaluateNotice(hasKey) {
  // التنبيه يظهر إذا لم يكن هناك مفتاح (أي المساعد معطّل)
  el.notice.hidden = Boolean(hasKey);
  if (!hasKey) {
    el.notice.innerHTML =
      "<strong>لا يوجد مفتاح API.</strong> اضغط ⚙ وأدخل مفتاح Google AI Studio لتعمل المحادثة. " +
      "المساعد لا يخزّن المفتاح ولا يرسله لأي جهة غير Google.";
  } else {
    el.notice.innerHTML =
      "<strong>تنبيه:</strong> مِيراث مساعد أولي وليس طبيبًا. لا يشخّص ولا يصف دواءً. " +
      "في النزيف الشديد أو إصابة الانفجار — اذهب للطبيب أو اطلب إسعافًا فورًا.";
  }
}

/* ---------------- البحث في الإنترنت ---------------- */

function syncSearchUI() {
  if (!el.searchToggle) return;
  el.searchToggle.setAttribute("aria-pressed", String(searchEnabled));
  el.searchToggle.classList.toggle("on", searchEnabled);
  if (el.searchState) {
    el.searchState.textContent = searchEnabled ? "مفعّل" : "متوقف";
  }
}

function toggleSearch() {
  searchEnabled = !searchEnabled;
  localStorage.setItem(SEARCH_KEY, searchEnabled ? "1" : "0");
  syncSearchUI();
}

if (el.searchToggle) {
  el.searchToggle.addEventListener("click", toggleSearch);
}

/* ---------------- الإعدادات ---------------- */

function openSettings() {
  el.settings.hidden = false;
  el.apiKey.focus();
}

function closeSettings() {
  el.settings.hidden = true;
}

el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.settings.addEventListener("click", (e) => {
  if (e.target === el.settings) closeSettings();
});

el.saveSettings.addEventListener("click", () => {
  const key = el.apiKey.value.trim();
  const model = el.modelSel.value;

  if (!key) {
    alert("أدخل مفتاح API أولًا.");
    return;
  }

  localStorage.setItem(STORE_KEY, key);
  localStorage.setItem(MODEL_KEY, model);
  evaluateNotice(true);
  closeSettings();
});

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
    pendingImage = {
      dataUrl,
      base64: dataUrl.split(",")[1],
      mimeType: file.type,
    };
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
    // نعرض النص مع احترام أسطر جديدة
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
  wrap.className = "msg bot typing";
  wrap.id = "typing";
  wrap.innerHTML = '<div class="bubble">أفكّر</div>';
  el.chat.appendChild(wrap);
  scrollToEnd();
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function scrollToEnd() {
  el.chat.scrollTop = el.chat.scrollHeight;
}

/* ---------------- الإرسال ---------------- */

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const text = el.input.value.trim();
  if (!text && !pendingImage) return;

  const key = localStorage.getItem(STORE_KEY);
  if (!key) {
    openSettings();
    return;
  }

  const model = localStorage.getItem(MODEL_KEY) || "gemini-2.5-flash";

  // 1) عرض رسالة المستخدم
  const imgSnapshot = pendingImage ? pendingImage.dataUrl : null;
  addMessage("user", text, imgSnapshot);

  // 2) بناء أجزاء الطلب
  const parts = [];
  if (text) parts.push({ text });
  if (pendingImage) {
    parts.push({
      inline_data: {
        mime_type: pendingImage.mimeType,
        data: pendingImage.base64,
      },
    });
  }

  history.push({ role: "user", parts });

  // 3) تصفير المدخلات
  el.input.value = "";
  autoGrow();
  clearImage();
  setBusy(true);

  // 4) الطلب
  addTyping();

  try {
    const reply = await callGemini(key, model, parts);
    removeTyping();
    addMessage("bot", reply);
    history.push({ role: "model", parts: [{ text: reply }] });
  } catch (err) {
    removeTyping();
    addMessage("error", "تعذّر الاتصال: " + err.message);
    // نتراجع عن آخر رسالة حتى لا يتلوّث السياق برسالة بلا جواب
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

async function callGemini(key, model, userParts) {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  // البحث في الإنترنت — اختياري، يعمل مع gemini-2.5-*
  if (searchEnabled) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(`${API_URL}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error && j.error.message) detail = j.error.message;
    } catch (_) { /* تجاهل */ }
    throw new Error(mapError(res.status, detail));
  }

  const data = await res.json();

  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    throw new Error("لم يصل رد من الموديل. أعد المحاولة.");
  }

  if (candidate.finishReason === "SAFETY") {
    return "لا أستطيع الإجابة على هذا الطلب. إن كان الجرح خطيرًا فأقرب خطوة هي طلب رعاية طبية.";
  }

  const parts = (candidate.content && candidate.content.parts) || [];
  const out = parts.map((p) => p.text || "").join("").trim();

  if (!out) throw new Error("الرد كان فارغًا. أعد المحاولة.");
  return out;
}

function mapError(status, detail) {
  if (status === 400 && /API key not valid/i.test(detail)) {
    return "المفتاح غير صحيح. راجع ⚙.";
  }
  if (status === 403) return "المفتاح لا يملك صلاحية على هذا الموديل.";
  if (status === 429) return "تجاوزت حد الاستخدام. انتظر دقيقة.";
  if (status >= 500) return "خدمة Google تتعطّل مؤقتًا. أعد المحاولة.";
  return detail;
}

init();
