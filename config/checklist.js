/* config/checklist.js — قائمة تحقق ميراث (checklist).
   هذه ليست نصًا يُرسل للنموذج فقط، بل **حاجز تنفيذي**:
   كل بوابة لها دالة تُرجع { pass, reason }. إن فشلت بوابة، يُعاد للنموذج
   بسبب الفشل، إن أمكن، أو يُصحَّح الرد آليًا.
   ملف مستقل قابل للفحص. لا أراء — كل قاعدة مشتقة من الدليل أو القرار الموثق. */

const CHECKLIST_VERSION = "2026-11-23";

/* حراسة الطوارئ — لا تُتجاوَز أبدًا */
const DANGER_SAFE_WORDS = [
  "إسعاف", "إسعافًا", "الطبيب", "طبيب", "جهة طبية", "غادر", "اذهب",
  "emergency", "ambulance", "doctor",
];

const DANGER_HERB_BLACKLIST = [
  "عسل", "كركم", "المرّة", "مرة", "قشر الرمان", "رمان", "الصبر", "ألوة", "ألوة فيرا",
  "عشب", "أعشاب", "كمادات دافئة", "زيت", "خلطة", "خلطات",
  "honey", "turmeric", "myrrh", "aloe", "herb", "herbs", "warm compress",
];

const HERB_VERDICT_MARKERS = ["مثبتة", "غير مثبتة", "غير موصى بها", "✅", "⚠️", "❌",
  "verified", "unverified", "not recommended"];

/* أسماء بديلة: القاعدة تسمّي بعض المواد باسم وصفي («العسل الطبي»)،
   لكن المستخدم والنموذج يكتبان الجذر («العسل»). بدون هذه القائمة تمرّ
   الصيغة المختصرة من البوابة. العسل مضبوط أولًا ليتحقق من اللاحقة أولًا. */
const ALIASES = {
  honey: ["العسل الطبي", "العسل"],
  aloe: ["الصبر", "الألوة", "ألوة فيرا"],
  "pomegranate-peel": ["قشر الرمان", "الرمان"],
  "eucalyptus-oil": ["الكافور", "كافور"],
  "olive-wax": ["زيت الزيتون", "الزيتون"],
  myrrh: ["المرة", "مرة"],
  "oak-gall": ["العفص", "عفص"],
  "clean-water": ["الماء النظيف", "تنظيف الماء"],
  "warm-compress": ["الكمادات", "كمادات"],
};

/* بوابات التحقق بترتيبها. لكل بوابة: id، اسم، دالة. */
const GATES = [
  {
    id: "danger-first",
    label: "الخطورة أولًا",
    detail: "أي إشارة خطر ⇒ طلب مساعدة طبية في أول ٢٠٠ حرف + لا أعشاب.",
    /* ★ بوابة حرجة: فشلها يعني أن الرد غير آمن — لا يُسمح بتسليمه أبدًا،
       لا بالمحاولة الأولى ولا بعد تصحيح. انظر CRITICAL في runChecklist. */
    critical: true,
    test(ctx) {
      const isDanger = Boolean(ctx.danger && ctx.danger.length);
      if (!isDanger) return { pass: true };

      const t = (ctx.text || "").trim();
      if (!t) return { pass: false, reason: "الرد فارغ." };

      // التوجيه الطبي قد يكون في أي من أول ٢٠٠ حرف — الناسخ قد يبدأ بفعل
      // إسعافي ثم يطلب الطبيب في السطر التالي.
      const head = t.slice(0, 200).toLowerCase();
      const hasSafe = DANGER_SAFE_WORDS.some((w) => head.includes(w.toLowerCase()));
      if (!hasSafe) {
        return {
          pass: false,
          reason: `حالة خطورة (${ctx.danger.map((d) => d.ar).join("، ")}) بلا توجيه طبي في أول ٢٠٠ حرف.`,
        };
      }

      const lower = t.toLowerCase();
      const offender = DANGER_HERB_BLACKLIST.find((h) => {
        let from = 0;
        const needle = h.toLowerCase();
        while (true) {
          const at = lower.indexOf(needle, from);
          if (at === -1) return false;
          // ★ لا تُحسب المادة إن كان السياق نهيًا عنها.
          // «لا تضع أي مادة أو عشب» إرشاد سليم، وليس اقتراح عشبة.
          const windowStart = Math.max(0, at - 40);
          const window = lower.slice(windowStart, at);
          const negated = /(لا|لا\s+ت|دون|تجنّب|تجنب|ممنوع|إياك|not|do not|don't|avoid|never)\s*[^.]{0,30}$/.test(window);
          if (!negated) return true;
          from = at + needle.length;
        }
      });
      if (offender) {
        return { pass: false, reason: `حالة خطورة — ذُكر "${offender}" وهذا ممنوع في الطوارئ.` };
      }
      return { pass: true };
    },
  },

  {
    id: "one-question",
    label: "سؤال واحد فقط",
    detail: "عدد علامات الاستفهام ≤ ١. الاستثناء: صفر سؤال في الطوارئ.",
    test(ctx) {
      const text = ctx.text || "";
      const questionMarks = (text.match(/[؟?]/g) || []).length;
      if (questionMarks > 1) {
        return { pass: false, reason: `عدد الأسئلة ${questionMarks} — المسموح ١ في كل رد.` };
      }
      return { pass: true };
    },
  },

  {
    id: "no-question-first",
    label: "لا يبدأ بسؤال",
    detail: "أول سطر يجب أن يكون فعلًا، لا استفسارًا.",
    test(ctx) {
      const text = (ctx.text || "").trim();
      if (!text) return { pass: false, reason: "الرد فارغ." };
      const firstSentence = text.split(/[.!؟?\n]/)[0].trim();
      if (firstSentence.endsWith("؟") || firstSentence.endsWith("?")) {
        return { pass: false, reason: "الرد يبدأ بسؤال — ابدأ بفعل مباشر." };
      }
      const firstLower = firstSentence.toLowerCase();
      const questionWords = ["هل ", "ماذا", "ما هو", "كم عمر", "هل يوجد", "what ", "how old", "do you"];
      if (questionWords.some((w) => firstLower.startsWith(w))) {
        return { pass: false, reason: `الرد يبدأ بسؤال ("${firstSentence.slice(0, 30)}").` };
      }
      return { pass: true };
    },
  },

  {
    id: "herb-needs-verdict",
    label: "كل مادة تراثية بحكمها",
    detail: "أي ذكر لاسم مادة من قاعدة المعرفة ⇒ يجب أن يظهر حكمها في نفس الفقرة أو قريبًا.",
    test(ctx) {
      const text = ctx.text || "";
      const herbs = (ctx.kb && ctx.kb.herbs) || [];
      const lines = String(text || "").split("\n");
      const offenders = [];
      for (const h of herbs) {
        if (!h.ar) continue;
        // أسماء بديلة مقبولة: الاسم الكامل من القاعدة + الجذر المختصر المعروف.
        // بدون هذا «العسل» يمرّ لأن القاعدة تسمّيها «العسل الطبي».
        const aliases = [h.ar].concat(ALIASES[h.id] || []);
        const matches = lines
          .map((l, i) => (aliases.some((a) => l.includes(a)) ? i : -1))
          .filter((i) => i !== -1);
        for (const i of matches) {
          const slice = lines.slice(Math.max(0, i - 1), i + 2).join(" ");
          const has = HERB_VERDICT_MARKERS.some((m) => slice.includes(m));
          if (!has) { offenders.push(h.ar); break; }
        }
      }
      if (offenders.length) {
        return {
          pass: false,
          reason: `مواد ذُكرت بلا حكم: ${offenders.join("، ")}.`,
        };
      }
      return { pass: true };
    },
  },

  {
    id: "image-caveat",
    label: "الصورة لا تكفي",
    detail: "إن وُجدت صورة، يجب أن يُقال صراحةً إنها لا تكفي لتحديد العمق أو الخطورة.",
    test(ctx) {
      if (!ctx.hasImage) return { pass: true };
      const t = (ctx.text || "").toLowerCase();
      const needed = ["لا تكفي", "لا يظهر", "العمق", "الصورة", "not enough", "depth", "photo"];
      const wordsInText = needed.filter((w) => t.includes(w.toLowerCase())).length;
      if (wordsInText < 2) {
        return {
          pass: false,
          reason: "صورة مستلمة بلا تنبيه صريح أن الصورة لا تحدد العمق ولا الخطورة.",
        };
      }
      return { pass: true };
    },
  },

  {
    id: "scope-only-wounds",
    label: "النطاق — الجروح فقط",
    detail: "إن خرج السؤال عن الجروح، يجب توجيه المستخدم لجهة مناسبة.",
    test(ctx) {
      if (!ctx.outOfScope) return { pass: true };
      const t = ctx.text || "";
      const hasRedirect = ["طبيب", "جهة", "طوارئ", "خارج نطاقي", "specialist", "doctor", "emergency"]
        .some((w) => t.includes(w));
      if (!hasRedirect) {
        return { pass: false, reason: "سؤال خارج النطاق بلا توجيه للطبيب أو التوضيح." };
      }
      return { pass: true };
    },
  },

  {
    id: "no-dosage",
    label: "لا دواء ولا جرعة",
    detail: "لا توصيات بأدوية، ولا أرقام جرعات.",
    test(ctx) {
      const t = (ctx.text || "").toLowerCase();
      const drugs = ["باراسيتامول", "إيبوبروفين", "أسبرين", "باراسيتامول", "مضاد حيوي",
        "أموكسيسيلين", "paracetamol", "ibuprofen", "aspirin", "antibiotic"];
      const found = drugs.filter((d) => t.includes(d.toLowerCase()));
      if (found.length) return { pass: false, reason: `ذكر دواء: ${found.join("، ")}.` };
      // رقم جرعة: "500 ملغ" مثلاً
      if (/\d+\s*(ملغ|مغ|mg|مل\b)/i.test(t)) {
        return { pass: false, reason: "ظهر رقم جرعة — لا جرعات إطلاقًا." };
      }
      return { pass: true };
    },
  },

  {
    id: "no-invented-citation",
    label: "لا مرجع مُختلق",
    detail: "كل استشهاد يجب أن يكون له أصل في قاعدة المعرفة.",
    test(ctx) {
      const t = ctx.text || "";
      const sources = (ctx.kb && ctx.kb.sources) || [];
      // ابحث عن PMID
      const pmids = t.match(/PMID\s*(\d{6,})/gi) || [];
      const allowed = new Set();
      for (const s of sources) {
        const m = (s.en + " " + s.ar).match(/PMID\s*(\d{6,})/gi) || [];
        m.forEach((x) => allowed.add(x.replace(/\s+/g, " ").toLowerCase()));
      }
      for (const p of pmids) {
        const normalized = p.replace(/\s+/g, " ").toLowerCase();
        if (!allowed.has(normalized)) {
          return { pass: false, reason: `PMID غير معروف في القاعدة: ${p}.` };
        }
      }
      // لا رقم صفحة على ابن سينا/الرازي
      if (/(ص\s?\d{2,}|page\s?\d{2,})/i.test(t) && t.includes("ابن سينا")) {
        return { pass: false, reason: "رقم صفحة على ابن سينا — ممنوع بلا طبعة صريحة." };
      }
      // لا موقع نسخ رقمي كمرجع
      if (/shamela|waqfeya\.net|islamweb|null\.wv/i.test(t)) {
        return { pass: false, reason: "موقع نسخ رقمي مستخدم كمرجع — ممنوع." };
      }
      return { pass: true };
    },
  },

  {
    id: "length",
    label: "الطول في الحد",
    detail: "لا يتجاوز الرد ١٢ سطرًا غير فارغة.",
    test(ctx) {
      const lines = (ctx.text || "").split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 12) {
        return { pass: false, reason: `الرد ${lines.length} سطرًا — الحد ١٢.` };
      }
      return { pass: true };
    },
  },
];

/* تشغيل البوابات. */
function runChecklist(ctx) {
  const results = [];
  for (const gate of GATES) {
    let r;
    try {
      r = gate.test(ctx);
    } catch (e) {
      r = { pass: false, reason: `خطأ داخلي في البوابة: ${e.message}` };
    }
    results.push({
      id: gate.id,
      label: gate.label,
      pass: r.pass,
      critical: Boolean(gate.critical),
      reason: r.reason || "",
    });
  }

  const failed = results.filter((r) => !r.pass);
  /* ★ حاجز أمان صلب: إن رسبت بوابة حرجة (الخطورة)، فالرد غير آمن للتسليم
     مهما فعل التصحيح. الخادم يجب أن يتصرف على هذا الأساس — لا أن يعرض نصًا
     قد يضر إنسانًا. هذا ليس تحذيرًا: هذا منع. */
  const criticalFailed = failed.filter((r) => r.critical);

  return {
    version: CHECKLIST_VERSION,
    results,
    passed: results.filter((r) => r.pass).length,
    failed: failed.length,
    allPassed: failed.length === 0,
    safeToDeliver: criticalFailed.length === 0,
    criticalFailures: criticalFailed.map((r) => ({ id: r.id, reason: r.reason })),
    firstFailureReason: (failed[0] || {}).reason || "",
  };
}

/* وصف مختصر لقائمة التحقق، لعرضه في الواجهة أو كنص للنموذج. */
function checklistSummary() {
  return GATES.map((g, i) => `${i + 1}. ${g.label}`).join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CHECKLIST_VERSION,
    GATES,
    runChecklist,
    checklistSummary,
    DANGER_HERB_BLACKLIST,
  };
}
