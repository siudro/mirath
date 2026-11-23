/* tests/knowledge-base.test.js — تحقق من قاعدة الأدلة.
   يفشل إن أُضيفت مادة بلا حكم أو مصدر، أو إن تغيّر حكم قد ثبت بدليله. */

"use strict";

const assert = require("assert");
const {
  HERBS,
  EVIDENCE_SOURCES,
  DANGER_PATTERNS,
  TOOL_CATALOG,
  MIRATH_KB_VERSION,
} = require("../data/knowledge-base.js");

const VERDICTS = ["verified", "unverified", "not-recommended"];

module.exports = ({ test }) => {
  test("قاعدة المعرفة غير فارغة", () => {
    assert.ok(Array.isArray(HERBS) && HERBS.length >= 10, `وجدنا ${HERBS.length}`);
  });

  test("كل مادة لها معرّف فريد", () => {
    const ids = HERBS.map((h) => h.id);
    assert.strictEqual(new Set(ids).size, ids.length, "معرّف مكرر");
  });

  test("كل مادة لها حكم من الثلاثة", () => {
    for (const h of HERBS) {
      assert.ok(VERDICTS.includes(h.verdict), `${h.id}: حكم غير معروف "${h.verdict}"`);
      assert.ok(h.verdictLabel && h.verdictLabel.length > 3, `${h.id}: بلا label`);
    }
  });

  test("كل مادة لها مصدر مكتوب", () => {
    for (const h of HERBS) {
      assert.ok(h.source && h.source.trim().length > 4, `${h.id}: بلا مصدر`);
    }
  });

  test("كل مادة لها دليل نصي", () => {
    for (const h of HERBS) {
      assert.ok(h.evidence && h.evidence.length > 20, `${h.id}: دليل قصير جدًا`);
    }
  });

  test("كل مادة غير مثبتة أو موصى بها لها قيود مكتوبة", () => {
    for (const h of HERBS) {
      if (h.verdict === "verified") continue;
      assert.ok(h.notes && h.notes.length > 5, `${h.id}: بلا قيود`);
    }
  });

  test("المواد الممنوعة لا تنطبق على أي إصابة", () => {
    for (const h of HERBS.filter((x) => x.verdict === "not-recommended")) {
      assert.strictEqual(h.appliesTo.length, 0, `${h.id} يجب أن لا تنطبق على شيء`);
    }
  });

  test("تنظيف الماء مثبت", () => {
    const w = HERBS.find((h) => h.id === "clean-water");
    assert.ok(w, "تنظيف الماء مفقود");
    assert.strictEqual(w.verdict, "verified");
  });

  test("زيت الكافور ممنوع", () => {
    const e = HERBS.find((h) => h.id === "eucalyptus-oil");
    assert.ok(e);
    assert.strictEqual(e.verdict, "not-recommended");
    assert.ok(/DO NOT APPLY/i.test(e.evidence), "يجب أن يحمل التحذير الحرفي");
  });

  test("العفص وقشر الرمان مادتان منفصلتان", () => {
    const oak = HERBS.find((h) => h.id === "oak-gall");
    const pom = HERBS.find((h) => h.id === "pomegranate-peel");
    assert.ok(oak && pom, "إحدى المادتين مفقودة");
    assert.notStrictEqual(oak.id, pom.id);
    assert.notStrictEqual(oak.evidence, pom.evidence, "لا يجوز نقل دليل إحداهما للأخرى");
  });

  test("المرّة تحمل قيود النطاق الضيق", () => {
    const m = HERBS.find((h) => h.id === "myrrh");
    assert.ok(m);
    assert.ok(m.ageLimit === "adults-only", "يجب أن تُقيَّد للبالغين");
    assert.ok(/لا تعميم|محدد/.test(m.notes), "يجب أن تنبّه لعدم التعميم");
  });

  test("العسل مقصور على الحروق", () => {
    const h = HERBS.find((x) => x.id === "honey");
    assert.deepStrictEqual(h.appliesTo, ["burn"], "العسل يجب أن يكون للحرق فقط");
  });

  test("أنماط الخطر تغطي الحالات الخمس الإلزامية", () => {
    const ids = DANGER_PATTERNS.map((d) => d.id);
    for (const required of ["blast", "severe-bleeding", "deep-wound", "loss-of-consciousness", "breathing"]) {
      assert.ok(ids.includes(required), `نمط مفقود: ${required}`);
    }
  });

  test("كل نمط خطر يطابق نصًا عربيًا حقيقيًا", () => {
    const samples = {
      blast: "عندي إصابة انفجار في الساق",
      "severe-bleeding": "نزيف شديد ولا يتوقف",
      "deep-wound": "جرح عميق في يدي",
      "loss-of-consciousness": "فقد الوعي بعد الجرح",
      breathing: "عنده صعوبة في التنفس",
      impaled: "شيء مغروس في الجرح",
    };
    for (const [id, text] of Object.entries(samples)) {
      const p = DANGER_PATTERNS.find((d) => d.id === id);
      assert.ok(p.re.test(text), `${id} لا يطابق "${text}"`);
    }
  });

  test("كل مصدر في القائمة مقروء وله رابط أو سبب مقبول", () => {
    for (const s of EVIDENCE_SOURCES) {
      assert.ok(s.ar && s.ar.length > 4, `${s.id}: بلا عنوان`);
      assert.ok(s.en && s.en.length > 4, `${s.id}: بلا عنوان إنجليزي`);
      // ابن سينا والرازي بلا رابط رقمي — وهذا صحيح
      if (!s.url) {
        assert.ok(/ابن سينا|الرازي/.test(s.ar), `${s.id}: لا رابط لغير مصدر تاريخي`);
      }
    }
  });

  test("كل مصدر مرتبط بمادة واحدة على الأقل (أو تاريخي)", () => {
    const herbIds = new Set(HERBS.map((h) => h.id));
    for (const s of EVIDENCE_SOURCES) {
      for (const c of s.covers) {
        assert.ok(herbIds.has(c), `${s.id} يشير لمادة غير موجودة: ${c}`);
      }
    }
  });

  test("كتالوج الأدوات يطابق أسماء الأدوات في الخادم", () => {
    const required = ["triage", "read-image", "lookup", "websearch", "verify", "herb-image", "compose"];
    const ids = TOOL_CATALOG.map((t) => t.id);
    for (const r of required) assert.ok(ids.includes(r), `أداة مفقودة: ${r}`);
  });

  test("إصدار القاعدة معلن", () => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(MIRATH_KB_VERSION), `إصدار غير صالح: ${MIRATH_KB_VERSION}`);
  });
};
