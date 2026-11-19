/* tests.js — اختبارات منطق التطبيق، بلا شبكة وبلا متصفح.
   التشغيل:  node tests.js
   كل اختبار يفشل loudly بدل أن يمرّ بصمت.
*/

const fs = require("fs");
const vm = require("vm");

let passed = 0, failed = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; failures.push(name); console.log("  ✗ " + name); }
}

function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, `${name}  →  ${a}${a === e ? "" : " (توقعنا " + e + ")"}`);
}

/* ---------- بيئة وهمية ---------- */

function makeEl() {
  const node = {
    addEventListener() {}, appendChild() {}, setAttribute() {}, removeAttribute() {},
    requestSubmit() {}, focus() {}, remove() {}, closest() { return null; },
    style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
    value: "", textContent: "", innerHTML: "", src: "", id: "", hidden: true,
    children: [], disabled: false, title: "", placeholder: "", href: "",
  };
  return node;
}

function boot({ saved = {}, fetchImpl } = {}) {
  const store = Object.assign({}, saved);
  const calls = { fetch: 0, urls: [], bodies: [] };

  const fakeFetch = async (url, opts) => {
    calls.fetch++;
    calls.urls.push(url);
    if (opts && opts.body) calls.bodies.push(JSON.parse(opts.body));
    return fetchImpl(url, opts, calls);
  };

  const ctx = {
    console: { log() {} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: { getElementById: makeEl, createElement: makeEl },
    alert() {},
    FileReader: function () {},
    encodeURIComponent,
    setTimeout: (f) => setTimeout(f, 0),
    fetch: fakeFetch,
    Promise, Object, Array, JSON, Error, String, Boolean, RegExp, Math, Date,
  };

  vm.createContext(ctx);

  // أسماء const داخل runInContext لا تُصبح خصائص على ctx،
  // فنُصدّرها صراحة بعد تنفيذ كل ملف.
  const export_ = (names) =>
    names.map((n) => `globalThis.${n} = ${n};`).join("\n");

  vm.runInContext(
    fs.readFileSync("prompt.js", "utf8") + "\n" + export_(["SYSTEM_PROMPT"]),
    ctx
  );
  vm.runInContext(
    fs.readFileSync("providers.js", "utf8") + "\n" + export_(["PROVIDERS", "PROVIDER_LIST"]),
    ctx
  );

  const appSrc = fs.readFileSync("app.js", "utf8");
  // init() و submit listener يعتمدون على DOM حقيقي — نُبقيها لكن الوهمي يتحملها.
  vm.runInContext(
    appSrc + "\n" + export_([
      "history", "chatWith", "geminiBody", "friendlyError",
      "historyWindow", "currentProviderId", "currentProvider",
      "currentKey", "currentModel", "selectProvider",
    ]),
    ctx
  );

  return { ctx, store, calls };
}

/* ===================================================== */

console.log("\n── ١. نص النظام ──");
{
  const { ctx } = boot({});
  const prompt = ctx.SYSTEM_PROMPT;
  ok(typeof prompt === "string", "SYSTEM_PROMPT نص");
  ok(prompt.length > 15000, `نص النظام كامل (${prompt.length} حرف)`);
  ok(prompt.includes("مِيراث"), "يحمل هوية ميراث");
  ok(prompt.includes("هدفك مساعدة الإنسان وحمايته"), "المبدأ الأساسي موجود");
  ok(prompt.includes("قشر الرمان"), "قشر الرمان في القاعدة");
  ok(prompt.includes("العفص"), "العفص في القاعدة");
  ok(prompt.includes("المرّة"), "المرّة في القاعدة");
}

console.log("\n── ٢. طبقة المزوّدين ──");
{
  const { ctx } = boot({});
  const P = ctx.PROVIDERS;
  ok(Boolean(P.deepseek && P.gemini), "المزوّدان معرّفان");
  eq(P.deepseek.baseUrl, "https://api.deepseek.com", "عنوان DeepSeek");
  eq(P.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta", "عنوان Gemini");
  ok(P.deepseek.models.includes("deepseek-flash"), "deepseek-flash ضمن الموديلات");
  ok(P.deepseek.imageModels.includes("deepseek-flash"), "deepseek-flash يدعم الصور");
  ok(!P.deepseek.imageModels.includes("deepseek-v4-pro"), "v4-pro ليس في قائمة الصور");
  ok(P.gemini.supportsSearch === true, "Gemini يدعم البحث");
  ok(P.deepseek.supportsSearch === false, "DeepSeek لا يدعم البحث");
}

console.log("\n── ٣. بناء طلب DeepSeek ──");
{
  const { ctx } = boot({});
  const p = ctx.PROVIDERS.deepseek;
  const body = p.buildBody({
    systemPrompt: "SYS",
    history: [
      { role: "user", parts: [{ text: "مرحبا" }] },
      { role: "model", parts: [{ text: "أهلًا" }] },
    ],
    searchEnabled: true,
  });

  eq(body.messages[0].role, "system", "أول رسالة = system");
  eq(body.messages[0].content, "SYS", "نص النظام في system");
  eq(body.messages[1].role, "user", "الدور user محفوظ");
  eq(body.messages[2].role, "assistant", "دور model → assistant");
  eq(body.messages[1].content, "مرحبا", "نص المستخدم نصّي بلا صورة");
  ok(!("tools" in body), "DeepSeek لا يرسل tools");
  eq(body.thinking, { type: "disabled" }, "التفكير معطّل لتقليل التكلفة");
}

console.log("\n── ٤. الصور في DeepSeek ──");
{
  const { ctx } = boot({});
  const p = ctx.PROVIDERS.deepseek;
  const body = p.buildBody({
    systemPrompt: "S",
    history: [{
      role: "user",
      parts: [
        { text: "شوف الجرح" },
        { inline_data: { mime_type: "image/png", data: "AAA" } },
      ],
    }],
  });
  const content = body.messages[1].content;
  ok(Array.isArray(content), "مع الصورة: content مصفوفة");
  eq(content[0], { type: "text", text: "شوف الجرح" }, "جزء نصي");
  eq(content[1].type, "image_url", "جزء صورة");
  ok(content[1].image_url.url.startsWith("data:image/png;base64,"), "الصورة data URL");
}

console.log("\n── ٥. بناء طلب Gemini ──");
{
  const { ctx } = boot({
    saved: { "mirath.provider": "gemini", "mirath.key.gemini": "K" },
  });
  const gb = ctx.geminiBody("gemini-3.8-flash");
  eq(gb.system_instruction.parts[0].text.length > 15000, true, "نص النظام مُضمَّن");
  ok(!("temperature" in gb.generationConfig), "لا temperature على Gemini 3.x");
  eq(gb.generationConfig.thinkingConfig, { thinkingBudget: 0 }, "التفكير مطفأ");
  ok(Array.isArray(gb.tools) && gb.tools[0].google_search, "أداة البحث مُرسلة");

  const gb25 = ctx.geminiBody("gemini-2.5-flash");
  eq(gb25.generationConfig.temperature, 0.4, "Gemini 2.5 يحتفظ بـ temperature");
  ok(!("thinkingConfig" in gb25.generationConfig), "لا thinkingConfig على 2.5");
}

console.log("\n── ٦. قراءة الردود ──");
{
  const { ctx } = boot({});
  const ds = ctx.PROVIDERS.deepseek;
  const gm = ctx.PROVIDERS.gemini;

  eq(ds.readReply({ choices: [{ message: { content: " رد " } }] }), "رد", "DeepSeek نص عادي");
  eq(ds.readReply({ choices: [{ message: { content: "", reasoning_content: "تفكير" } }] }), null,
     "DeepSeek: تفكير بلا نص → لا نص");
  eq(ds.readReply({}), null, "DeepSeek: رد فارغ → null");

  eq(gm.readReply({ candidates: [{ content: { parts: [{ text: "أ" }, { text: "ب" }] } }] }), "أب",
     "Gemini: دمج الأجزاء");
  eq(gm.readReply({}), null, "Gemini: رد فارغ → null");
}

console.log("\n── ٧. ترويسات وكيل ──");
{
  const { ctx } = boot({});
  const h = ctx.PROVIDERS.deepseek.headers("sk-123");
  eq(h.Authorization, "Bearer sk-123", "DeepSeek يرسل Bearer");
  const gh = ctx.PROVIDERS.gemini.headers("AIza");
  ok(!("Authorization" in gh), "Gemini لا يرسل Bearer");
}

console.log("\n── ٨. الأخطاء المفهومة ──");
{
  const { ctx } = boot({});
  const P = ctx.PROVIDERS.deepseek;

  const m401 = ctx.friendlyError(401, "Authentication Fails", P);
  ok(m401.includes("غير صحيح"), "401 → مفتاح غير صحيح");

  const m402 = ctx.friendlyError(402, "Insufficient Balance", P);
  ok(m402.includes("رصيد"), "402 → رصيد غير كافٍ");

  const m429 = ctx.friendlyError(429, "Rate limit", P);
  ok(m429.includes("حد الاستخدام"), "429 → حد الاستخدام");

  const m500 = ctx.friendlyError(500, "boom", P);
  ok(m500.includes("متعطّلة"), "500 → تعطّل مؤقت");
}

console.log("\n── ٩. السجل محدود ──");
{
  const { ctx } = boot({});
  const h = ctx.historyWindow;
  for (let i = 0; i < 30; i++) ctx.history.push({ role: "user", parts: [{ text: "x" + i }] });
  eq(h().length, 8, "يرسل ٨ رسائل كحد أقصى");
  eq(h()[7].parts[0].text, "x29", "يحتفظ بأحدث الرسائل");
}

console.log("\n── ١٠. اختيار المزوّد والمفتاح ──");
{
  const a = boot({ saved: {} });
  eq(a.ctx.currentProviderId(), "deepseek", "الافتراضي DeepSeek");
  eq(a.ctx.currentKey(), "", "لا مفتاح في البداية");

  const b = boot({
    saved: {
      "mirath.provider": "gemini",
      "mirath.key.gemini": "AIzaXYZ",
      "mirath.model.gemini": "gemini-3.6-flash",
    },
  });
  eq(b.ctx.currentProviderId(), "gemini", "يقرأ المزوّد المحفوظ");
  eq(b.ctx.currentKey(), "AIzaXYZ", "يقرأ مفتاح المزوّد الصحيح");
  eq(b.ctx.currentModel(), "gemini-3.6-flash", "يقرأ الموديل المحفوظ");
}

console.log("\n── ١١. مفاتيح منفصلة لكل مزوّد ──");
{
  const { ctx, store } = boot({ saved: {} });
  store["mirath.key.deepseek"] = "sk-DS";
  store["mirath.key.gemini"] = "AIza-GM";

  ctx.selectProvider("deepseek");
  eq(ctx.currentKey(), "sk-DS", "DeepSeek يرى مفتاحه");
  ctx.selectProvider("gemini");
  eq(ctx.currentKey(), "AIza-GM", "Gemini يرى مفتاحه");
  ctx.selectProvider("deepseek");
  eq(ctx.currentKey(), "sk-DS", "العودة لا تفقد المفتاح");
}

console.log("\n── ١٢. نداء DeepSeek كامل (شبكة وهمية) ──");
(async () => {
  const { ctx, calls } = boot({
    saved: { "mirath.provider": "deepseek", "mirath.key.deepseek": "sk-TEST" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "اغسل يديك واضغط الجرح." } }] }),
    }),
  });

  try {
    const reply = await ctx.chatWith(ctx.PROVIDERS.deepseek, "sk-TEST", "deepseek-flash");
    eq(reply, "اغسل يديك واضغط الجرح.", "الرد يعود كنص");
    ok(calls.urls[0].includes("api.deepseek.com/chat/completions"), "العنوان صحيح");
    eq(calls.bodies[0].model, "deepseek-flash", "اسم الموديل في الطلب");
    ok(Array.isArray(calls.bodies[0].messages), "messages مصفوفة");
  } catch (e) {
    ok(false, "نداء DeepSeek بلا استثناء — " + e.message);
  }

  console.log("\n── ١٣. خطأ 402 رصيد ──");
  {
    const b = boot({
      saved: { "mirath.provider": "deepseek", "mirath.key.deepseek": "sk-T" },
      fetchImpl: async () => ({
        ok: false,
        status: 402,
        json: async () => ({ error: { message: "Insufficient Balance" } }),
      }),
    });
    try {
      await b.ctx.chatWith(b.ctx.PROVIDERS.deepseek, "sk-T", "deepseek-flash");
      ok(false, "كان يجب أن يرمي خطأ");
    } catch (e) {
      ok(e.message.includes("رصيد"), "رسالة الرصيد تظهر للمستخدم");
    }
  }

  console.log("\n── ١٤. جسر الرؤية ──");
  {
    const b = boot({ saved: {} });
    const IMG = "data:image/jpeg;base64,/9j/AAA";
    const body = b.ctx.PROVIDERS.deepseek.buildBody({
      systemPrompt: "S",
      history: b.ctx.historyWindow(),
      image: IMG,
    });
    ok(body.messages.length >= 1, "الجسر يبني messages");
    ok(b.ctx.PROVIDERS.deepseek.imageModels.includes("deepseek-flash"), "الموديل معلن كداعم للصور");
  }

  console.log(`\n${"═".repeat(52)}`);
  console.log(`  نجح: ${passed}   فشل: ${failed}`);
  if (failed) {
    console.log("\n  الاختبارات الفاشلة:");
    failures.forEach((f) => console.log("   • " + f));
  }
  console.log("═".repeat(52) + "\n");
  process.exit(failed ? 1 : 0);
})();
