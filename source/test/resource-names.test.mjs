/* node --test source/test  —  checks the content-stream reader used to trim page resources */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("../src/core.js", import.meta.url), "utf8");
const pick = re => { const m = core.match(re); assert.ok(m, `not found in core.js: ${re}`); return m[0]; };
const resourceNames = new Function(`${pick(/^const RES_OPS = .*$/m)}\n${pick(/^function resourceNames\([\s\S]*?^\}$/m)}\nreturn resourceNames;`)();

const bytes = s => Uint8Array.from(s, c => c.charCodeAt(0));
const names = s => { const out = []; resourceNames(typeof s === "string" ? bytes(s) : s, (cat, nm) => out.push(`${cat}:${nm}`)); return out; };
const timed = (s, ms) => { const b = bytes(s), t = performance.now(); try { names(b); } catch {} const took = performance.now() - t; assert.ok(took < ms, `took ${took.toFixed(1)} ms`); };

test("finds names around an inline image", () => {
  assert.deepEqual(names("q /Im1 Do BI /W 2 /H 1 /CS /CS0 /BPC 8 /L 6 ID \x00EI\x00\xff\xff EI Q /F1 12 Tf /GS1 gs"),
    ["XObject:Im1", "ColorSpace:CS0", "Font:F1", "ExtGState:GS1"]);
});

test("a long string after the real EI does not make the reader skip to a later EI", () => {
  assert.deepEqual(names(`/Im1 Do BI /L 1 ID x EI (${"a".repeat(5000)}) Tj /F1 9 Tf BI /L 1 ID y EI /GS1 gs`), ["XObject:Im1", "Font:F1", "ExtGState:GS1"]);
  assert.deepEqual(names(`BI ID \xff\nEI (${"a".repeat(5000)}) Tj /F1 9 Tf BI ID y EI`), ["Font:F1"]);
});

test("a negative inline image length cannot move the reader backwards", () => {
  timed(" EI BI /L -16 ID x EI ", 50);
  timed("% EI\n/Im1 Do BI /L -100000 ID x EI /F1 9 Tf", 50);
  assert.deepEqual(names("/Im1 Do BI /L -16 ID x EI /F1 9 Tf"), ["XObject:Im1", "Font:F1"]);
});

test("a non-integer or huge inline image length is ignored or clamped", () => {
  assert.deepEqual(names("BI /L 2.5 ID x EI /F1 9 Tf"), ["Font:F1"]);
  timed("BI /L 99999999999 ID x EI /F1 9 Tf", 50);
});

test("many candidate EIs followed by an unclosed string take linear time", () => {
  const body = "\nEI (".repeat(80000);
  timed(body, 200);
  timed("BI ID " + body, 200);
  timed("BI /L 0 ID " + body + ")".repeat(80000), 200);
  assert.throws(() => names("BI ID " + body));
});
