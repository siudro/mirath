/* tests/ui.test.js — تحقق من ملفات الواجهة والوظائف غير المتصلة بالشبكة.
   لا يمكن تشغيل متصفح هنا؛ نتحقق مما يمكن التحقق منه نصيًا وبنائيًا. */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

module.exports = ({ test }) => {
  /* ───── الملفات موجودة ───── */
  const REQUIRED = [
    "public/index.html",
    "public/style.css",
    "public/ui.js",
    "data/knowledge-base.js",
    "config/checklist.js",
    "prompt.js",
    "server/server.js",
    "Dockerfile",
    "package.json",
    ".env.example",
    ".gitignore",
    "README.md",
  ];

  for (const f of REQUIRED) {
    test(`ملف موجود: ${f}`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, f)), "مفقود");
    });
  }

  /* ───── الالتقاط بالكاميرا والمرفق ───── */
  test("HTML فيه إرفاق صورة", () => {
    const html = read("public/index.html");
    assert.ok(/id="fileInput"[^>]*accept="image\/\*"/.test(html), "مرفق الصور مفقود");
  });

  test("HTML فيه التقاط بالكاميرا", () => {
    const html = read("public/index.html");
    assert.ok(/id="cameraInput"[^>]*capture="environment"/.test(html), "الكاميرا مفقودة");
  });

  test("HTML فيه معاينة الصورة وزر إزالة", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="previewImg"'));
    assert.ok(html.includes('id="removeImg"'));
  });

  /* ───── انتباه المستخدم للأدوات ───── */
  test("HTML فيه لوحة أثر حيّة", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="trace"'), "لوحة الأثر مفقودة");
    assert.ok(html.includes('id="traceList"'));
  });

  test("كل أداة في الخادم لها أيقونة في الواجهة", () => {
    const ui = read("public/ui.js");
    const { TOOL_CATALOG } = require("../data/knowledge-base.js");
    for (const t of TOOL_CATALOG) {
      assert.ok(ui.includes(`"${t.id}"`) || ui.includes(`${t.id}:`), `أيقونة ${t.id} مفقودة`);
    }
  });

  /* ───── سجل المحادثات ───── */
  test("HTML فيه نافذة السجل", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="historyModal"'));
    assert.ok(html.includes('id="historyList"'));
  });

  test("زر الحفظ وزر الحذف موجودان", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="saveChatBtn"'), "زر الحفظ مفقود");
    const ui = read("public/ui.js");
    assert.ok(ui.includes("history-del"), "زر الحذف مفقود");
  });

  test("الحذف يتطلب تأكيدًا صريحًا", () => {
    const ui = read("public/ui.js");
    assert.ok(ui.includes("confirmDelete"), "لا يوجد تأكيد حذف");
    assert.ok(ui.includes("حذف نهائي"));
  });

  test("السجل يُخزّن في localStorage بمفتاح مُصدّر", () => {
    const ui = read("public/ui.js");
    assert.ok(ui.includes("mirath.history.v2"));
  });

  test("السجل محدود بـ ٥٠ محادثة", () => {
    const ui = read("public/ui.js");
    assert.ok(/slice\(0,\s*50\)/.test(ui));
  });

  /* ───── لا أسرار في الواجهة ───── */
  test("الواجهة لا تحتوي على مفتاح", () => {
    const files = [
      "public/ui.js",
      "public/index.html",
      "data/knowledge-base.js",
      "config/checklist.js",
      "prompt.js",
      "server/server.js",
    ];
    for (const f of files) {
      const src = read(f);
      assert.ok(!/sk-[a-zA-Z0-9]{20,}/.test(src), `${f}: مفتاح OpenAI محتمل!`);
      assert.ok(!/OPENAI_API_KEY\s*=\s*["'][^"']+["']/.test(src), `${f}: مفتاح مضمّن!`);
    }
  });

  test("الواجهة لا تستدعي OpenAI مباشرة", () => {
    const ui = read("public/ui.js");
    assert.ok(!ui.includes("api.openai.com"), "الواجهة تكلّم OpenAI مباشرة!");
  });

  test("الواجهة تكلّم /api/chat فقط", () => {
    const ui = read("public/ui.js");
    assert.ok(ui.includes('fetch("/api/chat"'));
  });

  /* ───── Dockerfile سليم ───── */
  test("Dockerfile يستخدم مستخدم غير جذري", () => {
    const df = read("Dockerfile");
    assert.ok(/USER\s+mirath/i.test(df), "يعمل كـ root!");
  });

  test("Dockerfile يعلن المنفذ", () => {
    const df = read("Dockerfile");
    assert.ok(/EXPOSE\s+\d+/.test(df));
  });

  test("Dockerfile لا يحتوي على سر", () => {
    const df = read("Dockerfile");
    assert.ok(!/sk-[a-zA-Z0-9]{20,}/.test(df));
    assert.ok(!/ENV\s+OPENAI_API_KEY=/.test(df), "المفتاح في Dockerfile!");
  });

  test("Dockerfile له healthcheck", () => {
    const df = read("Dockerfile");
    assert.ok(/HEALTHCHECK/.test(df));
  });

  /* ───── .gitignore يحمي الأسرار ───── */
  test(".gitignore يستثني .env", () => {
    const gi = read(".gitignore").split("\n").map((s) => s.trim());
    assert.ok(gi.includes(".env"));
    assert.ok(gi.some((l) => l === ".env.local" || l === ".env.*.local"));
    assert.ok(gi.includes("node_modules/"));
  });

  test(".env.example لا يحتوي على قيمة مفتاح", () => {
    const ex = read(".env.example");
    const m = ex.match(/^OPENAI_API_KEY=(.*)$/m);
    assert.ok(m, "لا يوجد سطر مفتاح");
    assert.strictEqual(m[1].trim(), "", "`.env.example` يحمل مفتاحًا!");
  });

  /* ───── CSS: حركة واحترام prefers-reduced-motion ───── */
  test("CSS يحترم تقليل الحركة", () => {
    const css = read("public/style.css");
    assert.ok(css.includes("prefers-reduced-motion"));
  });

  /* ═══ إصلاحات تخطيط وُجدت بلقطة شاشة حقيقية ═══ */
  test("★ [hidden] لا يُغلب بـ display من قاعدة أخرى", () => {
    const css = read("public/style.css");
    assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
      "[hidden] بلا !important — معاينة الصورة ستظهر فارغة");
  });

  test("★ body ليس grid (النوافذ والـ script كانت تُحسب كصفوف)", () => {
    const css = read("public/style.css");
    // نلتقط كتلة "body {" الكاملة على أنها المشتركة ("html, body {") ليست المقصودة.
    const m = css.match(/\nbody\s*\{([^}]*)\}/);
    assert.ok(m, "لا توجد قاعدة body مستقلة");
    const first = m[1];
    assert.ok(!/grid-template-rows/.test(first), "body ما زال grid — التخطيط سينهار");
    assert.ok(/display:\s*flex/.test(first), "body يجب أن يكون flex");
  });

  test("★ الساحة تنمو والرأس والشريط ثابتان", () => {
    const css = read("public/style.css");
    assert.ok(/\.stage\s*\{[^}]*flex:\s*1 1 auto/.test(css), "الساحة بلا flex-grow");
    assert.ok(/\.composer\s*\{[^}]*flex:\s*none/.test(css), "الشريط بلا flex:none");
  });

  test("★ علامات الحكم لا تعتمد على خط الإيموجي", () => {
    const ui = read("public/ui.js");
    // الشيفرة يجب أن تستبدل الإيموجي برموز نصية
    assert.ok(ui.includes('"✔"'), "✔ غير مستخدم — سيرسم مربعًا فارغًا");
    assert.ok(ui.includes('"✘"'), "✘ غير مستخدم");
    assert.ok(!/parent\.appendChild\(mark\("✅"/.test(ui), "ما زال يكتب الإيموجي مباشرة");
  });

  test("★ شارة الحكم لها شكل دائري في CSS", () => {
    const css = read("public/style.css");
    assert.ok(/\.emoji-mark\s*\{[^}]*border-radius:\s*50%/.test(css));
    assert.ok(/\.emoji-mark\s*\{[^}]*border:\s*1.2px solid currentColor/.test(css));
  });

  test("★ قائمة التحقق تستخدم padding-inline لـ RTL", () => {
    const css = read("public/style.css");
    assert.ok(/\.checklist-list li\s*\{[^}]*padding-inline/.test(css),
      "padding مادي يكسر RTL");
  });

  test("CSS فيه حركة نباتية (تنفّس)", () => {
    const css = read("public/style.css");
    assert.ok(css.includes("@keyframes leaf-breathe"));
    assert.ok(css.includes("@keyframes drift-"));
  });

  test("CSS يدعم RTL", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('dir="rtl"'));
  });

  /* ───── مخطط سير العمل ───── */
  test("HTML فيه نافذة سير العمل", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="workflowModal"'));
    assert.ok(html.includes('id="workflowCanvas"'));
  });

  test("سير العمل يُرسم SVG متحركًا", () => {
    const ui = read("public/ui.js");
    assert.ok(ui.includes("animateMotion"), "لا حركة في SVG");
    assert.ok(ui.includes("workflow-svg"));
  });

  test("سير العمل يعرض كل العقد الأساسية", () => {
    const ui = read("public/ui.js");
    for (const label of ["فرز الخطورة", "قاعدة الأدلة", "بحث علمي", "كاتب", "مدقق", "قائمة التحقق"]) {
      assert.ok(ui.includes(label), `عقدة ${label} مفقودة`);
    }
  });

  /* ───── قائمة التحقق معروضة ───── */
  test("HTML فيه نافذة قائمة التحقق", () => {
    const html = read("public/index.html");
    assert.ok(html.includes('id="checklistModal"'));
    assert.ok(html.includes('id="checklistList"'));
  });

  /* ───── تشغيل ملفات المتصفح في بيئة وهمية للتأكد من عدم خطأ نحوي ───── */
  test("ملفات الواجهة تُحمّل بلا خطأ نحوي", () => {
    for (const f of ["public/ui.js", "data/knowledge-base.js", "config/checklist.js"]) {
      const src = read(f);
      assert.doesNotThrow(() => new vm.Script(src, { filename: f }), `${f}: خطأ نحوي`);
    }
  });

  test("ui.js لا يعتمد على متغيرات غير معرّفة عند التحميل", () => {
    const ctx = {
      console,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      document: {
        getElementById: () => ({
          style: {}, classList: { add() {}, remove() {}, toggle() {} },
          appendChild() {}, removeChild() {}, setAttribute() {},
          addEventListener() {}, querySelector: () => null,
          querySelectorAll: () => [], remove() {}, hidden: true,
          dataset: {}, children: [], textContent: "", innerHTML: "",
        }),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => ({
          style: {}, classList: { add() {}, remove() {}, toggle() {} },
          appendChild() {}, setAttribute() {}, addEventListener() {},
          remove() {}, querySelector: () => null,
        }),
        createDocumentFragment: () => ({
          appendChild() {}, childNodes: [],
        }),
        body: { appendChild() {} },
      },
      window: { innerWidth: 1200, addEventListener: () => {} },
      fetch: async () => ({ ok: false, json: async () => ({}) }),
      requestAnimationFrame: (f) => f(),
      setTimeout,
      clearTimeout,
      setInterval: () => 0,
      clearInterval: () => {},
      TextDecoder: global.TextDecoder,
      GATES: [],
    };
    ctx.window = ctx;
    const sandbox = vm.createContext(ctx);
    assert.doesNotThrow(() => {
      vm.runInContext(read("public/ui.js"), sandbox);
    }, "ui.js يرمي خطأ عند التحميل");

    // بعد التحميل يجب أن يكون __mirath موجودًا
    assert.ok(typeof sandbox.__mirath === "object", "__mirath غير معرّف");
  });

  /* ───── health endpoint معرّف ───── */
  /* ═══ حماية من نشر نسخة قديمة ═══
     Railway نشر نسخة ثابتة من ١٩ تشرين الثاني فيها واجهة DeepSeek،
     بينما المستودع صحيح. هذه الاختبارات تمنع أن يُرفع المستودع نفسه
     في صورة لا تعمل — الاختبار على الملفات، لا على المنصة. */

  test("★ package.json يشغّل الخادم لا ملفًا ثابتًا", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.scripts && pkg.scripts.start, "لا يوجد start");
    assert.ok(/server\/server\.js/.test(pkg.scripts.start), "start لا يشغّل الخادم");
    assert.strictEqual(pkg.main, "server/server.js");
  });

  test("★ لا توجد واجهة DeepSeek/Gemini القديمة في المستودع", () => {
    const html = read("public/index.html");
    assert.ok(!/providerTabs/.test(html), "واجهة اختيار المزوّد القديمة ما زالت موجودة");
    assert.ok(!/platform\.deepseek\.com/.test(html), "رابط DeepSeek ما زال في الواجهة");
    assert.ok(html.includes("gpt-6-luna"), "الموديل الصحيح غير معلن في الواجهة");
  });

  test("★ لا ملف index.html قديم في جذر المستودع", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "index.html")),
      "index.html قديم في الجذر — خادم ثابت سيعرضه بدل التطبيق");
    assert.ok(!fs.existsSync(path.join(ROOT, "app.js")),
      "app.js القديم ما زال موجودًا");
  });

  test("★ Dockerfile لا يفرض PORT (Railway يضبطه)", () => {
    const df = read("Dockerfile");
    assert.ok(!/^ENV PORT=/m.test(df), "ENV PORT يعارض قيمة Railway");
  });

  test("★ الخادم يربط 0.0.0.0 ليصل إليه وكيل المنصة", () => {
    const srv = read("server/server.js");
    assert.ok(/app\.listen\(PORT,\s*["']0\.0\.0\.0["']/.test(srv),
      "الربط غير صريح على 0.0.0.0");
  });

  /* ═══ ملف الأدلة PDF ═══ */

  test("★ سجل الأدلة PDF موجود وغير فارغ", () => {
    const pdf = path.join(ROOT, "docs", "Mirath-Evidence-Audit.pdf");
    assert.ok(fs.existsSync(pdf), "PDF مفقود");
    const buf = fs.readFileSync(pdf);
    assert.ok(buf.length > 10000, `PDF صغير جدًا: ${buf.length}`);
    assert.strictEqual(buf.subarray(0, 4).toString(), "%PDF", "ليس ملف PDF صالحًا");
  });

  test("★ مولّد الـ PDF موجود ويمكن إعادة البناء", () => {
    const gen = path.join(ROOT, "tools", "build_pdf.py");
    assert.ok(fs.existsSync(gen), "مولّد PDF مفقود");
    const src = fs.readFileSync(gen, "utf8");
    assert.ok(src.includes("arabic_reshaper"), "لا يعالج تشكيل العربية");
    assert.ok(src.includes("get_display"), "لا يعالج اتجاه RTL");
  });

  test("README يشرح التشغيل والنشر", () => {
    const r = read("README.md");
    assert.ok(/npm start|node server\/server\.js/.test(r));
    assert.ok(/OPENAI_API_KEY/.test(r));
    assert.ok(/Railway|Railway/i.test(r));
  });

  test("README يحمل اسم الطالبة", () => {
    const r = read("README.md");
    assert.ok(r.includes("حنين"));
  });
};
