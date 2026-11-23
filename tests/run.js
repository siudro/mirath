/* tests/run.js — مشغّل بسيط بلا اعتماديات خارجية.
   التشغيل: node tests/run.js
   يجمع كل ملفات الاختبار في tests/ ويشغّلها، ويفشل loudly. */

"use strict";

const fs = require("fs");
const path = require("path");

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

if (!files.length) {
  console.error("لا ملفات اختبار.");
  process.exit(1);
}

const results = [];
let totalPass = 0;
let totalFail = 0;

for (const file of files) {
  const suite = require(path.join(__dirname, file));
  const out = [];
  let pass = 0;
  let fail = 0;

  const run = (name, fn) => {
    try {
      fn();
      out.push({ name, ok: true });
      pass++;
    } catch (e) {
      out.push({ name, ok: false, error: e.message });
      fail++;
    }
  };

  try {
    suite({ test: run });
  } catch (e) {
    out.push({ name: `تحميل ${file}`, ok: false, error: e.message });
    fail++;
  }

  results.push({ file, out, pass, fail });
  totalPass += pass;
  totalFail += fail;
}

const C = {
  g: "\x1b[32m", r: "\x1b[31m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m", y: "\x1b[33m",
};

let lastFile = null;
for (const r of results) {
  if (lastFile !== r.file) {
    console.log(`\n${C.b}── ${r.file} ──${C.x}`);
    lastFile = r.file;
  }
  for (const t of r.out) {
    if (t.ok) console.log(`  ${C.g}✓${C.x} ${t.name}`);
    else console.log(`  ${C.r}✗${C.x} ${t.name}\n    ${C.d}${t.error}${C.x}`);
  }
}

console.log(`\n${"═".repeat(56)}`);
console.log(`  نجح: ${totalPass}   فشل: ${totalFail}`);
console.log("═".repeat(56) + "\n");

process.exit(totalFail ? 1 : 0);
