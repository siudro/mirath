/* tests/prompt.test.js — تحقق من نص النظام وتركيبه.
   لا يمكن أن يفقد النص قواعده المثبتة بالخطأ. */

"use strict";

const assert = require("assert");
const { SYSTEM_PROMPT, AGENT_RULES, FORMAT_RULES, composeFullPrompt } = require("../prompt.js");
const { HERBS, EVIDENCE_SOURCES } = require("../data/knowledge-base.js");

module.exports = ({ test }) => {
  test("نص النظام نص كامل", () => {
    assert.strictEqual(typeof SYSTEM_PROMPT, "string");
    assert.ok(SYSTEM_PROMPT.length > 15000, `${SYSTEM_PROMPT.length} حرف`);
  });

  test("هوية ميراث موجودة", () => {
    assert.ok(SYSTEM_PROMPT.includes("مِيراث"));
  });

  test("المبدأ الأساسي حرفيًا", () => {
    assert.ok(SYSTEM_PROMPT.includes("هدفك مساعدة الإنسان وحمايته"));
    assert.ok(SYSTEM_PROMPT.includes("وليس إثبات صحة الطب القديم أو الدفاع عنه"));
  });

  test("قاعدة الحل أولًا", () => {
    assert.ok(SYSTEM_PROMPT.includes("الحل أولًا"));
    assert.ok(SYSTEM_PROMPT.includes("الإرشاد أولًا"));
  });

  test("منع السؤال قبل الحل صريح", () => {
    assert.ok(SYSTEM_PROMPT.includes("لا تبدأ ردك بسؤال"));
  });

  test("حدّ الطوارئ صريح", () => {
    assert.ok(SYSTEM_PROMPT.includes("إصابة الانفجار أو النزيف الشديد"));
    assert.ok(SYSTEM_PROMPT.includes("لا اقتراحات عشبية"));
  });

  test("الحكم على المادة إلزامي", () => {
    assert.ok(SYSTEM_PROMPT.includes("✅ مثبتة"));
    assert.ok(SYSTEM_PROMPT.includes("⚠️ غير مثبتة"));
    assert.ok(SYSTEM_PROMPT.includes("❌ غير موصى بها"));
  });

  test("المواد الرئيسية في النص", () => {
    for (const h of HERBS) {
      // الاسم قد يكون بصيغة مختصرة في النص، نتحقق من الجذر
      const key = h.ar.split(" ")[0];
      assert.ok(
        SYSTEM_PROMPT.includes(key) || h.tags.includes("top"),
        `${h.ar} غير مذكورة`
      );
    }
  });

  test("تحذير الخلط بين العفص وقشر الرمان", () => {
    assert.ok(/العفص وقشر الرمان مادتان مختلفتان/.test(SYSTEM_PROMPT));
  });

  test("العبارات الثلاث لا تُستخدم بالتبادل", () => {
    assert.ok(SYSTEM_PROMPT.includes("لا توجد دراسات بشرية كافية"));
    assert.ok(SYSTEM_PROMPT.includes("لا توجد أدلة موثوقة"));
    assert.ok(SYSTEM_PROMPT.includes("ثبت عدم الفعالية"));
  });

  test("قواعد الاستشهاد موجودة", () => {
    assert.ok(SYSTEM_PROMPT.includes("باب حوابس السيلان"));
    assert.ok(SYSTEM_PROMPT.includes("هيثم خليفة الطعيمي"));
    assert.ok(SYSTEM_PROMPT.includes("لا تخترع"));
  });

  test("حدود النطاق", () => {
    assert.ok(SYSTEM_PROMPT.includes("النطاق"));
    assert.ok(SYSTEM_PROMPT.includes("الجروح فقط") || SYSTEM_PROMPT.includes("الجروح —"));
  });

  test("إطار الطالب محفوظ", () => {
    assert.ok(SYSTEM_PROMPT.includes("حنين محمد"));
    assert.ok(SYSTEM_PROMPT.includes("WAI-132"));
  });

  /* ───── طبقة التشغيل ───── */

  test("قواعد الوكيل تُعرّف الأدوار", () => {
    assert.ok(AGENT_RULES.includes("كاتب"));
    assert.ok(AGENT_RULES.includes("مدقّق"));
    assert.ok(AGENT_RULES.includes("قاضي"));
  });

  test("قواعد الشكل تمنع الزخرفة", () => {
    assert.ok(FORMAT_RULES.includes("جملة واحدة لكل سطر"));
    assert.ok(FORMAT_RULES.includes("بلا علامات تعجب"));
    assert.ok(FORMAT_RULES.includes("سؤال واحد"));
  });

  test("قواعد الشكل تحدد الطول", () => {
    assert.ok(/٤ إلى ٨ أسطر|٤ إلى ٨/.test(FORMAT_RULES));
    assert.ok(FORMAT_RULES.includes("١٢"));
  });

  /* ───── التركيب ───── */

  test("النص الكامل يحتوي النص الأصلي + الطبقة", () => {
    const full = composeFullPrompt({ kb: { herbs: HERBS, sources: EVIDENCE_SOURCES } });
    assert.ok(full.includes(SYSTEM_PROMPT));
    assert.ok(full.includes(AGENT_RULES));
    assert.ok(full.includes(FORMAT_RULES));
  });

  test("النص الكامل يحقن قاعدة المعرفة", () => {
    const full = composeFullPrompt({ kb: { herbs: HERBS, sources: EVIDENCE_SOURCES } });
    assert.ok(full.includes("قاعدة المعرفة المرافقة"));
    assert.ok(full.includes("تنظيف الجرح بالماء النظيف"));
    assert.ok(full.includes("زيت الكافور"));
  });

  test("النص الكامل يذكر المصادر", () => {
    const full = composeFullPrompt({ kb: { herbs: HERBS, sources: EVIDENCE_SOURCES } });
    assert.ok(full.includes("Cochrane"));
    assert.ok(full.includes("DailyMed") || full.includes("EMA"));
  });

  test("النص الكامل يعمل بلا قاعدة", () => {
    const full = composeFullPrompt({});
    assert.ok(full.includes(SYSTEM_PROMPT));
    assert.ok(!full.includes("قاعدة المعرفة المرافقة"));
  });

  test("النص الكامل في حدود Token معقولة", () => {
    const full = composeFullPrompt({ kb: { herbs: HERBS, sources: EVIDENCE_SOURCES } });
    // تقدير تقريبي: ٣ حروف عربية ≈ توكن واحد
    const approxTokens = full.length / 2.8;
    assert.ok(approxTokens < 20000, `~${Math.round(approxTokens)} توكن — كثير`);
  });
};
