/* app.js — منطق مِيراث
   يتصل بـ Gemini API، يحفظ المفتاح محليًا، يدعم الصور.
   لا شيء يُرسل لأي جهة غير Google.
*/

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/* ترتيب المحاولة. Google تغلق الموديلات القديمة أمام الحسابات الجديدة،
   فننتقل تلقائيًا إلى التالي بدل أن يتعطّل التطبيق. */
const MODEL_FALLBACKS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

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
  diagBtn:     document.getElementById("diagBtn"),
  diagOut:     document.getElementById("diagOut"),
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

/* ---------------- تشخيص الاتصال ---------------- */

/* يطلب قائمة الموديلات المتاحة لهذا المفتاح — لا يستهلك توكنات inference،
   فيكشف إن كان المفتاح صالحًا، وأي الموديلات فعلاً مفتوحة للحساب. */
async function runDiagnostics() {
  const key = (localStorage.getItem(STORE_KEY) || "").trim();
  const out = el.diagOut;
  out.hidden = false;
  out.textContent = "جارٍ الفحص…";

  if (!key) {
    out.textContent = "لا يوجد مفتاح. أدخله ثم اضغط حفظ أولًا.";
    return;
  }

  const lines = [];
  lines.push("key: " + key.slice(0, 6) + "..." + key.slice(-4) + "  (" + key.length + " حرفًا)");

  try {
    const r = await fetch(`${API_URL}?key=${encodeURIComponent(key)}&pageSize=200`);
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      lines.push("models.list: HTTP " + r.status);
      if (j.error && j.error.message) lines.push(j.error.message);
      out.textContent = lines.join("\n");
      return;
    }

    lines.push("models.list: OK");
    const names = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace("models/", ""))
      .filter((n) => /gemini/.test(n));

    lines.push("متاح للـ generateContent: " + names.length);
    lines.push("");
    MODEL_FALLBACKS.forEach((m) => {
      lines.push((names.includes(m) ? "  متاح   " : "  غير متاح ") + m);
    });
    lines.push("");
    lines.push("الموديل المختار: " + (localStorage.getItem(MODEL_KEY) || "—"));
  } catch (e) {
    lines.push("خطأ شبكة: " + e.message);
  }

  out.textContent = lines.join("\n");
}

if (el.diagBtn) el.diagBtn.addEventListener("click", runDiagnostics);

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
    const reply = await callGemini(key, model);
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

/* نرسل آخر N رسالة فقط. التعليمات ثقيلة (~5.5k توكن)، وإرسال كل التاريخ
   في كل مرة يصطدم بحد TPM (توكنات/دقيقة) بسرعة. */
const MAX_TURNS = 8;   // 4 تبادلات

function bodyFor(model) {
  const isGemini3 = /^gemini-(3|4)/.test(model);

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history.slice(-MAX_TURNS),
    generationConfig: {
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  // Gemini 3.x: خفّض التفكير لتقليل التوكنات وزمن الرد.
  // Gemini 2.5 والأقدم: temperature يعمل، فنضبطه.
  if (isGemini3) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else {
    body.generationConfig.temperature = 0.4;
  }

  if (searchEnabled) {
    body.tools = [{ google_search: {} }];
  }
  return body;
}

/* 429 له سببان مختلفان تمامًا:
   - حد الطلبات في الدقيقة → ننتظر ونعيد (retryable)
   - الحصة اليومية خلصت  → لا فائدة من إعادة المحاولة الآن (fatal) */
function rateLimitKind(detail) {
  const d = String(detail || "").toLowerCase();
  // الحصة اليومية أو حصة المشروع — لا فائدة من إعادة المحاولة قريبًا
  if (d.includes("per day") || d.includes("daily") || d.includes("rpd") ||
      d.includes("free_tier") || d.includes("quota exceeded") ||
      d.includes("billing")) {
    return "daily";
  }
  return "minute";
}

/* موديل لم يعد متاحًا لهذا الحساب؟ */
function isRetiredModel(status, detail) {
  const d = String(detail || "").toLowerCase();
  return (
    status === 404 ||
    d.includes("no longer available") ||
    d.includes("is not found") ||
    d.includes("not supported") ||
    d.includes("deprecated")
  );
}

async function callModel(key, model) {
  const res = await fetch(`${API_URL}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyFor(model)),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error && j.error.message) detail = j.error.message;
    } catch (_) { /* تجاهل */ }
    const err = new Error(mapError(res.status, detail));
    err.status = res.status;
    err.retired = isRetiredModel(res.status, detail);
    err.rateLimited = res.status === 429;
    err.rateKind = res.status === 429 ? rateLimitKind(detail) : null;
    throw err;
  }

  const data = await res.json();
  const candidate = data.candidates && data.candidates[0];

  if (!candidate) throw new Error("لم يصل رد من الموديل. أعد المحاولة.");

  if (candidate.finishReason === "SAFETY") {
    return "لا أستطيع الإجابة على هذا الطلب. إن كان الجرح خطيرًا فأقرب خطوة هي طلب رعاية طبية.";
  }

  const parts = (candidate.content && candidate.content.parts) || [];
  const out = parts.map((p) => p.text || "").join("").trim();

  if (!out) throw new Error("الرد كان فارغًا. أعد المحاولة.");
  return out;
}

const WAIT_MS = 20000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* إشعار انتظار داخل المحادثة */
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

async function callGemini(key, preferredModel) {
  let attemptedWait = false;
  // جرّب الموديل المختار أولًا، ثم الباقي بالترتيب، بلا تكرار
  const order = [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)];

  let lastErr = null;
  let sawRetired = false;

  for (const model of order) {
    try {
      const reply = await callModel(key, model);

      // نجح — ثبّت الموديل العامل حتى لا نعيد المحاولة كل رسالة
      if (model !== preferredModel) {
        localStorage.setItem(MODEL_KEY, model);
        el.modelSel.value = model;
      }
      return reply;
    } catch (err) {
      lastErr = err;

      // حد الدقيقة: ننتظر ونعيد نفس الموديل مرة واحدة
      if (err.rateLimited && err.rateKind === "minute" && !attemptedWait) {
        attemptedWait = true;
        showWaiting(true);
        await sleep(WAIT_MS);
        showWaiting(false);
        try {
          return await callModel(key, model);
        } catch (e2) {
          lastErr = e2;
          if (!e2.retired) throw e2;
        }
      }

      // حد يومي: لا فائدة من تكرار المحاولة الآن
      if (err.rateLimited && err.rateKind === "daily") throw err;

      if (!err.retired) throw err;   // خطأ حقيقي (مفتاح/شبكة) — لا نجرّب غيره
      sawRetired = true;
    }
  }

  if (sawRetired) {
    throw new Error(
      "الموديلات المتاحة لك غير مدعومة من هذه النسخة. افتح ⚙ وجرّب موديلًا آخر."
    );
  }
  throw lastErr || new Error("تعذّر الاتصال.");
}

function mapError(status, detail) {
  if (status === 400 && /API key not valid/i.test(detail)) {
    return "المفتاح غير صحيح. راجع ⚙.";
  }
  if (status === 403) return "المفتاح لا يملك صلاحية على هذا الموديل.";
  if (status === 429) {
    if (rateLimitKind(detail) === "daily") {
      return "خلصت الحصة اليومية المجانية لهذا المفتاح. " +
             "الحل: انتظر حتى منتصف الليل بتوقيت المحيط الهادئ، أو أنشئ مفتاحًا جديدًا من aistudio.google.com/apikey";
    }
    return "الحد اللحظي (طلبات في الدقيقة). انتظر ٢٠-٦٠ ثانية ثم أرسل مرة أخرى.";
  }
  if (status >= 500) return "خدمة Google تتعطّل مؤقتًا. أعد المحاولة.";
  return detail;
}

init();
