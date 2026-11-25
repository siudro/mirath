/* config/checklist.js — قائمة تحقق ميراث (checklist).
   هذه ليست نصًا يُرسل للنموذج فقط، بل **حاجز تنفيذي**:
   كل بوابة لها دالة تُرجع { pass, reason }. إن فشلت بوابة، يُعاد للنموذج
   بسبب الفشل، إن أمكن، أو يُصحَّح الرد آليًا.
   ملف مستقل قابل للفحص. لا أراء — كل قاعدة مشتقة من الدليل أو القرار الموثق. */

const CHECKLIST_VERSION = "2026-11-23";

/* حراسة الطوارئ — لا تُتجاوَز أبدًا */
const DANGER_SAFE_WORDS = [
  "إسعاف", "إسعافًا", "الطبيب", "طبيب", "جهة طبية", "غادر", "اذهب",
  "تقييم طبي", "تقييمًا طبيًا", "تقييمي طبي", "خياطة", "الطوارئ", "طوارئ",
  "مركز صحي", "عيادة", "جراح",
  "emergency", "ambulance", "doctor", "hospital", "clinic",
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
  turmeric: ["الكركم", "كركم", "الكركمين", "turmeric", "curcumin"],
  aloe: ["الصبر", "الألوة", "ألوة فيرا"],
  "pomegranate-peel": ["قشر الرمان", "الرمان"],
  "eucalyptus-oil": ["الكافور", "كافور"],
  "olive-wax": ["زيت الزيتون", "الزيتون"],
  myrrh: ["المرة", "مرة"],
  "oak-gall": ["العفص", "عفص"],
  "clean-water": ["الماء النظيف", "تنظيف الماء"],
  "warm-compress": ["الكمادات", "كمادات"],
  calendula: ["الآذريون", "القطيفة", "القُطيفة", "calendula", "مرهم الآذريون"],
  propolis: ["العكبر", "البروبوليس", "propolis"],
  "clove-bite": ["القرنفل", "زيت القرنفل", "clove"],
  hypericum: ["العشبة الحمراء", "النسطورية", "Hypericum", "hypericum"],
  centella: ["الزنبق الهندي", "سنتيلا", "سنتیلا", "آسياتيكا", "Centella", "centella", "Gotu Kola"],
  neem: ["النيم", "نيم", "أزادراختا", "Neem", "neem"],
  manuka: ["المانوكا", "مانوكا", "Manuka", "manuka"],
  "tea-tree": ["شجرة الشاي", "زيت شجرة الشاي", "tea tree", "teatree", "melaleuca"],
  thyme: ["الزعتر", "زعتر", "thyme", "Thymus"],
  "green-tea": ["الشاي الأخضر", "شاي أخضر", "green tea", "camellia"],
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

      /* ★ الحالة الخاصة التي طلبتها المستخدمة: جرح عميق/خطير بعد أن يتوقف النزيف
         — يُسمح بإرشاد تقليدي مشروط، بشرط:
           (١) طلب التقييم الطبي موجود،
           (٢) ذكر صريح أن النزيف توقف،
           (٣) المادة ليست «داخل» الجرح العميق.
         النزيف الشديد الجاري أو الانفجار يبقى ممنوعًا مهما كان. */
      const isBleedingActive = (ctx.danger || []).some((d) => d.id === "severe-bleeding" || d.id === "blast");
      const saysStopped = /توقف النزيف|النزيف توقف|بعد توقف|بعد أن يتوقف|توقف النزف|النزف توقف/.test(t);
      const needsDoctor = /طبيب|تقييم طبي|طوارئ|إسعاف|خياطة/.test(t);
      const conditionalAllowed = !isBleedingActive && saysStopped && needsDoctor;

      const lower = t.toLowerCase();
      const offender = !conditionalAllowed && DANGER_HERB_BLACKLIST.find((h) => {
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

      /* ★ حتى في الحالة المشروطة: وضع مادة «داخل» الجرح العميق ممنوع.
         الخطر أن تُحبس البكتيريا أو تمنع التصريف قبل التقييم الطبي. */
      if (conditionalAllowed) {
        const insidePattern = /(داخل|في)\s+(الجرح|الجرح العميق|الجرح المفتوح)[^.\n]{0,50}(عسل|كركم|عشب|مسحوق|زيت|مرة|رمان|مرهم)/;
        if (insidePattern.test(t)) {
          return {
            pass: false,
            reason: "مادة موضوعة داخل جرح عميق — ممنوع قبل التقييم الطبي (خطر التلوث والحبس).",
          };
        }
        // ولا يجوز تأخير الطبيب
        const early = t.slice(0, 200);
        if (!/طبيب|تقييم طبي|طوارئ|إسعاف|خياطة/.test(early)) {
          return {
            pass: false,
            reason: "إرشاد تقليدي في جرح خطير بدون طلب تقييم طبي في أول الرد.",
          };
        }
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
          let has = HERB_VERDICT_MARKERS.some((m) => slice.includes(m));
          /* ★ التحذير الصريح («تجنّب…» / «لا أنصح…») هو نفسه حكم بالرفض.
             لا نطالب بلصيقة ⚠️ فوقه، فالسطر التحذيري أوضح من اللصيقة. */
          if (!has && /تجنّب|لا أنصح|لا تضع|لا تستخدم|ابتعد|ابعد/.test(slice)) has = true;
          /* ★ صيغة النصح الصريح («أنصحك بـ…») تحمل حكمها في بنيتها: توصية.
             البوابة «recommendation-voice» تتحقق من الدليل. لا نطالب بلصيقة إضافية. */
          if (!has && /أنصحك|أوصي/.test(slice)) has = true;
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
    id: "herbal-substance",
    label: "طب قديم حقيقي لا ماء فقط",
    detail: "الرد السليم يجب أن يسمّي مادة أو ممارسة تقليدية فعلية، لا «تنظيف الماء» وحده.",
    test(ctx) {
      const text = ctx.text || "";
      if (!text) return { pass: true };
      // نفحص فقط الردود التي فيها كتلة طب قديم
      if (!/الطب القديم|ما يقوله الطب/.test(text)) return { pass: true };

      const kb = (ctx.kb && ctx.kb.herbs) || [];
      // «تنظيف الماء» إسعاف أولي وليس طبًا تقليديًا لمشروعنا
      const NOT_HERBAL = new Set(["clean-water"]);
      const named = kb.filter((h) => {
        if (NOT_HERBAL.has(h.id)) return false;
        if (h.verdict === "not-recommended") return false;
        return text.includes(h.ar) || (ALIASES[h.id] || []).some((a) => text.includes(a));
      });

      if (!named.length) {
        return {
          pass: false,
          reason: "كتلة الطب القديم تذكر الماء فقط — لا مادة أو ممارسة تقليدية. المشروع يفقد هويته.",
        };
      }

      /* ★ التوصية يجب أن تكون فعلًا، لا تصنيفًا.
         المستخدم قال صراحةً إنه لا يريد «مثبتة / غير مثبتة» وحده — يريد
         «ضع العسل على هذا الجرح». نتحقق من وجود فعل أمر قريب من اسم المادة. */
      const ACTIONS = [
        "ضع", "ضعي", "ضعوا", "اشطف", "اشطفي", "اغسل", "اغسلي", "غطِّ", "غطي",
        "كرر", "كرري", "استخدم", "استخدمي", "باستخدام", "دلّك", "دلكي", "بدّل", "بدلي",
        "apply", "wash", "rinse", "cover", "use", "repeat", "change",
      ];
      const hasAction = named.some((h) => {
        const aliases = [h.ar].concat(ALIASES[h.id] || []);
        for (const a of aliases) {
          let from = 0;
          while (true) {
            const at = text.indexOf(a, from);
            if (at === -1) break;
            /* الفعل قد يأتي قبل الاسم («ضع مرهم الآذريون») أو بعده
               («الآذريون — ضعه على الجرح»). نفحص النافذتين. */
            const before = text.slice(Math.max(0, at - 120), at + a.length);
            const after = text.slice(at, at + 160);
            if (ACTIONS.some((v) => before.includes(v) || after.includes(v))) return true;
            from = at + a.length;
          }
        }
        return false;
      });

      if (!hasAction) {
        return {
          pass: false,
          reason:
            "الرد يذكر مواد بلا توصية تنفيذية — يجب أن يقول ماذا يفعل بها (ضع/اشطف/غطِّ + المدة).",
        };
      }
      return { pass: true };
    },
  },

  {
    id: "recommendation-voice",
    label: "نصح صريح لا شرط",
    detail: "كتلة الطب القديم يجب أن تصرّح بـ«أنصحك» وأن تستشهد بدليلها.",
    test(ctx) {
      const text = ctx.text || "";
      /* ★ البوابة تُطبَّق كلما ذُكرت مادة تقليدية — لا على وجود عنوان فقط.
         النموذج قد يذكر «الآذريون» بلا عنوان «ما يقوله الطب القديم»،
         فيفلت من الفحص وهذا ما جعل الردود الباردة تمرّ. */
      const kbList = (ctx.kb && ctx.kb.herbs) || [];
      const NOT_HERBAL = new Set(["clean-water"]);
      const mentionsTrad = kbList.some((h) => {
        if (NOT_HERBAL.has(h.id)) return false;
        if (h.verdict === "not-recommended") return false;
        const al = [h.ar].concat(ALIASES[h.id] || []);
        return al.some((a) => text.includes(a));
      });
      if (!mentionsTrad && !/الطب القديم|الممارسات التراثية/.test(text)) return { pass: true };

      const lower = text;
      // صيغة الشرط تُضعف التوصية إلى حد إلغائها
      const hedging = /إذا توفر|إن توفر|إن كان متوفر/.test(lower);
      /* «لا أستطيع التوصية» ليست نصحًا — نستبعد النفي. */
      const refuses = /لا أستطيع التوصية|لا يمكنني التوصية|لا أوصي|لا أنصح/.test(lower);
      const recommends = !refuses && /أنصحك|أوصي|أنصح/.test(lower);
      const cites = /PMID\s?\d{6,}|Cochrane|WHO|منظمة الصحة|EMA|DailyMed|مراجعة|تحليل تلوي/.test(lower);

      /* الشرط يُضعف التوصية حتى لو وُجدت «أنصحك» في مكان آخر.
         المستخدم طلب وصفة، لا خيارًا مشروطًا. */
      if (hedging) {
        return { pass: false, reason: "التوصية بصيغة الشرط («إذا توفر…») — يجب أن تكون نصحًا مباشرًا." };
      }
      if (!recommends) {
        return { pass: false, reason: "لا توجد صيغة نصح صريحة («أنصحك بـ…») في كتلة التوصية." };
      }
      if (!cites) {
        return { pass: false, reason: "التوصية بلا استشهاد بدليل (PMID أو مراجعة)." };
      }
      return { pass: true };
    },
  },

  {
    id: "avoid-unproven",
    label: "التحذير من غير المثبت",
    detail: "أي مادة غير مثبتة تُذكر يجب أن يُصحبها نهي عن استخدامها.",
    test(ctx) {
      const text = ctx.text || "";
      if (!text) return { pass: true };

      const kb = (ctx.kb && ctx.kb.herbs) || [];
      /* ★ المستخدمة طلبت: اذكر غير المثبت وحذّر منه. الذكر بلا تحذير
         يقرأه المصاب كتوصية — وهذا خطر. */
      const warned = /لا أنصح|لا تستخدم|تجنّب|ابعد|ابتعد|غير موصى|لا تضع|لا يُستخدم|ممنوع|احذر/i;

      for (const h of kb) {
        if (h.verdict === "verified") continue;
        if (h.verdict === "not-recommended") continue; // مغطاة ببوابة الخطورة
        /* ★ المواد «الواعدة» تُنصح، لا تُحذَّر. الخلط بينها وبين غير المثبت
           كان يدفع النموذج لقول «لا حاجة لها» عن مواد جيدة. */
        if (/واعدة/.test(h.verdictLabel || "")) continue;
        const aliases = [h.ar].concat(ALIASES[h.id] || []);
        let mentioned = false;
        for (const a of aliases) {
          if (text.includes(a)) { mentioned = true; break; }
        }
        if (!mentioned) continue;

        // نافذة حول ذكر المادة: هل يوجد تحذير قريب؟
        let guarded = false;
        for (const a of aliases) {
          let from = 0;
          while (true) {
            const at = text.indexOf(a, from);
            if (at === -1) break;
            const window = text.slice(Math.max(0, at - 120), at + 300);
            if (warned.test(window)) { guarded = true; break; }
            from = at + a.length;
          }
          if (guarded) break;
        }
        if (!guarded) {
          return {
            pass: false,
            reason: `المادة «${h.ar}» غير مثبتة وذُكرت بلا تحذير — يجب النهي عن استخدامها صراحةً.`,
          };
        }
      }
      return { pass: true };
    },
  },

  {
    id: "promising-not-avoided",
    label: "الواعد لا يُنبَّه عنه",
    detail: "المادة الموسومة «واعدة» تُنصح، لا تُصنَّف مع ما يجب تجنّبه.",
    test(ctx) {
      const text = ctx.text || "";
      if (!text) return { pass: true };
      const kb = (ctx.kb && ctx.kb.herbs) || [];

      for (const h of kb) {
        if (!/واعدة/.test(h.verdictLabel || "")) continue;
        /* الأسماء البديلة هي ما يُكتب فعلًا؛ الاسم الكامل نادرًا ما يظهر. */
        const aliases = (ALIASES[h.id] || []).concat([h.ar]);
        let at = -1;
        for (const a of aliases) {
          const i = text.indexOf(a);
          if (i !== -1) { at = i; break; }
        }
        if (at === -1) continue;

        /* ★ نفحص الجملة الحاوية للمادة فقط — لا نافذة واسعة.
           النافذة الواسعة تلتقط «أنصحك» الخاصة بمادة أخرى، فيمر الخطأ. */
        const before = text.slice(0, at);
        const sentStart = Math.max(before.lastIndexOf("."), before.lastIndexOf("\n"), before.lastIndexOf("،")) + 1;
        const after = text.slice(at);
        const sentEnd = (() => {
          const d = after.indexOf(".");
          const n = after.indexOf("\n");
          const c = after.indexOf("،");
          const cands = [d, n, c].filter((x) => x !== -1);
          return cands.length ? at + Math.min(...cands) : text.length;
        })();
        const clause = text.slice(sentStart, sentEnd);

        const avoided = /تجنّب|لا تضع|لا تستخدم|لا أنصح|ابتعد|ابعد/.test(clause);
        const recommended = /أنصحك|أوصي/.test(clause);

        if (avoided && !recommended) {
          return {
            pass: false,
            reason: `المادة «${h.ar}» واعدة، لكنها وُضعت في سياق التحذير بدل النصح.`,
          };
        }
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
      const herbs = (ctx.kb && ctx.kb.herbs) || [];
      const pmids = t.match(/PMID\s*(\d{6,})/gi) || [];
      const allowed = new Set();
      /* ★ المراجع قد تكون في قائمة الأدلة العامة أو في حقل source/evidence
         لكل مادة. كان الفحص يقرأ الأولى فقط، فكان يرفض استشهادًا صحيحًا
         بمادة في القاعدة. */
      /* بعض المصادر تكتب «PubMed 41388841» بدل «PMID 41388841».
         نقبل الصيغتين ونوحّدها إلى رقم مجرد. */
      const harvest = (str) => {
        const text2 = String(str || "");
        const m1 = text2.match(/PMID\s*(\d{6,})/gi) || [];
        m1.forEach((x) => allowed.add(x.replace(/^(PMID|PubMed)\s*/i, "").trim()));
        const m2 = text2.match(/PubMed\s*(\d{6,})/gi) || [];
        m2.forEach((x) => allowed.add(x.replace(/^(PMID|PubMed)\s*/i, "").trim()));
      };
      for (const s of sources) { harvest(s.en); harvest(s.ar); }
      for (const h of herbs) { harvest(h.source); harvest(h.evidence); }
      for (const p of pmids) {
        const normalized = p.replace(/^(PMID|PubMed)\s*/i, "").trim();
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
