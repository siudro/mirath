/* tests/server.test.js — اختبارات الخادم بلا شبكة.
   تحاكي OpenAI وEurope PMC وWikimedia، وتتحقق من خط الأنابيب كاملًا:
   فرز، استرجاع، مسودة، تدقيق، بوابة، صورة، رد. */

"use strict";

const assert = require("assert");

/* نقف اعتماديات الشبكة قبل تحميل الخادم */
const realFetch = global.fetch;

function stubFetch(handler) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (handler) {
      const r = await handler(u, opts);
      if (r) return r;
    }
    throw new Error("fetch غير متوقع: " + u);
  };
}

function jsonResponse(obj, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => obj,
    headers: { get: () => "application/json" },
  };
}

/* SSE قارئ وهمي */
function streamResponse(events) {
  let payload = "";
  for (const e of events) {
    payload += `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  let done = false;
  return {
    ok: true,
    status: 200,
    headers: { get: (h) => (h.toLowerCase().includes("content-type") ? "text/event-stream" : null) },
    body: {
      getReader() {
        return {
          async read() {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: bytes };
          },
        };
      },
    },
  };
}

/* بديل Express: نستخرج المعالج ونشغله يدويًا */
class FakeRes {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.ended = false;
    this.jsonBody = null;
  }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  flushHeaders() {}
  write(s) { this.chunks.push(s); }
  end() { this.ended = true; }
  status(c) { this.statusCode = c; return this; }
  json(o) { this.jsonBody = o; this.ended = true; return this; }

  parseEvents() {
    const raw = this.chunks.join("");
    const out = [];
    for (const chunk of raw.split("\n\n")) {
      if (!chunk.trim()) continue;
      const em = chunk.match(/^event:\s*(.+)$/m);
      const dm = chunk.match(/^data:\s*(.+)$/m);
      if (!em || !dm) continue;
      try {
        out.push({ event: em[1].trim(), data: JSON.parse(dm[1]) });
      } catch (_) { /* تجاهل */ }
    }
    return out;
  }
}

/* نلتقط معالج /api/chat من راوتر Express وهمي */
function loadServer() {
  delete require.cache[require.resolve("../server/server.js")];
  const appMod = require("../server/server.js");
  return appMod;
}

/* نبني مسارًا: نستخدم express الحقيقي مع supertest-like يدويًا */
async function callChat(server, body) {
  const { app } = server;
  // نجد الطبقة التي مسارها /api/chat
  const stack = app._router.stack;
  const layer = stack.find((l) => l.route && l.route.path === "/api/chat");
  if (!layer) throw new Error("مسار /api/chat غير موجود");
  const handlers = layer.route.stack.map((s) => s.handle);
  const req = { body, headers: { host: "localhost:8080" } };
  const res = new FakeRes();
  for (const h of handlers) {
    await new Promise((resolve, reject) => {
      const next = (e) => (e ? reject(e) : resolve());
      try {
        const ret = h(req, res, next);
        if (ret && ret.then) ret.then(resolve).catch(reject);
        else if (res.ended) resolve();
        else setTimeout(resolve, 0);
      } catch (e) { reject(e); }
    });
    if (res.ended) break;
  }
  return res;
}

/* ──────── الإعداد ──────── */

module.exports = ({ test }) => {
  const ORIGINAL_ENV = Object.assign({}, process.env);

  function withEnv(env) {
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    process.env.MIRATH_WRITER_MODEL = "luna-gpt6";
    process.env.MIRATH_VERIFIER_MODEL = "luna-gpt6";
    Object.assign(process.env, env || {});
  }

  function resetEnv() {
    process.env = Object.assign({}, ORIGINAL_ENV);
  }

  /* ──────── تحديث الوحدات عند تغيير البيئة ──────── */
  function freshServer() {
    delete require.cache[require.resolve("../server/server.js")];
    delete require.cache[require.resolve("../prompt.js")];
    delete require.cache[require.resolve("../data/knowledge-base.js")];
    delete require.cache[require.resolve("../config/checklist.js")];
    return require("../server/server.js");
  }

  /* ──── ١. فرز الخطورة ──── */
  test("فرز: انفجار يُكتشف", () => {
    withEnv();
    const s = freshServer();
    const hits = s.triage("عندي إصابة انفجار في الساق");
    assert.ok(hits.length > 0, "لم يُكتشف الانفجار");
    assert.strictEqual(hits[0].id, "blast");
  });

  test("فرز: نزيف شديد يُكتشف", () => {
    withEnv();
    const s = freshServer();
    const hits = s.triage("نزيف شديد ولا يتوقف");
    assert.ok(hits.some((h) => h.id === "severe-bleeding"));
  });

  test("فرز: جرح بسيط لا إشارات", () => {
    withEnv();
    const s = freshServer();
    const hits = s.triage("جرح صغير في إصبعي");
    assert.strictEqual(hits.length, 0);
  });

  /* ──── ٢. البحث العلمي ──── */
  test("بحث: يعيد نتائج من Europe PMC", async () => {
    withEnv();
    stubFetch(async (u) => {
      if (u.includes("europepmc")) {
        return jsonResponse({
          resultList: {
            result: [
              { title: "Honey for wounds", pmid: "25204770", pubYear: "2020", journalTitle: "Cochrane" },
            ],
          },
        });
      }
    });
    const s = freshServer();
    const r = await s.webLookup("honey wound");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results.length, 1);
    assert.strictEqual(r.results[0].pmid, "25204770");
    global.fetch = realFetch;
  });

  test("بحث: فشل الشبكة لا يكسر الخط", async () => {
    withEnv();
    stubFetch(async () => { throw new Error("network down"); });
    const s = freshServer();
    const r = await s.webLookup("test");
    assert.strictEqual(r.ok, false);
    assert.ok(Array.isArray(r.results));
    global.fetch = realFetch;
  });

  /* ──── ٣. صور المواد ──── */
  test("صور: Wikimedia تُجلب مع الترخيص", async () => {
    withEnv();
    stubFetch(async (u) => {
      if (u.includes("commons.wikimedia.org")) {
        return jsonResponse({
          query: {
            pages: {
              "1": {
                title: "File:Honey.jpg",
                imageinfo: [{
                  thumburl: "https://upload.wikimedia.org/honey.jpg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Honey.jpg",
                  extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" } },
                }],
              },
            },
          },
        });
      }
    });
    const s = freshServer();
    const herb = { ar: "العسل", en: "Honey", imageQuery: "honey" };
    const r = await s.findHerbImage([herb]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].images.length, 1);
    assert.strictEqual(r[0].images[0].license, "CC BY-SA 4.0");
    global.fetch = realFetch;
  });

  test("صور: لا صورة = كائن فارغ لا خطأ", async () => {
    withEnv();
    stubFetch(async () => jsonResponse({ query: { pages: {} } }));
    const s = freshServer();
    const r = await s.findHerbImage([{ ar: "x", en: "x", imageQuery: "x" }]);
    assert.strictEqual(r[0].images.length, 0);
    global.fetch = realFetch;
  });

  /* ──── ٤. اختيار المواد للصورة ──── */
  test("صور: لا تُجلب صورة لمادة ممنوعة", () => {
    withEnv();
    const s = freshServer();
    const herbs = [
      { ar: "زيت الكافور", verdict: "not-recommended" },
      { ar: "العسل", verdict: "unverified" },
    ];
    const picked = s.pickHerbsForImage("لا تستخدم زيت الكافور. العسل للحرق.", herbs);
    assert.strictEqual(picked.length, 1);
    assert.strictEqual(picked[0].ar, "العسل");
  });

  /* ──── ٥. الرفض بلا مفتاح ──── */
  test("chat: بلا مفتاح = 503", async () => {
    process.env.OPENAI_API_KEY = "";
    const s = freshServer();
    const res = await callChat(s, { text: "جرح في إصبعي" });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.jsonBody.error, "NO_KEY");
    resetEnv();
  });

  test("chat: رسالة فارغة = 400", async () => {
    withEnv();
    const s = freshServer();
    const res = await callChat(s, { text: "   " });
    assert.strictEqual(res.statusCode, 400);
    resetEnv();
  });

  /* ──── ٦. خط الأنابيب الكامل ──── */
  test("chat: جولة كاملة — أدوات + مسودة + تدقيق + رد", async () => {
    withEnv();

    const goodDraft = [
      "اضغط بقماش نظيف ٥ دقائق حتى يتوقف النزيف.",
      "نظّف الجرح بلطف بماء نظيف.",
      "غطِّ الجرح بضمادة نظيفة.",
      "— هل النزيف يتشرّب القماش بسرعة؟",
      "— ما يقوله الطب القديم في جرح مثل هذا:",
      "تنظيف الماء — ✅ مثبتة — وفق إرشادات منظمة الصحة العالمية.",
    ].join("\n");

    let openaiCalls = 0;
    stubFetch(async (u, opts) => {
      if (u.includes("europepmc")) {
        return jsonResponse({ resultList: { result: [] } });
      }
      if (u.includes("commons.wikimedia.org")) {
        return jsonResponse({ query: { pages: {} } });
      }
      if (u.includes("/chat/completions")) {
        openaiCalls++;
        const body = JSON.parse(opts.body);
        const sys = body.messages[0].content;
        if (sys.includes("مدقّق مستقل")) {
          return jsonResponse({
            choices: [{ message: { content: JSON.stringify({ agrees: true, issues: [] }) } }],
          });
        }
        return jsonResponse({ choices: [{ message: { content: goodDraft } }] });
      }
    });

    const s = freshServer();
    const res = await callChat(s, { text: "جرح في إصبعي ينزف قليلًا" });

    const events = res.parseEvents();
    const names = events.map((e) => e.event);

    // أدوات مُعلنة
    assert.ok(names.filter((n) => n === "tool").length >= 4, "الأدوات لم تُعلن");
    const toolIds = events.filter((e) => e.event === "tool" && e.data.phase === "start").map((e) => e.data.id);
    for (const need of ["triage", "lookup", "websearch", "compose", "verify"]) {
      assert.ok(toolIds.includes(need), `أداة ${need} لم تظهر`);
    }

    // رد نهائي
    const ans = events.find((e) => e.event === "answer");
    assert.ok(ans, "لا يوجد حدث answer");
    assert.ok(ans.data.text.includes("اضغط بقماش نظيف"));
    assert.ok(ans.data.checklist, "لا يوجد تقرير checklist");

    // مسار Done
    assert.ok(names.includes("done"));

    // النموذج استُدعي مرتين على الأقل (كاتب + مدقق)
    assert.ok(openaiCalls >= 2, `استُدعي ${openaiCalls} مرة فقط`);

    // لا تسريب للمفتاح في الرد
    const all = res.chunks.join("");
    assert.ok(!all.includes("sk-test-not-real"), "المفتاح تسرّب!");

    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ٧. الطوارئ تمر بلا أعشاب ونموذج ──── */
  test("chat: الطوارئ — التوجيه الطبي يصعد، ولا بحث عشبي", async () => {
    withEnv();

    const dangerDraft = [
      "اطلب إسعافًا الآن أو اذهب للطبيب.",
      "اضغط بقماش نظيف بثبات، ولا تُزل الطبقة الأولى.",
      "ارفع الجزء المصاب فوق مستوى القلب.",
    ].join("\n");

    stubFetch(async (u, opts) => {
      if (u.includes("/chat/completions")) {
        const body = JSON.parse(opts.body);
        if (body.messages[0].content.includes("مدقّق مستقل")) {
          return jsonResponse({ choices: [{ message: { content: '{"agrees":true,"issues":[]}' } }] });
        }
        return jsonResponse({ choices: [{ message: { content: dangerDraft } }] });
      }
      if (u.includes("europepmc")) throw new Error("ما كان يجب البحث");
      if (u.includes("commons")) throw new Error("ما كان يجب جلب صورة");
    });

    const s = freshServer();
    const res = await callChat(s, { text: "إصابة انفجار ونزيف شديد" });
    const events = res.parseEvents();
    const ans = events.find((e) => e.event === "answer");
    assert.ok(ans);
    assert.ok(ans.data.danger.length > 0, "الخطر لم يُسجّل");
    // صور المواد لا تُجلب في الطوارئ
    assert.strictEqual(ans.data.images.length, 0, "صور مواد في الطوارئ!");

    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ٨. البوابة تعيد التصحيح ──── */
  test("chat: إذا رسبت البوابة، يُطلب تصحيح مرة واحدة", async () => {
    withEnv();

    const badDraft = "هل المصاب طفل أم بالغ؟ هل يوجد نزيف؟ هل هو مصاب بالسكري؟";
    const fixedDraft = [
      "نظّف الجرح بماء نظيف بلطف.",
      "غطِّ بضمادة نظيفة.",
      "— هل المصاب طفل أم بالغ؟",
      "— ما يقوله الطب القديم:",
      "تنظيف الماء — ✅ مثبتة — WHO.",
    ].join("\n");

    let writerCalls = 0;
    stubFetch(async (u, opts) => {
      if (u.includes("europepmc")) return jsonResponse({ resultList: { result: [] } });
      if (u.includes("commons")) return jsonResponse({ query: { pages: {} } });
      if (u.includes("/chat/completions")) {
        const body = JSON.parse(opts.body);
        const sys = body.messages[0].content;
        if (sys.includes("مدقّق مستقل")) {
          return jsonResponse({
            choices: [{ message: { content: '{"agrees":false,"issues":["سؤالان في الرد"]}' } }],
          });
        }
        // المسودة الأولى سيئة، والتصحيح جيد
        writerCalls++;
        return jsonResponse({
          choices: [{ message: { content: writerCalls === 1 ? badDraft : fixedDraft } }],
        });
      }
    });

    const s = freshServer();
    const res = await callChat(s, { text: "جرح في يدي" });
    const events = res.parseEvents();
    const ans = events.find((e) => e.event === "answer");
    assert.ok(ans);
    assert.ok(writerCalls >= 3, `كاتب استُدعي ${writerCalls} مرة (جب 3)`);

    const verifyTool = events.filter((e) => e.event === "tool" && e.data.id === "verify" && e.data.phase === "end");
    assert.ok(verifyTool.length, "لا حدث تدقيق");
    assert.ok(/اعتراض/.test(verifyTool[0].data.note), "الاعتراض لم يُسجّل");

    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ٩. ★ المنع الصلب: رد طارئ غير آمن لا يُسلَّم ──── */
  test("chat: ★ رد طارئ بلا توجيه طبي يُستبدل بردّ آمن", async () => {
    withEnv();

    // كاتب يكتب ردًا بلا «طبيب» ولا «إسعاف» — وهذا غير آمن في الطوارئ،
    // وهو نفس الفشل الذي وقع فعليًا في تجربة حيّة.
    const unsafeDraft = [
      "اضغط بقماش نظيف على الجرح.",
      "نظّف الجرح بماء نظيف.",
      "غطِّ الجرح بضمادة نظيفة.",
    ].join("\n");

    stubFetch(async (u, opts) => {
      if (u.includes("/chat/completions")) {
        const body = JSON.parse(opts.body);
        const sys = body.messages[0].content;
        if (sys.includes("وظيفتك: أن تجد الخطأ") || sys.includes("مدقّق مستقل")) {
          return jsonResponse({ choices: [{ message: { content: '{"agrees":true,"issues":[]}' } }] });
        }
        // الكاتب (والتصحيح) يعيدان الرد غير الآمن دائمًا
        return jsonResponse({ choices: [{ message: { content: unsafeDraft } }] });
      }
      if (u.includes("europepmc")) throw new Error("لا بحث في الطوارئ");
      if (u.includes("commons")) throw new Error("لا صور في الطوارئ");
    });

    const s = freshServer();
    const res = await callChat(s, { text: "عندي إصابة انفجار ونزيف شديد" });
    const ans = res.parseEvents().find((e) => e.event === "answer");

    assert.ok(ans, "لا يوجد رد");
    assert.strictEqual(ans.data.safetySubstituted, true, "لم يُستبدل الرد غير الآمن!");
    assert.ok(/إسعاف|طبيب/.test(ans.data.text), "الرد النهائي بلا توجيه طبي!");
    assert.ok(!/عشب|عسل|كركم|مرّة/.test(ans.data.text), "الرد الآمن يحمل عشبًا!");
    assert.strictEqual(ans.data.checklist.safeToDeliver, true, "الرد النهائي غير آمن");
    assert.ok(ans.data.danger.length > 0, "الخطر لم يُسجّل");

    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ١٠. لا يُقبل تصحيح غير آمن حتى لو نجح في بوابات أكثر ──── */
  test("chat: ★ التصحيح يُرفض إن بقي غير آمن", async () => {
    withEnv();

    const unsafe = "اضغط بقماش نظيف.\nنظّف بماء نظيف.\nغطِّ بضمادة.";
    stubFetch(async (u, opts) => {
      if (u.includes("/chat/completions")) {
        const body = JSON.parse(opts.body);
        const sys = body.messages[0].content;
        if (sys.includes("وظيفتك: أن تجد الخطأ") || sys.includes("مدقّق مستقل")) {
          return jsonResponse({ choices: [{ message: { content: '{"agrees":false,"issues":["بلا توجيه طبي"]}' } }] });
        }
        return jsonResponse({ choices: [{ message: { content: unsafe } }] });
      }
      if (u.includes("europepmc")) return jsonResponse({ resultList: { result: [] } });
      if (u.includes("commons")) return jsonResponse({ query: { pages: {} } });
    });

    const s = freshServer();
    const res = await callChat(s, { text: "نزيف شديد جدًا" });
    const ans = res.parseEvents().find((e) => e.event === "answer");
    assert.ok(ans.data.safetySubstituted, "قُبل تصحيح غير آمن");
    assert.strictEqual(ans.data.checklist.safeToDeliver, true);

    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ١١. فشل OpenAI يعود برسالة SSE ──── */
  test("chat: خطأ 500 من OpenAI يعود كحدث error", async () => {
    withEnv();
    stubFetch(async (u) => {
      if (u.includes("europepmc")) return jsonResponse({ resultList: { result: [] } });
      if (u.includes("/chat/completions")) {
        return jsonResponse({ error: { message: "internal server error" } }, false, 500);
      }
    });
    const s = freshServer();
    const res = await callChat(s, { text: "جرح بسيط" });
    const events = res.parseEvents();
    const err = events.find((e) => e.event === "error");
    assert.ok(err, "لا يوجد event: error");
    global.fetch = realFetch;
    resetEnv();
  });

  /* ──── ١٠. /api/health ──── */
  test("health: يعلن حالة المفتاح بلا كشفه", () => {
    withEnv();
    const s = freshServer();
    const res = new FakeRes();
    // نبحث عن معالج المسار
    const stack = s.app._router.stack;
    const layer = stack.find((l) => l.route && l.route.path === "/api/health");
    layer.route.stack[0].handle({}, res);
    assert.strictEqual(res.jsonBody.keyConfigured, true);
    assert.strictEqual(res.jsonBody.writerModel, "luna-gpt6");
    assert.ok(!JSON.stringify(res.jsonBody).includes("sk-"));
    resetEnv();
  });

  test("health: بلا مفتاح = false", () => {
    process.env.OPENAI_API_KEY = "";
    const s = freshServer();
    const res = new FakeRes();
    const layer = s.app._router.stack.find((l) => l.route && l.route.path === "/api/health");
    layer.route.stack[0].handle({}, res);
    assert.strictEqual(res.jsonBody.keyConfigured, false);
    resetEnv();
  });
};
