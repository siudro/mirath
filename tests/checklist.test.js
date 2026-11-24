/* tests/checklist.test.js — تحقق من قائمة التحقق نفسها.
   هذه ليست اختبارات على الردود فحسب، بل على قدرة البوابة على رفض الردود السيئة.
   إن مرّ ردّ سيئ بلا اعتراض، فالبوابة معطوبة. */

"use strict";

const assert = require("assert");
const { runChecklist, GATES, DANGER_HERB_BLACKLIST } = require("../config/checklist.js");
const { HERBS, EVIDENCE_SOURCES } = require("../data/knowledge-base.js");

const KB = { herbs: HERBS, sources: EVIDENCE_SOURCES };

const danger = [{ id: "severe-bleeding", ar: "نزيف شديد" }];

function check(text, extra) {
  return runChecklist(Object.assign({ text, kb: KB, danger: [], hasImage: false }, extra || {}));
}

module.exports = ({ test }) => {
  /* ───── بنية ───── */

  test("قائمة التحقق فيها ٩ بوابات على الأقل", () => {
    assert.ok(GATES.length >= 9, `وجدنا ${GATES.length}`);
  });

  test("كل بوابة لها معرّف ووصف", () => {
    for (const g of GATES) {
      assert.ok(g.id && g.label && g.detail, `بوابة ناقصة: ${g.id}`);
      assert.strictEqual(typeof g.test, "function");
    }
  });

  test("معرّفات البوابات فريدة", () => {
    const ids = GATES.map((g) => g.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  /* ───── البوابة ١: الخطورة ───── */

  test("رد طارئ بلا توجيه طبي يُرفض", () => {
    const r = check("تغطية الجرح بضمادة نظيفة ثم راقبه", { danger });
    assert.strictEqual(r.allPassed, false, "كان يجب أن يُرفض");
    assert.ok(r.results.find((x) => x.id === "danger-first").pass === false);
  });

  test("رد طارئ يبدأ بالطبيب يمرّ", () => {
    const r = check("اذهب للطبيب أو اطلب إسعافًا الآن.\nاضغط بقماش نظيف ثابتًا.", { danger });
    const gate = r.results.find((x) => x.id === "danger-first");
    assert.ok(gate.pass, gate.reason);
  });

  test("رد طارئ يذكر عسلًا يُرفض", () => {
    const r = check("اطلب إسعافًا الآن.\nضع العسل على الجرح لتسريع الالتئام.", { danger });
    const gate = r.results.find((x) => x.id === "danger-first");
    assert.strictEqual(gate.pass, false, "العسل في الطوارئ يجب أن يُرفض");
    assert.ok(/عسل/.test(gate.reason), gate.reason);
  });

  test("كل مادة في القائمة السوداء تمنع نفسها في الطوارئ", () => {
    for (const herb of DANGER_HERB_BLACKLIST) {
      const text = `اطلب إسعافًا الآن.\nاستخدم ${herb} على الجرح.`;
      const gate = check(text, { danger }).results.find((x) => x.id === "danger-first");
      assert.strictEqual(gate.pass, false, `"${herb}" لم يُرفض`);
    }
  });

  /* ───── البوابة ٢: سؤال واحد ───── */

  test("سؤالان في رد واحد يُرفضان", () => {
    const gate = check("اغسل الجرح بالماء.\nهل هو عميق؟ هل يوجد نزيف؟")
      .results.find((x) => x.id === "one-question");
    assert.strictEqual(gate.pass, false);
  });

  test("سؤال واحد يمرّ", () => {
    const gate = check("اغسل الجرح بالماء النظيف.\nهل النزيف توقف؟")
      .results.find((x) => x.id === "one-question");
    assert.ok(gate.pass, gate.reason);
  });

  test("علامة الاستفهام الإنجليزية تُحسب", () => {
    const gate = check("Clean the wound. Is it deep? Is there bleeding?")
      .results.find((x) => x.id === "one-question");
    assert.strictEqual(gate.pass, false);
  });

  /* ───── البوابة ٣: لا يبدأ بسؤال ───── */

  test("رد يبدأ بسؤال يُرفض", () => {
    const gate = check("هل المصاب طفل أم بالغ؟\nاغسل الجرح بعد ذلك.")
      .results.find((x) => x.id === "no-question-first");
    assert.strictEqual(gate.pass, false);
  });

  test("رد يبدأ بكلمة استفهام بلا علامة يُرفض", () => {
    const gate = check("هل يوجد نزيف.\nاغسل الجرح.").results.find((x) => x.id === "no-question-first");
    assert.strictEqual(gate.pass, false);
  });

  test("رد يبدأ بفعل يمرّ", () => {
    const gate = check("اضغط بقماش نظيف ٥ دقائق.\nنظّف بماء نظيف.")
      .results.find((x) => x.id === "no-question-first");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── البوابة ٤: كل مادة بحكمها ───── */

  test("مادة بلا حكم تُرفض", () => {
    const gate = check("اغسل الجرح.\n— ما يقوله الطب القديم:\nالعسل — كانوا يستخدمونه قديمًا.")
      .results.find((x) => x.id === "herb-needs-verdict");
    assert.strictEqual(gate.pass, false, "كان يجب أن يُرفض");
    assert.ok(/العسل/.test(gate.reason), gate.reason);
  });

  test("مادة مع حكمها تمرّ", () => {
    const gate = check("اغسل الجرح.\n— ما يقوله الطب القديم:\nالعسل — ⚠️ غير مثبتة — للحرق فقط.")
      .results.find((x) => x.id === "herb-needs-verdict");
    assert.ok(gate.pass, gate.reason);
  });

  test("الحكم في السطر التالي يُحسب", () => {
    const gate = check("العسل\n⚠️ غير مثبتة — للحرق فقط")
      .results.find((x) => x.id === "herb-needs-verdict");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── البوابة ٥: الصورة ───── */

  test("صورة بلا تنبيه تُرفض", () => {
    const gate = check("جرح بسيط. ضع ضمادة.", { hasImage: true })
      .results.find((x) => x.id === "image-caveat");
    assert.strictEqual(gate.pass, false);
  });

  test("صورة مع تنبيه العمق تمرّ", () => {
    const gate = check("الصورة لا تكفي لتحديد العمق.\nاضغط بقماش نظيف.", { hasImage: true })
      .results.find((x) => x.id === "image-caveat");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── البوابة ٦: النطاق ───── */

  test("سؤال خارج النطاق بلا توجيه يُرفض", () => {
    const gate = check("الحمية مهمة لإنقاص الوزن.", { outOfScope: true })
      .results.find((x) => x.id === "scope-only-wounds");
    assert.strictEqual(gate.pass, false);
  });

  test("سؤال خارج النطاق مع توجيه يمرّ", () => {
    const gate = check("هذا خارج نطاقي. راجع طبيبك.", { outOfScope: true })
      .results.find((x) => x.id === "scope-only-wounds");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── البوابة ٧: لا دواء ولا جرعة ───── */

  test("ذكر دواء يُرفض", () => {
    const gate = check("خذ باراسيتامول للألم.").results.find((x) => x.id === "no-dosage");
    assert.strictEqual(gate.pass, false);
  });

  test("رقم جرعة يُرفض", () => {
    const gate = check("استخدم 500 ملغ من الدواء.").results.find((x) => x.id === "no-dosage");
    assert.strictEqual(gate.pass, false, "الجرعة لم تُرفض");
  });

  test("رد بلا دواء يمرّ", () => {
    const gate = check("اضغط بقماش نظيف ٥ دقائق.").results.find((x) => x.id === "no-dosage");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── البوابة ٨: لا مرجع مُختلق ───── */

  test("PMID معروف يمرّ", () => {
    const gate = check("الدراسة (PMID 15298776) على الفئران.").results.find((x) => x.id === "no-invented-citation");
    assert.ok(gate.pass, gate.reason);
  });

  test("PMID مجهول يُرفض", () => {
    const gate = check("الدراسة (PMID 99999999) تثبت الفعالية.").results.find((x) => x.id === "no-invented-citation");
    assert.strictEqual(gate.pass, false);
  });

  test("رقم صفحة على ابن سينا يُرفض", () => {
    const gate = check("ابن سينا، القانون في الطب، ص 308.").results.find((x) => x.id === "no-invented-citation");
    assert.strictEqual(gate.pass, false);
  });

  test("موقع نسخ رقمي كمرجع يُرفض", () => {
    const gate = check("راجع shamela.ws للتفاصيل.").results.find((x) => x.id === "no-invented-citation");
    assert.strictEqual(gate.pass, false);
  });

  /* ───── البوابة ٩: الطول ───── */

  test("رد طويل يُرفض", () => {
    const long = Array.from({ length: 15 }, (_, i) => `سطر ${i + 1}`).join("\n");
    const gate = check(long).results.find((x) => x.id === "length");
    assert.strictEqual(gate.pass, false);
  });

  test("رد قصير يمرّ", () => {
    const gate = check("اضغط بقماش نظيف.\nنظّف بماء نظيف.\nغطِّ بضمادة.").results.find((x) => x.id === "length");
    assert.ok(gate.pass, gate.reason);
  });

  /* ───── التجميع ───── */

  test("رد مثالي يمرّ من كل البوابات", () => {
    const text = [
      "اضغط بقماش نظيف ٥ دقائق حتى يتوقف النزيف.",
      "نظّف الجرح بلطف بماء نظيف.",
      "غطِّ الجرح بضمادة نظيفة.",
      "— سؤال: هل النزيف يتشرّب القماش بسرعة؟",
      "— ما توصي به من الطب القديم في جرح مثل هذا:",
      "أنصحك بتنظيف الجرح بالماء النظيف بعد توقف النزيف — مثبتة (WHO).",
      "أنصحك باستخدام مرهم الآذريون المعتمد مرتين يوميًا — (PMID 41304647).",
      "وتجنّب مسحوق الكركم المنزلي — ⚠️ غير مثبتة، دليلها غير كافٍ، ولا يُوضع على الجرح المفتوح.",
    ].join("\n");
    const r = check(text);
    assert.strictEqual(r.allPassed, true, JSON.stringify(r.results.filter((x) => !x.pass)));
  });

  /* ───── ★ الطب القديم مادة حقيقية لا ماء فقط ───── */
  /* سبب هذه المجموعة: تقرير مستخدم حقيقي أن الردود صارت «إسعافات أولية عادية»
     فتكرر «تنظيف الماء» في كل مرة. الماء إسعاف أولي، لا طب تقليدي. */

  test("★ كتلة طب قديم بالماء فقط تُرفض", () => {
    const t = [
      "اضغط بقماش نظيف.",
      "— هل ينزف؟",
      "— ما يقوله الطب القديم في جرح مثل هذا:",
      "تنظيف الماء — ✅ مثبتة — WHO.",
    ].join("\n");
    const g = check(t).results.find((x) => x.id === "herbal-substance");
    assert.strictEqual(g.pass, false, "الماء وحده مرّ كطب قديم");
  });

  test("★ مادة تقليدية مع الماء تمرّ", () => {
    const t = [
      "اضغط بقماش نظيف.",
      "— ما تقوله الطب القديم في جرح مثل هذا:",
      "تنظيف الماء — ✅ مثبتة — WHO.",
      "الكركم — استخدم كريمًا يحتوي الكركم يوميًا — (أدلة واعدة).",
    ].join("\n");
    const g = check(t).results.find((x) => x.id === "herbal-substance");
    assert.ok(g.pass, g.reason);
  });

  test("★ رد بلا كتلة طب قديم لا يخضع لهذه البوابة", () => {
    const g = check("اضغط بقماش نظيف ٥ دقائق.").results.find((x) => x.id === "herbal-substance");
    assert.ok(g.pass, "الردود خارج كتلة الطب القديم يجب ألا تُعاقب");
  });

  test("★ المادة الممنوعة لا تُحسب طبًا قديمًا مقبولًا", () => {
    const t = [
      "— ما يقوله الطب القديم في جرح مثل هذا:",
      "زيت الكافور — ❌ غير موصى بها.",
    ].join("\n");
    const g = check(t).results.find((x) => x.id === "herbal-substance");
    assert.strictEqual(g.pass, false, "مادة ممنوعة لا تفي بالشرط");
  });

  /* ───── ★ حاجز الأمان الصلب ───── */
  /* هذا الخط الدفاعي وُجد بسبب فشل حقيقي: رد طارئ بلا «طبيب» في أوله
     كان يُسلّم للمستخدم. لا يجوز أن يمرّ مرة أخرى. */

  test("★ رد طارئ بلا توجيه طبي ليس آمنًا للتسليم", () => {
    const r = check("ضع ضمادة على الجرح وراقبه.", { danger });
    assert.strictEqual(r.safeToDeliver, false, "رد غير آمن مرّ كآمن!");
    assert.ok(r.criticalFailures.length > 0, "لا توجد بوابات حرجة مسجّلة");
    assert.strictEqual(r.criticalFailures[0].id, "danger-first");
  });

  test("★ البوابة الحرجة معلّمة في التقرير", () => {
    const r = check("نظّف الجرح.", { danger: [] });
    const g = r.results.find((x) => x.id === "danger-first");
    assert.strictEqual(g.critical, true, "بوابة الخطورة ليست حرجة");
  });

  test("★ رد آمن في الطوارئ يُقبل", () => {
    const r = check(
      "اطلب إسعافًا الآن أو اذهب للطبيب.\nاضغط بقماش نظيف بثبات.",
      { danger }
    );
    assert.strictEqual(r.safeToDeliver, true, JSON.stringify(r.criticalFailures));
  });

  test("★ الرد الإسعافي الآمن يمرّ من كل بواباته الحرجة", () => {
    // هذا النص هو ما يضعه الخادم بدلًا من رد الكاتب الفاشل.
    const safe = [
      "اطلب إسعافًا الآن أو اذهب للطبيب — هذه الحالة تحتاج رعاية فورية.",
      "اضغط بقماش نظيف على الجرح بثبات، وأضف طبقات فوق الطبقة الأولى المبللة دون إزالتها.",
      "لا تضع أي مادة أو عشب على الجرح.",
      "— إصابات مثل هذه (إصابة انفجار، نزيف شديد) لا تُعالج في المنزل.",
    ].join("\n");
    const r = check(safe, { danger });
    assert.strictEqual(r.safeToDeliver, true, JSON.stringify(r.criticalFailures));
    const df = r.results.find((x) => x.id === "danger-first");
    assert.ok(df.pass, df.reason);
  });

  test("★ لا حالة خطر = البوابة الحرجة تمرّ تلقائيًا", () => {
    const r = check("نظّف الجرح بماء نظيف.", { danger: [] });
    assert.strictEqual(r.safeToDeliver, true);
  });

  test("★ طوارئ مع عشب داخل أول ٢٠٠ حرف = غير آمن", () => {
    const r = check("اطلب إسعافًا. ضع العسل على الجرح لتخفيف الألم.", { danger });
    assert.strictEqual(r.safeToDeliver, false);
  });

  test("★ النهي عن العشب في الطوارئ آمن (لا يُحسب اقتراحًا)", () => {
    const r = check("اطلب إسعافًا الآن.\nلا تضع أي مادة أو عشب على الجرح.", { danger });
    const df = r.results.find((x) => x.id === "danger-first");
    assert.ok(df.pass, "النهي الصحيح رُفض كأنه اقتراح: " + df.reason);
  });

  test("★ اقتراح مادة ممنوعة بالاسم في الطوارئ يُرفض", () => {
    const r = check("اطلب إسعافًا. استخدم زيت الكافور على الجرح.", { danger });
    assert.strictEqual(r.safeToDeliver, false);
  });

  test("التقرير يعطي عدد البوابات الناجحة والفاشلة", () => {
    const r = check("هل هذا جرح؟");
    assert.strictEqual(r.passed + r.failed, GATES.length);
    assert.ok(r.firstFailureReason.length > 0);
  });

  test("خطأ داخلي في بوابة لا يُسقط التقرير", () => {
    // لا بوابة تُرمى في الظروف العادية، لكن نتحقق من الصمود عبر كائن ناقص
    const r = runChecklist({ text: null, kb: KB });
    assert.ok(r.results.length === GATES.length);
  });
};
