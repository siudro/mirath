/* knowledge-base.js — قاعدة المعرفة المرافقة لنص النظام.
   تُستخدم في مكانين:
   ١. تُحقن في نص النظام كي يعمل الوكيل داخل حدوده وليس من ذاكرته.
   ٢. يُبنى منها فهرس تحقق بوابة الخطوة الرابعة (التدقيق) داخل app.

   كل مادة تحمل: المعرّف، الاسم العربي/الإنجليزي، الحكم (verified / unverified / not-recommended)،
   مجالات الاستخدام، المصدر، ملاحظات القيود، وكلمة البحث عن صورة المادة.
   لا تُضاف مادة هنا إلا بمصدر مكتوب. لا «رأي» في هذا الملف.
*/

const MIRATH_KB_VERSION = "2026-11-23";

const HERBS = [
  {
    id: "clean-water",
    ar: "تنظيف الجرح بالماء النظيف",
    en: "Clean water wound irrigation",
    verdict: "verified",
    verdictLabel: "✅ مثبتة",
    appliesTo: ["abrasion", "laceration", "burn", "bite", "puncture", "any"],
    evidence: "WHO — Community First Aid Response: «Gently clean the wound with clean water».",
    source: "منظمة الصحة العالمية (WHO)، دليل الإسعاف الأولي المجتمعي",
    link: "https://www.who.int/publications",
    notes: "بعد توقف النزيف فقط. لا تُستخدم مياه ملوثة. لا صابون داخل الجرح العميق.",
    imageQuery: "clean water wound irrigation first aid",
    tags: ["first-aid", "top"],
    advice:
      "اشطف الجرح بماء نظيف جارٍ بلطف، وأزل ما حوله دون فرك داخل الجرح.",
  },
  {
    id: "honey",
    ar: "العسل الطبي",
    en: "Medical-grade honey",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة",
    appliesTo: ["burn"],
    evidence:
      "مراجعة Cochrane 2015 (26 دراسة، 3011 مشاركًا): أدلة عالية الجودة على تسريع شفاء الحروق الجزئية السُمك فقط. أنواع الجروح الأخرى: أدلة منخفضة أو منخفضة جدًا.",
    source: "Cochrane 2015 · Cureus 2026 PMID 42099328 (22 RCTs)",
    link: "https://www.cochranelibrary.com",
    notes:
      "النتائج على مستحضرات العسل الطبية المعتمدة، لا العسل المنزلي غير المعقّم. لا يُستخدم للأطفال دون سنة (خطر التسمم السجقي).",
    imageQuery: "medical grade honey wound dressing",
    tags: ["herbal", "burn-only"],
    ageLimit: "not-infant",
    advice:
      "لحرق جزئي السُمك: ضع طبقة رقيقة من العسل الطبي المعتمد على شاش غير لاصق، وبدّله حسب تعليمات العبوة. لا تضع عسل المطبخ.",
  },
  {
    id: "turmeric",
    ar: "الكركم",
    en: "Turmeric (Curcuma longa)",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة",
    appliesTo: ["abrasion", "laceration"],
    evidence:
      "مراجعة 19 تجربة سريرية بشرية (Journal of Cosmetic Dermatology, 2025، PubMed 41388841)، منها 14 عشوائية محكمة — نتائج واعدة، لكن اختلاف المستحضرات والجرعات يمنع توصية موحدة.",
    source: "Journal of Cosmetic Dermatology 2025 / PubMed 41388841",
    link: "https://pubmed.ncbi.nlm.nih.gov/41388841/",
    notes: "لا يُنصح بوضع مسحوق الكركم المنزلي على الجروح المفتوحة.",
    imageQuery: "turmeric root powder",
    tags: ["herbal"],
    advice:
      "للتئام الجروح السطحية: يُستخدم الكركم في مستحضر جرح معتمد (كريم أو مرهم)، لا مسحوق المطبخ. إن لم يتوفر مستحضر، أعطه فمويًا في الطعام فهو طريقة آمنة.",
  },
  {
    id: "aloe",
    ar: "الصبر (الألوة فيرا)",
    en: "Aloe vera",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة",
    appliesTo: ["burn"],
    evidence:
      "راجعت Cochrane سبع تجارب (347 مشاركًا) ولم تجد أدلة عالية الجودة تثبت فعاليته في علاج الجروح الحادة والمزمنة.",
    source: "Cochrane Review — Aloe vera for acute and chronic wounds",
    link: "https://www.cochranelibrary.com",
    notes: "لا يُعدّ علاجًا مثبتًا ولا بديلًا عن العناية الطبية.",
    imageQuery: "aloe vera leaf",
    tags: ["herbal", "burn-only"],
    advice:
      "للحرق الخفيف بعد التبريد: ضع جل الصبر النقي على الجلد السليم حول الحرق وعلى الحرق الخفيف غير المفتوح.",
  },
  {
    id: "warm-compress",
    ar: "الكمادات الدافئة",
    en: "Warm compress",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة",
    appliesTo: ["boil"],
    evidence:
      "إرشادات صحية لمنظمة الصحة العالمية تذكر أنها قد تساعد على تصريف الدمامل الصغيرة.",
    source: "WHO Health Workers Manual",
    link: "https://www.who.int/publications",
    notes:
      "ليست علاجًا عامًا للجروح أو النزيف. لا تُستخدم الحرارة على الجروح المفتوحة دون توجيه طبي.",
    imageQuery: "warm compress wet cloth",
    tags: ["herbal", "boil-only"],
    advice:
      "لدمل صغير: ضع كمادة نظيفة دافئة (لا حارة) ١٠ إلى ١٥ دقيقة، ٣ إلى ٤ مرات يوميًا، ثم جفّف بلطف ولا تعصر الدمل.",
  },
  {
    id: "pomegranate-peel",
    ar: "قشر الرمان",
    en: "Pomegranate peel (Punica granatum)",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة للإنسان",
    appliesTo: ["abrasion", "laceration"],
    evidence:
      "دراستان على الفئران: Murthy 2004 (PMID 15298776) وNayak 2013 (PMID 24044494) — تسريع التئام الجروح وتقلّص مساحة الجرح. لا دراسات بشرية كافية.",
    source: "Journal of Medicinal Food 2004, 2013 — PubMed",
    link: "https://pubmed.ncbi.nlm.nih.gov/15298776/",
    notes:
      "قشر الرمان مادة مختلفة تمامًا عن العفص — لا تُدمجا ولا تُنقل حكم من إحداهما للأخرى.",
    imageQuery: "pomegranate peel",
    tags: ["herbal", "historical"],
    advice:
      "للتئام السطحي: يُستخدم مستخلص قشر الرمان الموثّق في دراسات — لا تُوضع القشور المنزلية على الجرح المفتوح.",
  },
  {
    id: "oak-gall",
    ar: "العفص",
    en: "Oak gall",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة — لم أجد أدلة كافية",
    appliesTo: ["abrasion"],
    evidence: "ذكره ابن سينا مع قشور الرمان ضمن القوابض. لم يوجد دليل بشري أو حيواني كافٍ على التئام الجروح.",
    source: "ابن سينا، القانون في الطب — باب حوابس السيلان (سياق تاريخي فقط)",
    link: "",
    notes: "لا دليل كافٍ. لا يُوصى به عمليًا.",
    imageQuery: "oak gall",
    tags: ["herbal", "historical"],
    advice:
      "لا توجد صيغة موصى بها للاستخدام على الجرح — الأدلة غير كافية.",
  },
  {
    id: "myrrh",
    ar: "المرّة",
    en: "Myrrh (Commiphora myrrha)",
    verdict: "unverified",
    verdictLabel: "⚠️ غير مثبتة — تجارب محدودة",
    appliesTo: ["episiotomy", "tooth-extraction"],
    evidence:
      "RCT، 90 امرأة بعد شق العجان — Faraji 2021 (PMID 32971163). RCT، 40 بالغًا بعد خلع الأسنان — Eid 2021 (PMID 33473242). EMA/HMPC EMA/164109/2019 تصنّفها للاستخدام التقليدي مع نصّ صريح أن أدلة التجارب غير كافية.",
    source: "Faraji 2021 / Eid 2021 / EMA-HMPC EMA/164109/2019",
    link: "https://pubmed.ncbi.nlm.nih.gov/32971163/",
    notes:
      "التجربتان على جرحين محددين فقط — لا تعميم على الجروح المفتوحة أو النزيف. لا تُذكر للأطفال. خطر حساسية جلدية، والمستخلص السائل يحتوي كحولًا يسبب ألمًا مؤقتًا.",
    imageQuery: "myrrh resin commiphora",
    tags: ["herbal", "historical", "narrow-indication"],
    ageLimit: "adults-only",
    advice:
      "لجرح صغير محدد (مثل شق العجان بإشراف طبي): تُستخدم مستحضرات المرّة المعتمدة فقط. لا تضع الراتنج على جرح مفتوح.",
  },
  {
    id: "eucalyptus-oil",
    ar: "زيت الكافور",
    en: "Eucalyptus oil",
    verdict: "not-recommended",
    verdictLabel: "❌ غير موصى بها",
    appliesTo: [],
    evidence:
      "لا توجد أدلة سريرية موثوقة على إيقافه للنزيف، ونشرة DailyMed تحذّر حرفيًا: «DO NOT APPLY TO WOUNDS OR DAMAGED SKIN».",
    source: "DailyMed — Eucalyptus oil label",
    link: "https://dailymed.nlm.nih.gov/",
    notes: "ممنوع على الجروح والجلد المتضرر. الأولوية للضغط المباشر في النزيف.",
    imageQuery: "eucalyptus leaves",
    tags: ["herbal", "danger"],
    advice:
      "لا يُوضع على الجرح أو الجلد المتضرر إطلاقًا.",
  },
  {
    id: "olive-wax",
    ar: "زيت الزيتون مع الشمع",
    en: "Olive oil with wax",
    verdict: "not-recommended",
    verdictLabel: "❌ غير موصى بها",
    appliesTo: [],
    evidence: "لا دليل يدعم استخدامه لإغلاق الجروح، وقد يُدخل بكتيريا.",
    source: "مراجعة الأدلة — لا دراسة سريرية داعمة",
    link: "",
    notes: "قد يُغلق الجرح ظاهريًا ويمنع خروج الإفرازات ويحبس البكتيريا.",
    imageQuery: "olive oil wax",
    tags: ["herbal", "danger"],
    advice:
      "لا يُوضع على الجرح — قد يحبس البكتيريا ويمنع التصريف.",
  },
  {
    id:
      "calendula",
    ar:
      "القُطيفة (الآذريون) — Calendula",
    en:
      "Calendula officinalis (marigold)",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — أدلة واعدة",
    appliesTo: ["abrasion", "laceration", "burn"],
    evidence:
      "مراجعة 2025 لمستحضرات الآذريون في التئام الجروح (PMID 41304647) تجمع أدلة تجريبية وسريرية على خصائص مضادة للالتهاب ومحفزة للتجديد. وفي تحليل شبكي عشوائي للوقاية من التهاب الجلد الإشعاعي (PMID 41199840) ظهرت الأدلة الأقوى بين المركبات النباتية. الأدلة لا تزال غير كافية لتوصية موحدة.",
    source:
      "Plants (Basel) 2025 — PMID 41304647 · Front Oncol 2025 — PMID 41199840",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/41304647/",
    notes:
      "تُستخدم مراهم الآذريون المعتمدة فقط. لا تُوضع أزهار أو مغلي منزلي على الجرح المفتوح. تحذير: يسبب حساسية عند من لديه حساسية من عائلة النجميات (Asteraceae).",
    imageQuery:
      "calendula officinalis flowers",
    tags: ["herbal", "skin-repair"],
    advice:
      "على جرح سطحي أو حرق خفيف: ضع مرهم الآذريون المعتمد طبقة رقيقة مرتين يوميًا، وبدّل الضمادة عند تلوثها.",
    verdictNote:
      "أدلة واعدة على التجديد ومضاد التهاب، لكن لا توصية سريرية موحدة.",
  },
  {
    id:
      "propolis",
    ar:
      "العكبر (البروبوليس)",
    en:
      "Propolis",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — أدلة واعدة",
    appliesTo: ["abrasion", "laceration", "burn", "bite"],
    evidence:
      "مراجعة 2026 لمنتجات الخلية (PMID 42943329) تجمع أدلة تجريبية وسريرية على نشاط مضاد للميكروبات ومضاد للالتهاب ومحفز للتجديد. تجربة عشوائية 2026 بعد جراحة الضرس الثالث (PMID 42943312) قارنت العكبر مع كلورهيكسيدين، وأظهرت نتائج قابلة للمقارنة في مؤشرات الالتئام.",
    source:
      "Pharmaceuticals 2026 — PMID 42943329 · Pharmaceuticals 2026 — PMID 42943312",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/42943329/",
    notes:
      "يُستخدم مستخلص معتمد فقط. تحذير: حساسية متكررة عند أهل الحساسية من منتجات النحل ولسعات النحل. لا يُستخدم للأطفال دون سنتين.",
    imageQuery:
      "propolis bee resin",
    tags: ["herbal", "antimicrobial"],
    advice:
      "على جرح سطحي صغير: ضع مستخلص العكبر المعتمد (مرهم أو رشّ) طبقة رقيقة مرتين يوميًا وفق العبوة، وتوقف فورًا عند أي حكة أو احمرار.",
    ageLimit:
      "not-infant",
    verdictNote:
      "أدلة واعدة، لكن مركباته تختلف كثيرًا بين المنتجات.",
  },
  {
    id:
      "clove-bite",
    ar:
      "زيت القرنفل المخفف (لدغات الحشرات)",
    en:
      "Diluted clove oil (insect bites)",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — أدلة محدودة",
    appliesTo: ["bite"],
    evidence:
      "أدلة محدودة على القرص فقط؛ مراجعة 2026 للمركبات النباتية في العناية بالجروح (PMID 43011174) تصف هذا المجال بأنه غير محسوم بسبب اختلاف المستحضرات والدراسات. لا توجد تجارب سريرية قوية على شفاء الجروح.",
    source:
      "3 Biotech 2026 — PMID 43011174",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/43011174/",
    notes:
      "الزيت النقي يحرق الجلد — يجب تخفيفه في زيت ناقل دائمًا. لا يُوضع على جرح مفتوح. لا يُستخدم للأطفال الصغار أو الحوامل.",
    imageQuery:
      "clove eugenol oil",
    tags: ["herbal", "bite-only"],
    advice:
      "للحكة حول لدغة حشرة: ضع قطرة من زيت القرنفل المخفف في ملعقة زيت ناقل على الجلد السليم حول اللدغة، لا داخلها.",
    verdictNote:
      "أدلة محدودة جدًا — التخفيف ضروري لتجنب الحرق.",
  },
  {
    id:
      "hypericum",
    ar:
      "العُشبة الحمراء (النسطورية) — Hypericum",
    en:
      "Hypericum perforatum (St John's wort)",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — أدلة حيوانية",
    appliesTo: ["laceration", "puncture"],
    evidence:
      "مراجعة نقدية 2026 (PMID 42994168) وجدت أن أدلة السكري للجرح من تسع دراسات حيوانية وثلاث تقارير بشرية غير خاضعة للتحكم، وأن معظمها يوجد فيها نقص في الضبط. لا توجد تجارب عشوائية محكمة كافية على الإنسان.",
    source:
      "J Tissue Viability 2026 — PMID 42994168",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/42994168/",
    notes:
      "استخدامه يسبب حساسية للضوء. ويتفاعل مع أدوية كثيرة. لا يُوصى به عمليًا على الجروح — يُذكر فقط إذا سأل المستخدم.",
    imageQuery:
      "hypericum perforatum flowers",
    tags: ["herbal", "animal-evidence"],
    advice:
      "لا توصية عملية — الأدلة حيوانية فقط. إن أراد المستخدم استخدامه: زيت النسطورية المُصنّع على الجلد السليم حول الجرح فقط، لا داخله، وتجنب الشمس بعد الاستخدام.",
    verdictNote:
      "أدلة حيوانية في الأغلب؛ لا تُعمّم على الإنسان.",
  },
  {
    id:
      "centella",
    ar:
      "الزنبق الهندي (سنتيلا آسياتيكا — Gotu Kola)",
    en:
      "Centella asiatica",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة للإنسان — تحليل تلوي حيواني",
    appliesTo: ["abrasion", "laceration", "burn"],
    evidence:
      "مراجعة منهجية وتحليل تلوي 2027 مخصص للالتئام (PMID 42772613): ضمّت ١٦ دراسة، منها ١١ قابلة للتحليل الإحصائي، ووجدت تحسنًا معنويًا في مؤشرات الالتئام (المساحة، التركيب النسيجي، الكولاجين). **لكن كل الدراسات preclinical — حيوانية، لا بشرية.**",
    source:
      "J Ethnopharmacol 2027 — PMID 42772613 (systematic review + meta-analysis)",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/42772613/",
    notes:
      "أقوى دليل حيواني في القاعدة، لكنه ليس دليلًا بشريًا. تُستخدم مستحضرات معتمدة (مرهم أو كريم) لا أعشاب منزلية. تحذير: قد يسبب حساسية جلدية، ويُنصح بالحذر مع أمراض الكبد.",
    imageQuery:
      "Centella asiatica gotu kola herb",
    tags: ["herbal", "animal-evidence"],
    advice:
      "على جرح سطحي: ضع كريمًا أو مرهمًا معتمدًا يحتوي مستخلص سنتيلا آسياتيكا طبقة رقيقة مرتين يوميًا وفق العبوة، وتوقف عند أي حكة أو احمرار.",
    verdictNote:
      "تحليل تلوي قوي لكن على الحيوانات؛ لا تُعمّم على الإنسان.",
  },
  {
    id:
      "neem",
    ar:
      "النيم (أزادراختا إنديكا)",
    en:
      "Neem (Azadirachta indica)",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — أدلة مختبرية وحيوانية",
    appliesTo: ["abrasion", "laceration"],
    evidence:
      "مراجعة 2026 (PMID 43027840) تجمع الأدلة على نشاط مضاد للميكروبات ومحفز للتجديد، ومعظمها مختبري أو حيواني. لا توجد تجارب سريرية بشرية كافية على التئام الجروح.",
    source:
      "Int J Mol Sci 2026 — PMID 43027840",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/43027840/",
    notes:
      "زيت النيم أو مستخلصه غير المعتمد قد يسبب تهيجًا. لا يُوضع على الجرح المفتوح مباشرة. لا يُعطى للأطفال أو الحوامل دون إشراف.",
    imageQuery:
      "neem leaves Azadirachta indica",
    tags: ["herbal", "animal-evidence"],
    advice:
      "لا توصية عملية على الجرح المفتوح. لطرد الحشرات حول الجرح: يمكن مسح زيت النيم المخفف على الجلد السليم البعيد عن الجرح.",
    verdictNote:
      "أدلة مختبرية في الأغلب — لا توصية على الجروح المفتوحة.",
  },
  {
    id:
      "manuka",
    ar:
      "عسل المانوكا الطبي",
    en:
      "Manuka honey (medical grade)",
    verdict:
      "unverified",
    verdictLabel:
      "⚠️ غير مثبتة — مراجعة سردية",
    appliesTo: ["burn", "laceration"],
    evidence:
      "مراجعة 2026 (PMID 42117760) تجمع الأدلة على المكون الفعّال methylglyoxal في عسل المانوكا: مضاد بكتيري، مضاد للالتهاب، ويحفز التجديد. المراجعة **سردية** لا منهجية، وتشمل جروحًا جراحية ومزمنة.",
    source:
      "Int Wound J 2026 — PMID 42117760 (evidence-based narrative review)",
    link:
      "https://pubmed.ncbi.nlm.nih.gov/42117760/",
    notes:
      "يُستخدم ضماد عسل مانوكا طبي معتمد فقط. لا يُستخدم للأطفال دون سنة. لا يُوضع على جرح نازف نشطًا.",
    imageQuery:
      "manuka honey jar medical",
    tags: ["herbal", "burn-only"],
    advice:
      "لحرق جزئي أو جرح سطحي: استخدم ضماد عسل مانوكا طبيًا معتمدًا، وبدّله كل يوم إلى ثلاثة أيام حسب تعليمات العبوة وإشراف الطبيب.",
    ageLimit:
      "not-infant",
    verdictNote:
      "مراجعة سردية — أقل قوة من مراجعة منهجية.",
  },
];

const EVIDENCE_SOURCES = [
  {
    id: "who-first-aid",
    ar: "منظمة الصحة العالمية — الإسعاف الأولي المجتمعي",
    en: "WHO — Community First Aid Response",
    url: "https://www.who.int/publications",
    covers: ["clean-water", "warm-compress"],
  },
  {
    id: "cochrane-honey",
    ar: "مراجعة Cochrane — العسل للجروح الحادة والمزمنة (2015)",
    en: "Cochrane Review 2015 — Honey for acute and chronic wounds",
    url: "https://www.cochranelibrary.com",
    covers: ["honey"],
  },
  {
    id: "cochrane-aloe",
    ar: "مراجعة Cochrane — الصبر للجروح الحادة والمزمنة",
    en: "Cochrane Review — Aloe vera for acute and chronic wounds",
    url: "https://www.cochranelibrary.com",
    covers: ["aloe"],
  },
  {
    id: "pubmed-turmeric",
    ar: "PubMed 41388841 — الكركم والتئام الجروح (2025)",
    en: "PubMed 41388841 — Turmeric and wound healing",
    url: "https://pubmed.ncbi.nlm.nih.gov/41388841/",
    covers: ["turmeric"],
  },
  {
    id: "pubmed-pomegranate",
    ar: "PMID 15298776 / 24044494 — قشر الرمان (فئران)",
    en: "PMID 15298776, 24044494 — Pomegranate peel (mouse models)",
    url: "https://pubmed.ncbi.nlm.nih.gov/15298776/",
    covers: ["pomegranate-peel"],
  },
  {
    id: "pubmed-myrrh",
    ar: "PMID 32971163 / 33473242 — المرّة",
    en: "PMID 32971163, 33473242 — Myrrh RCTs",
    url: "https://pubmed.ncbi.nlm.nih.gov/32971163/",
    covers: ["myrrh"],
  },
  {
    id: "ema-myrrh",
    ar: "EMA/HMPC EMA/164109/2019 — المرّة",
    en: "EMA/HMPC EMA/164109/2019 — Myrrh",
    url: "https://www.ema.europa.eu/en/medicines",
    covers: ["myrrh"],
  },
  {
    id: "dailymed-eucalyptus",
    ar: "DailyMed — نشرة زيت الكافور",
    en: "DailyMed — Eucalyptus oil label",
    url: "https://dailymed.nlm.nih.gov/",
    covers: ["eucalyptus-oil"],
  },
  {
    id: "ibn-sina",
    ar: "ابن سينا — القانون في الطب (سياق تاريخي، لا دليل حديث)",
    en: "Ibn Sina — Canon of Medicine (historical context, not modern evidence)",
    url: "",
    covers: ["oak-gall", "pomegranate-peel", "myrrh"],
  },
  {
    id: "razi",
    ar: "الرازي — الحاوي في الطب، طبعة دار إحياء التراث العربي، تحقيق هيثم خليفة الطعيمي (سياق تاريخي)",
    en: "Al-Razi — Al-Hawi (historical context)",
    url: "",
    covers: [],
  },
];

/* -------- أنماط الخطر — أي واحد منها يوقف كل ما بعده -------- */
const DANGER_PATTERNS = [
  { id: "blast", re: /انفجار|قنبلة|شظاي|لغم|إصابة انفجارية|blast|shrapnel|explosion|bomb/i,
    ar: "إصابة انفجار", action: "اذهب للطبيب أو اطلب إسعافًا الآن. لا أعشاب." },
  { id: "severe-bleeding", re: /نزيف (شديد|غزير|قوي)|دم (كثير|غزير)|ينزف بغزارة|severe bleeding|bleeding heavily|gushing|spurting/i,
    ar: "نزيف شديد", action: "ضغط مباشر ثابت + إسعاف الآن. لا أعشاب." },
  { id: "deep-wound", re: /جرح (عميق|واسع)|عميق جدًا|deep wound|wide wound/i,
    ar: "جرح عميق أو واسع", action: "طبيب الآن — قد يحتاج خياطة." },
  { id: "loss-of-consciousness", re: /فقد الوعي|غاب عن الوعي|غير واع|unconscious|passed out/i,
    ar: "فقدان وعي", action: "اطلب إسعافًا الآن." },
  { id: "breathing", re: /صعوبة (في )?التنفس|ضيق نفس|لا يتنفس|shortness of breath|difficulty breathing|not breathing/i,
    ar: "صعوبة تنفس", action: "اطلب إسعافًا الآن." },
  { id: "impaled", re: /جسم (مغروس|غائر|داخل الجرح)|شيء مغروس|impaled|object (stuck|embedded)/i,
    ar: "جسم مغروس", action: "لا تُزله. ثبّته واذهب للطبيب الآن." },
];

/* -------- كتالوج الأدوات — تظهر هذه أسماءها للشخص أثناء انتظاره -------- */
const TOOL_CATALOG = [
  { id: "read-image", ar: "قراءة الصورة", icon: "leaf",
    detail: "أفصل ما أرى فعلًا عمّا أستنتجه، وأسجّل ما لا أراه." },
  { id: "triage", ar: "فرز الخطورة", icon: "shield",
    detail: "أتحقق أولًا: هل هذا نزيف شديد أو إصابة انفجار؟" },
  { id: "lookup", ar: "مراجعة قاعدة الأدلة", icon: "book",
    detail: "أفتح الممارسة في قاعدة المعرفة المرافقة وأقرأ حكمها ومصدرها." },
  { id: "websearch", ar: "بحث في الدراسات", icon: "globe",
    detail: "أبحث عن دراسات حديثة تدعم الممارسة أو تنقضها." },
  { id: "verify", ar: "تدقيق مستقل", icon: "check-shield",
    detail: "مدقّق ثانٍ يعارض الجواب قبل أن يصل إليك." },
  { id: "herb-image", ar: "جلب صورة المادة", icon: "sprout",
    detail: "أبحث عن صورة للمادة المقترحة، وأرفق مصدرها." },
  { id: "compose", ar: "صياغة الإجابة", icon: "bloom",
    detail: "أرتب النتيجة: إرشاد أولي، ثم سؤال واحد، ثم حكم الطب القديم." },
];

/* -------- حدود النطاق -------- */
const SCOPE = {
  inScope: ["جروح", "حروق", "خدوش", "جروح سطحية", "دمامل صغيرة", "لدغات سطحية", "شق عجان", "خلع سن"],
  outOfScope: ["حميات", "جفاف", "التهاب حلق", "آلام معدة", "أمراض مزمنة", "تشخيص عام", "دواء", "جرعة"],
  note: "خارج النطاق: قل ذلك بصراحة، والتفت إلى الطبيب، ولا تفتح نقاشًا طبيًا عامًا.",
};

/* -------- اللغة -------- */
const LANG_RULES = {
  detect: "لغة المستخدم — عربية ⟵ عربية، إنجليزية ⟵ إنجليزية.",
  mixed: "إن خلط اللغتين، اتبع لغة آخر رسالة كاملة.",
  terminology: "المصطلح الطبي يُبسّط ولا يُترجم إلى لغة معقدة.",
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MIRATH_KB_VERSION,
    HERBS,
    EVIDENCE_SOURCES,
    DANGER_PATTERNS,
    TOOL_CATALOG,
    SCOPE,
    LANG_RULES,
  };
}
