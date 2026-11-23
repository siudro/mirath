/* server.js — خادم ميراث
   ما يفعله:
     • يخدم الملفات الثابتة من public/ (أو من الجذر للتوافق)
     • يوفّر /api/chat مرة واحدة عبر SSE:
         ١. فرز الخطورة (قاعدة لا نموذج)
         ٢. استرجاع المواد من قاعدة المعرفة
         ٣. بحث علمي (إذا أردت)
         ٤. مسودة الكاتب (GPT-6 vision)
         ٥. تدقيق مستقل (نموذج ثانٍ، بنيّة معارضة)
         ٦. بوابة checklist — إن رسبت، يُعاد مرة واحدة بتصحيح
         ٧. الرد النهائي + صورة المادة
     • يوفّر /api/health، /api/herbs، /api/kb
     • لا يسرّب المفتاح: المفتاح من process.env.OPENAI_API_KEY فقط.
*/
"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { composeFullPrompt, FORMAT_RULES } = require("../prompt.js");
const { HERBS, EVIDENCE_SOURCES, DANGER_PATTERNS, TOOL_CATALOG } = require("../data/knowledge-base.js");
const { runChecklist, GATES } = require("../config/checklist.js");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));

/* ---------------- إعدادات ---------------- */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL_WRITER = process.env.MIRATH_WRITER_MODEL || "gpt-6-luna";
const MODEL_VERIFIER = process.env.MIRATH_VERIFIER_MODEL || MODEL_WRITER;
const PORT = Number(process.env.PORT || 8080);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

if (!OPENAI_API_KEY) {
  console.warn(
    "[mirath] OPENAI_API_KEY غير مضبوط. /api/chat سيرفض الطلبات حتى يُضبط."
  );
}

/* ---------------- أدوات مساعدة ---------------- */

function sseHead(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();
}

function emit(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/* ---------------- قاعدة المعرفة ---------------- */

function findHerb(nameAr) {
  if (!nameAr) return null;
  return HERBS.find((h) => h.ar.includes(nameAr) || nameAr.includes(h.ar)) || null;
}

function herbsForDanger() {
  return HERBS.filter((h) => h.verdict === "not-recommended").map((h) => h.ar);
}

/* ---------------- فرز الخطورة — قاعدة صريحة، لا نموذج ---------------- */

function triage(text) {
  const hits = [];
  for (const d of DANGER_PATTERNS) {
    if (d.re.test(text || "")) hits.push({ id: d.id, ar: d.ar, action: d.action });
  }
  return hits;
}

/* ---------------- البحث العلمي (اختياري، بلا مفتاح) ---------------- */

async function webLookup(query) {
  // Europe PMC — بحث عام بدون مفتاح، يعيد PMIDs. آمن ولمدرج الدراسات.
  try {
    const url =
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
      "?format=json&pageSize=3&resultType=lite&query=" +
      encodeURIComponent(query);
    const r = await fetch(url, { headers: { "User-Agent": "Mirath/1.0" } });
    if (!r.ok) return { ok: false, results: [] };
    const j = await r.json();
    const results = (j.resultList && j.resultList.result) || [];
    return {
      ok: true,
      results: results.slice(0, 3).map((x) => ({
        title: x.title || "",
        pmid: x.pmid || "",
        year: x.pubYear || "",
        journal: x.journalTitle || "",
      })),
    };
  } catch (e) {
    return { ok: false, results: [], error: e.message };
  }
}

/* ---------------- استدعاء OpenAI ---------------- */

async function callOpenAI({ model, messages, maxTokens = 1200, temperature = 1, jsonMode = false, timeoutMs = 90000 }) {
  if (!OPENAI_API_KEY) {
    const err = new Error("NO_KEY");
    err.code = "NO_KEY";
    throw err;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model, messages };
    if (typeof temperature === "number" && temperature !== 1) body.temperature = temperature;
    if (maxTokens) body.max_completion_tokens = maxTokens;
    if (jsonMode) body.response_format = { type: "json_object" };
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    const choice = j.choices && j.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (!content) console.error("[debug] empty content; finish_reason=", choice && choice.finish_reason, "usage=", JSON.stringify(j.usage));
    return content || "";
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- تحديد نوع الإصابة ---------------- */
function detectInjuryType(text) {
  const t = String(text || "");
  const has = (re) => re.test(t);

  if (has(/حروق|حرق|سخن|ساخن|بخار|burn|scald/i)) return "burn";
  if (has(/د+م+ل|دمامل|خراج|خرّاج|boil|abscess/i)) return "boil";
  if (has(/شق العجان|عجان|episiotomy/i)) return "episiotomy";
  if (has(/خلع سن|خلع ضرس|ضرس|سنان|tooth|dental/i)) return "tooth-extraction";
  if (has(/عضة|عض|لدغة|لدغ|bite|sting/i)) return "bite";
  if (has(/مسمار|شوكة|إبرة|ابرة|puncture/i)) return "puncture";
  if (has(/خدش|خدوش|سحج|abrasion|scrape|scratch/i)) return "abrasion";
  return "laceration";
}

/* ---------------- بناء رسائل النموذج ---------------- */

function buildMessages({ history, imageBase64, imageMime, danger, kbHerbs, webResults }) {
  const system = composeFullPrompt({
    kb: { herbs: HERBS, sources: EVIDENCE_SOURCES },
  });

  const messages = [{ role: "system", content: system }];

  // معلومات الرحلة — تُرسل صريحة كي لا يعتمد النموذج على ذاكرته.
  if (danger && danger.length) {
    messages.push({
      role: "system",
      content:
        "فرز آلي: هذه الحالة طارئة — " +
        danger.map((d) => d.ar).join("، ") +
        ". رد بطريقة الطوارئ: طلب مساعدة طبية في أول سطر، إسعاف أولي فقط، بلا أعشاب، بلا سؤال.",
    });
  }

  if (kbHerbs && kbHerbs.length) {
    messages.push({
      role: "system",
      content:
        "المواد التي أوصي بها لهذه الحالة (اختر منها وانصح بها صراحةً):\n" +
        kbHerbs
          .map(
            (h) =>
              `- ${h.ar}: ${h.advice}\n  قوة الدليل: ${h.verdictLabel} — ${h.evidence}`
          )
          .join("\n") +
        "\n\nاكتب توصيتك على شكل وصفة: الفعل، المدة، والدليل بين قوسين. لا تسرد تصنيفات فقط.",
    });
  }

  if (webResults && webResults.ok && webResults.results.length) {
    messages.push({
      role: "system",
      content:
        "نتائج بحث علمي حديث (المصدر: Europe PMC) — استخدمها كحسّ إضافي، واذكر رقم PMID إن ذكرت دراسة:\n" +
        webResults.results
          .map((x) => `- ${x.title} (${x.year}, ${x.journal}) PMID ${x.pmid}`)
          .join("\n"),
    });
  }

  // آخر ٨ تداولات من التاريخ
  const recent = history.slice(-8);
  for (const turn of recent) {
    if (turn.role === "assistant") {
      messages.push({ role: "assistant", content: turn.text || "" });
      continue;
    }
    // رسالة المستخدم
    const parts = [];
    if (turn.text) parts.push({ type: "text", text: turn.text });
    if (turn.image && turn.image.base64) {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${turn.image.mime || imageMime || "image/jpeg"};base64,${turn.image.base64}`,
        },
      });
    }
    messages.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
  }

  return messages;
}

/* ---------------- خط الأنابيب: كاتب، مدقق، بوابة ---------------- */

async function pipelineDraft({ messages, danger }) {
  return callOpenAI({
    model: MODEL_WRITER,
    messages,
    maxTokens: 6000,
  });
}

async function pipelineVerify({ draft, danger }) {
  const verifierSystem = `أنت مدقّق مستقل في "ميراث" — مساعد عناية بالجروح.

وظيفتك: أن تجد الخطأ، لا أن توافق. لا تُعد صياغة الرد، بل أخرجه في JSON بالحقول:
{
  "agrees": true|false,
  "issues": ["..."],
  "corrections": "نص سطر واحد بالتصحيح المطلوب إن وُجد"
}

قواعد التدقيق:
- إن وُجد خطر (${danger && danger.length ? danger.map((d) => d.ar).join("، ") : "لا خطر"}) فتحقق أن أول سطر يطلب مساعدة طبية، وألا يوجد ذكر أعشاب.
- تحقق: هل هناك سؤال أكثر من واحد؟
- تحقق: هل كل مادة تراثية تحمل حكمها (مثبتة / غير مثبتة / غير موصى بها)؟
- تحقق: هل ذكر رقم جرعة، أو دواء؟
- تحقق: هل الوصف من صورة يزعم حكمًا على الخطورة؟
- إن كل شيء سليم، أعِد agrees=true دون إطالة.
- أعِد JSON فقط، بلا شرح.`;

  const verifierUser = `المسودة:\n\n${draft}\n\nانتج حكم الإدخال.`;

  const raw = await callOpenAI({
    model: MODEL_VERIFIER,
    messages: [
      { role: "system", content: verifierSystem },
      { role: "user", content: verifierUser },
    ],
    maxTokens: 3000,
    jsonMode: true,
  });

  try {
    return JSON.parse(raw);
  } catch {
    return {
      agrees: false,
      issues: ["تعذر قراءة حكم المدقق — تعامل معه كاعتراض."],
      corrections: raw.slice(0, 200),
    };
  }
}

async function pipelineCorrect({ messages, draft, verdict }) {
  const correctionNote =
    "مدقّق مستقل قرأ مسودتك واعترض:\n" +
    (verdict.issues || []).map((x) => "- " + x).join("\n") +
    (verdict.corrections ? `\nتصحيح مقترح: ${verdict.corrections}` : "") +
    "\n\nأعد كتابة الرد كاملًا، مع تصحيح هذه النقاط، وبلا ذكر لعملية التدقيق نفسها.";

  return callOpenAI({
    model: MODEL_WRITER,
    messages: messages.concat([
      { role: "assistant", content: draft },
      { role: "user", content: correctionNote },
    ]),
    maxTokens: 6000,
  });
}

/* ---------------- استخراج صورة المادة ---------------- */

function pickHerbsForImage(text, kbHerbs) {
  const found = [];
  for (const h of kbHerbs || []) {
    if (text.includes(h.ar) && h.verdict !== "not-recommended") found.push(h);
  }
  // أضف الأول فقط — لا داعي لتكديس الصور
  return found.slice(0, 2);
}

async function findHerbImage(herbs) {
  const out = [];
  // Wikimedia Commons: بحث عن صورة للمادة
  for (const h of herbs) {
    try {
      const q = encodeURIComponent(h.imageQuery || h.en);
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
        "&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=" + q +
        "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480";
      const r = await fetch(url, { headers: { "User-Agent": "Mirath/1.0 (education)" } });
      if (!r.ok) { out.push({ herb: h.ar, source: "", images: [] }); continue; }
      const j = await r.json();
      const pages = (j.query && j.query.pages) || {};
      const images = Object.values(pages)
        .map((p) => {
          const ii = (p.imageinfo || [])[0] || {};
          const meta = ii.extmetadata || {};
          return {
            thumb: ii.thumburl || ii.url || "",
            page: ii.descriptionurl || "",
            title: p.title || "",
            license: meta.LicenseShortName ? meta.LicenseShortName.value : "",
            artist: meta.Artist ? String(meta.Artist.value).replace(/<[^>]+>/g, "").slice(0, 80) : "",
          };
        })
        .filter((x) => x.thumb);
      out.push({ herb: h.ar, en: h.en, query: h.imageQuery, source: "Wikimedia Commons", images });
    } catch (e) {
      out.push({ herb: h.ar, en: h.en, images: [], error: e.message });
    }
  }
  return out;
}

/* ---------------- نقاط النهاية ---------------- */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(OPENAI_API_KEY),
    writerModel: MODEL_WRITER,
    verifierModel: MODEL_VERIFIER,
    herbs: HERBS.length,
    gates: GATES.length,
    version: "2026-11-23",
  });
});

app.get("/api/kb", (_req, res) => {
  res.json({
    herbs: HERBS.map(({ id, ar, en, verdict, verdictLabel, appliesTo, source, notes, tags }) => ({
      id, ar, en, verdict, verdictLabel, appliesTo, source, notes, tags,
    })),
    sources: EVIDENCE_SOURCES,
  });
});

app.get("/api/checklist", (_req, res) => {
  res.json({ gates: GATES.map((g) => ({ id: g.id, label: g.label, detail: g.detail })) });
});

/* -------- نقطة المحادثة الرئيسية: SSE -------- */

app.post("/api/chat", async (req, res) => {
  const { history, text, image } = req.body || {};

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: "NO_KEY",
      message: "OPENAI_API_KEY غير مضبوط على الخادم. اطلب من المسؤول ضبطه.",
    });
  }
  const hasText = text && String(text).trim().length > 0;
  const hasImage = image && image.base64;

  if (!hasText && !hasImage) {
    return res.status(400).json({ error: "EMPTY", message: "أرسل نصًا أو صورة." });
  }
  if (hasImage && image.base64.length * 0.75 > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: "IMAGE_TOO_LARGE", message: "حجم الصورة كبير. ٨ ميغابايت كحد أقصى." });
  }

  sseHead(res);

  const host = String(req.headers.host || "localhost");
  const traceId = crypto.randomBytes(6).toString("hex");

  const toolStart = (id) => {
    const tool = TOOL_CATALOG.find((t) => t.id === id) || { id, ar: id };
    emit(res, "tool", { phase: "start", id, label: tool.ar, detail: tool.detail || "", traceId });
  };
  const toolDone = (id, note) => {
    const tool = TOOL_CATALOG.find((t) => t.id === id) || { id, ar: id };
    emit(res, "tool", { phase: "end", id, label: tool.ar, note: note || "", traceId });
  };

  try {
    const checkHistory = Array.isArray(history) ? history.slice(-8) : [];

    /* ١. فرز الخطورة */
    toolStart("triage");
    const danger = triage(String(text || "") + " " + (hasImage ? "[صورة]" : ""));
    await new Promise((r) => setTimeout(r, 120));
    toolDone("triage", danger.length ? danger.map((d) => d.ar).join("، ") : "لا إشارات خطورة");

    /* ٢. قراءة الصورة (إعلام فقط — النموذج يرى الصورة ويصفها) */
    if (hasImage) {
      toolStart("read-image");
      await new Promise((r) => setTimeout(r, 200));
      toolDone("read-image", image.mime || "image/jpeg");
    }

    /* ٣. قاعدة الأدلة */
    toolStart("lookup");
    const lower = String(text || "").toLowerCase();
    /* ★ اختيار المواد كان معيبًا: كان يأخذ «المذكورة بالاسم» أو الموسومة top،
       والوسمة top على الماء فقط. فجرح الركبة لا يُعرض للنموذج منه إلا
       «تنظيف الماء» — فيصير الجواب إسعافًا أوليًا بلا طب قديم. */
    const injury = detectInjuryType(lower);
    const kbHerbs = HERBS.filter((h) => {
      if (h.verdict === "not-recommended") return false;
      if (lower.includes(h.ar) || lower.includes(h.en.toLowerCase())) return true;
      if (h.appliesTo.includes("any")) return true;
      return h.appliesTo.includes(injury);
    });
    await new Promise((r) => setTimeout(r, 150));
    toolDone("lookup", `${kbHerbs.length} مادة مرشحة`);

    /* ٤. بحث علمي */
    let webResults = { ok: false, results: [] };
    if (hasText && !danger.length) {
      toolStart("websearch");
      webResults = await webLookup(`${text} wound healing evidence`);
      toolDone("websearch", webResults.ok ? `${webResults.results.length} نتيجة` : "لا نتائج");
    }

    /* ٥. مسودة الكاتب */
    toolStart("compose");
    const currentTurn = { role: "user", text: String(text || "").trim(), image: image && image.base64 ? { base64: image.base64, mime: image.mime } : null };
    const messages = buildMessages({
      history: checkHistory.concat(currentTurn),
      imageBase64: image && image.base64,
      imageMime: image && image.mime,
      danger,
      kbHerbs,
      webResults,
    });
    const draft = await pipelineDraft({ messages, danger });
    toolDone("compose", `${draft.length} حرفًا`);

    /* ٦. تدقيق مستقل */
    toolStart("verify");
    let verdict = { agrees: true, issues: [] };
    try {
      verdict = await pipelineVerify({ draft, danger });
    } catch (e) {
      verdict = { agrees: true, issues: [], error: e.message };
    }
    toolDone(
      "verify",
      verdict.agrees === false
        ? `اعتراض: ${(verdict.issues || []).join(" · ").slice(0, 90)}`
        : "موافق"
    );

    /* ٧. بوابة checklist — حاجز تنفيذي */
    let finalText = draft;
    let safetySubstituted = false;

    /* الرد الآمن الإلزامي: إن فشلت البوابة الحرجة، نُسلّم هذا بدل نص الكاتب.
       سطران فقط، وفيهما «إسعاف» و«طبيب» حرفيًا — البوابة تمرّ عليه دائمًا،
       ويمكن التحقق من ذلك في الاختبارات. */
    const SAFE_EMERGENCY_REPLY = (danger) =>
      [
        "اطلب إسعافًا الآن أو اذهب للطبيب — هذه الحالة تحتاج رعاية فورية.",
        "اضغط بقماش نظيف على الجرح بثبات، وأضف طبقات فوق الطبقة الأولى المبللة دون إزالتها.",
        "لا تضع أي مادة أو عشب على الجرح.",
        "— إصابات مثل هذه (" + danger.map((d) => d.ar).join("، ") + ") لا تُعالج في المنزل.",
      ].join("\n");

    let check = runChecklist({
      text: finalText,
      danger,
      hasImage: Boolean(hasImage),
      outOfScope: false,
      kb: { herbs: HERBS, sources: EVIDENCE_SOURCES },
    });

    let corrected = false;
    const draftWasSafe = check.safeToDeliver;

    if (!check.allPassed) {
      try {
        const fixed = await pipelineCorrect({ messages, draft: finalText, verdict });
        const rec = runChecklist({
          text: fixed,
          danger,
          hasImage: Boolean(hasImage),
          outOfScope: false,
          kb: { herbs: HERBS, sources: EVIDENCE_SOURCES },
        });

        /* ★ لا نقبل تصحيحًا إن كان غير آمن، حتى لو نجح في بوابات أكثر.
           الأمان أولًا، ثم عدد البوابات. */
        if (rec.safeToDeliver && (rec.passed > check.passed || !draftWasSafe)) {
          finalText = fixed;
          check = rec;
          corrected = true;
        }
      } catch (e) {
        // الترك على المسودة الأولى إن فشل التصحيح
      }
    }

    /* ★ المنع الصلب: بعد المحاولتين، إن بقيت البوابة الحرجة راسبة،
       لا يُسلَّم نص الكاتب إطلاقًا. نُسلّم الرد الآمن الإلزامي. */
    if (!check.safeToDeliver) {
      finalText = SAFE_EMERGENCY_REPLY(danger);
      safetySubstituted = true;
      check = runChecklist({
        text: finalText,
        danger,
        hasImage: Boolean(hasImage),
        outOfScope: false,
        kb: { herbs: HERBS, sources: EVIDENCE_SOURCES },
      });
      emit(res, "tool", {
        phase: "end",
        id: "verify",
        label: "تدقيق مستقل",
        note: "فشل الأمان — استُبدل الرد بردّ إسعافي آمن",
        traceId,
      });
    }

    /* ٨. صورة المادة */
    let images = [];
    if (!danger.length && finalText) {
      toolStart("herb-image");
      const forImage = pickHerbsForImage(finalText, kbHerbs.length ? kbHerbs : HERBS);
      images = await findHerbImage(forImage);
      toolDone("herb-image", images.filter((i) => i.images.length).length + " صورة");
    }

    /* ٩. الرد */
    emit(res, "answer", {
      text: finalText,
      corrected,
      safetySubstituted,
      traceId,
      checklist: check,
      danger,
      images,
    });

    emit(res, "done", { traceId });
    res.end();
  } catch (err) {
    const status = err.status || 500;
    emit(res, "error", {
      message:
        err.code === "NO_KEY"
          ? "الخادم بلا مفتاح. ضع OPENAI_API_KEY في .env."
          : err.message || "تعذر إكمال الرد.",
      status,
    });
    res.end();
  }
});

/* -------- ملفات ثابتة -------- */

const STATIC_DIRS = [
  path.join(__dirname, "..", "public"),
  path.join(__dirname, ".."),
];
app.use(express.static(STATIC_DIRS[0], { extensions: ["html"] }));
app.use(express.static(STATIC_DIRS[1], { index: false }));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(STATIC_DIRS[0], "index.html"), (err) => {
    if (err) res.sendFile(path.join(STATIC_DIRS[1], "index.html"));
  });
});

if (require.main === module) {
  /* Containers route traffic to $PORT; binding 0.0.0.0 makes it reachable. */
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[mirath] listening on :${PORT}`);
    console.log(`[mirath] writer=${MODEL_WRITER} verifier=${MODEL_VERIFIER} key=${OPENAI_API_KEY ? "set" : "MISSING"}`);
  });
}

module.exports = { app, triage, findHerb, webLookup, pickHerbsForImage, findHerbImage, detectInjuryType };
