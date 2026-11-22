/*PROLOGUE*/
import * as pdfjsLib from "./vendor/pdf.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.js", import.meta.url).href;
const PDFJS_EXTRA = { wasmUrl: new URL("./vendor/wasm/", import.meta.url).href };
const embeddedLib = () => null;
const PUBLIC_BUILD = false;
/*END*/
/* Owner settings: the optional support link and the feature-request address (written in two parts to slow down address harvesters). */
const SITE = /*SITE*/{ kofi: "", mail: ["", ""], source: "" }/*ENDSITE*/;
const PL = window.PDFLib;
const { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFRawStream, PDFNumber, PDFRef, PDFNull,
  BlendMode, LineCapStyle, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = PL;

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? e.style.setProperty(sk, sv) : (e.style[sk] = sv); }
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== "list" && k !== "form") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
const ICON = {
  rotR: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", rotL: "M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7",
  copy: "M9 9h11v11H9zM5 15V6a2 2 0 0 1 2-2h9", trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  zoom: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.6-4.6", plus: "M12 5v14M5 12h14", minus: "M5 12h14",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  check: "m5 12.5 4.5 4.5L19 7.5", down: "M12 4v11M7 11l5 5 5-5M5 20h14", file: "M7 3h7l5 5v13H7zM14 3v5h5",
  rev: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3", x: "M6 6l12 12M18 6 6 18", prev: "m15 5-7 7 7 7", next: "m9 5 7 7-7 7",
  up: "m5 15 7-7 7 7", dn: "m5 9 7 7 7-7",
  merge: "M6 4v5l6 5v6M18 4v5l-6 5", split: "M12 4v6l-6 5v5M12 10l6 5v5",
  compress: "M4 9h16M4 15h16M12 2v7M9.5 6.5 12 9l2.5-2.5M12 22v-7M9.5 17.5 12 15l2.5 2.5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z", unlock: "M7 11V8a5 5 0 0 1 9.6-2M6 11h12v9H6z",
  pen: "M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3", text: "M5 6V4h14v2M12 4v16M9 20h6", crop: "M7 3v14h14M3 7h14v14",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z", hash: "M9 4 7 20M17 4l-2 16M4 9h16M3.500 15h16",
  eye: "M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 9.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4", table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14", slides: "M3 5h18v12H3zM12 17v4M8 21h8",
  form: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h4", layers: "M12 4 3 9l9 5 9-5zM3 14l9 5 9-5", bar: "M3 9h18v6H3z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", swap: "M4 8h14l-3-3M20 16H6l3 3",
  sign: "M3 17c3-6 5-9 7-9s0 8 2 8 3-5 5-5 2 4 4 4M3 21h18", scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8",
  cursor: "M6 4l11 8-5 1.200L10 19z", rect: "M4 6h16v12H4z", circle: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", mark: "M5 15l9-9 4 4-9 9H5zM4 21h16",
  white: "M5 8h14v8H5zM3 20h18", back: "M11 6l-6 6 6 6M5 12h14",
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n] || ICON.file}"/></svg>`;
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const baseName = n => n.replace(/\.[^.]+$/, "");
const extOf = n => (n.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
const sleep0 = () => new Promise(r => setTimeout(r));
function toast(msg, ms = 4500) {
  const t = h("div", { class: "toast" }, msg); $("toasts").append(t); setTimeout(() => t.remove(), ms);
}
const App = { route: "home", pending: null };

/* ---------- files ---------- */
function kindOf(f) {
  const e = extOf(f.name);
  if (f.type === "application/pdf" || e === "pdf") return "pdf";
  if (/^(png|jpe?g|webp|gif|bmp)$/.test(e) || (f.type || "").startsWith("image/")) return "image";
  return e || "other";
}
const readBytes = async f => new Uint8Array(await f.arrayBuffer());
function pdfError(e) {
  if (e?.code) return e;
  const enc = /encrypt/i.test(String(e?.message));
  const err = new Error(enc ? "This PDF is password-protected. Run it through Unlock PDF first." : "This PDF could not be read. It may be damaged.");
  err.code = enc ? "encrypted" : "broken"; return err;
}
/* The PDF library finds the end of a stream whose length is stored indirectly by scanning for "endstream", and when the data's own last byte
   is a carriage return it mistakes that byte for the line break and drops it. Once every object is loaded the true length is known, so put it back. */
function repairStreams(doc) {
  const ctx = doc.context, L = PDFName.of("Length");
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const lv = obj.dict.get(L); if (!(lv instanceof PDFRef)) continue;
    const n = ctx.lookup(lv);
    if (n instanceof PDFNumber && n.asNumber() - obj.contents.length === 1) { const u = new Uint8Array(obj.contents.length + 1); u.set(obj.contents); u[u.length - 1] = 13; ctx.assign(ref, PDFRawStream.of(obj.dict, u)); }
  }
  return doc;
}
async function loadDoc(bytes) { try { return repairStreams(await PDFDocument.load(bytes)); } catch (e) { throw pdfError(e); } }
async function openJs(bytes, password) {
  try { return await pdfjsLib.getDocument({ data: bytes.slice(), password, ...PDFJS_EXTRA }).promise; }
  catch (e) {
    if (e?.name === "PasswordException") { const err = new Error(password ? "That password is not correct." : "This PDF needs a password."); err.code = "password"; throw err; }
    throw new Error("This PDF could not be opened. It may be damaged.");
  }
}
async function renderPage(js, n, { scale, maxSide, rotation } = {}) {
  const pg = await js.getPage(n);
  const rot = rotation == null ? pg.rotate : (pg.rotate + rotation) % 360;
  const v1 = pg.getViewport({ scale: 1, rotation: rot });
  let s = scale ?? maxSide / Math.max(v1.width, v1.height);
  const px = v1.width * v1.height * s * s; if (px > 24e6) s *= Math.sqrt(24e6 / px);
  const vp = pg.getViewport({ scale: s, rotation: rot });
  const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  await pg.render({ canvas: cv, canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  return { cv, w: v1.width, h: v1.height, scale: s };
}
const canvasBlob = (cv, type = "image/png", q) => new Promise(r => cv.toBlob(r, type, q));
const canvasBytes = async (cv, type, q) => new Uint8Array(await (await canvasBlob(cv, type, q)).arrayBuffer());

function parseRanges(s, n) {
  s = (s || "").trim().toLowerCase();
  if (!s || s === "all") return [...Array(n).keys()];
  const out = [];
  for (const part of s.split(/[,;]+/).map(p => p.trim()).filter(Boolean)) {
    if (part === "odd" || part === "even") { for (let i = part === "odd" ? 0 : 1; i < n; i += 2) out.push(i); continue; }
    const m = part.match(/^(\d+|last)?\s*(-)?\s*(\d+|last)?$/);
    if (!m || (m[1] == null && m[3] == null)) throw new Error(`"${part}" is not a page or a range. Write pages like 1-3, 5, 8-.`);
    const val = v => v === "last" ? n : +v;
    const a = m[1] != null ? val(m[1]) : 1, b = m[2] ? (m[3] != null ? val(m[3]) : n) : a;
    for (const v of [a, b]) if (v < 1 || v > n) throw new Error(`Page ${v} does not exist. This file has ${n} page${n === 1 ? "" : "s"}.`);
    const step = a <= b ? 1 : -1; for (let i = a; i !== b + step; i += step) out.push(i - 1);
  }
  return out;
}

/* ---------- saving ---------- */
const toBlob = (data, type) => data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
async function saveFile(name, data) {
  const blob = toBlob(data);
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function saveErrorText(e) {
  return "The file could not be saved: " + (e?.message || "unknown error");
}
async function makeZip(files) {
  const z = new JSZip(), seen = new Set();
  for (const f of files) { let n = f.name, k = 1; while (seen.has(n)) n = baseName(f.name) + `-${++k}.` + extOf(f.name); seen.add(n); z.file(n, f.data); }
  return await z.generateAsync({ type: "blob" });
}
const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) loadedScripts.set(src, new Promise((res, rej) => {
    const s = h("script", { src: embeddedLib(src) || src }); s.onload = res; s.onerror = () => rej(new Error("A required component could not be loaded.")); document.head.append(s);
  }));
  return loadedScripts.get(src);
}

/* ---------- drawing in "view space": origin bottom-left of the page as displayed, whatever its rotation ---------- */
function viewInfo(page) {
  const b = page.getCropBox(), R = ((page.getRotation().angle % 360) + 360) % 360, odd = R % 180 !== 0;
  return { x0: b.x, y0: b.y, w: b.width, h: b.height, R, W: odd ? b.height : b.width, H: odd ? b.width : b.height };
}
function viewMatrix(v) {
  if (v.R === 90) return [0, 1, -1, 0, v.x0 + v.w, v.y0];
  if (v.R === 180) return [-1, 0, 0, -1, v.x0 + v.w, v.y0 + v.h];
  if (v.R === 270) return [0, -1, 1, 0, v.x0, v.y0 + v.h];
  return [1, 0, 0, 1, v.x0, v.y0];
}
const viewToPdf = (v, x, y) => { const [a, b, c, d, e, f] = viewMatrix(v); return [a * x + c * y + e, b * x + d * y + f]; };
async function inView(page, fn) {
  const v = viewInfo(page);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...viewMatrix(v)));
  try { await fn(v); } finally { page.pushOperators(popGraphicsState()); }
}
const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };

/* text: real text when the standard font can encode it, otherwise drawn by the browser and embedded as an image */
const cleanText = s => String(s ?? "").replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, "");
function canEncode(font, text) {
  const cs = font.__cs || (font.__cs = new Set(font.getCharacterSet()));
  for (const ch of text) if (!cs.has(ch.codePointAt(0))) return false;
  return true;
}
const measureCtx = document.createElement("canvas").getContext("2d");
const cssFont = (size, st = {}) => `${st.i ? "italic " : ""}${st.b ? "bold " : ""}${size}px ${st.m ? "Courier New, monospace" : "Helvetica, Arial, sans-serif"}`;
function textWidth(font, text, size, st) {
  if (canEncode(font, text)) return font.widthOfTextAtSize(text, size);
  measureCtx.font = cssFont(size, st); return measureCtx.measureText(text).width;
}
const RTL_RE = new RegExp("[" + String.fromCharCode(0x590) + "-" + String.fromCharCode(0x8ff) + String.fromCharCode(0xfb1d) + "-" + String.fromCharCode(0xfefc) + "]");
async function textImage(doc, text, size, color = "#000000", st = {}, rtl = false) {
  const k = 3, cv = document.createElement("canvas"); let c = cv.getContext("2d");
  c.font = cssFont(size * k, st); if (rtl) c.direction = "rtl"; const w = Math.ceil(c.measureText(text).width) + 4;
  cv.width = Math.max(2, w); cv.height = Math.ceil(size * k * 1.5); c = cv.getContext("2d");
  c.font = cssFont(size * k, st); c.fillStyle = color; c.textBaseline = "alphabetic";
  if (rtl) { c.direction = "rtl"; c.textAlign = "right"; c.fillText(text, cv.width - 2, size * k * 1.1); } else c.fillText(text, 0, size * k * 1.1);
  return { img: await doc.embedPng(await canvasBytes(cv)), w: cv.width / k, h: size * 1.5, base: size * 1.1 };
}
/* draws one line with its baseline at (x, y) in the current space */
async function drawTextSmart(page, doc, font, text, { x, y, size, color = "#000000", opacity = 1, st }) {
  text = cleanText(text); if (!text.trim()) return;
  if (canEncode(font, text)) return page.drawText(text, { x, y, size, font, color: hexRgb(color), opacity });
  const im = await textImage(doc, text, size, color, st);
  page.drawImage(im.img, { x, y: y - (im.h - im.base), width: im.w, height: im.h, opacity });
}

/* ---------- shared PDF builders ---------- */
async function imageToPdf(file, { page = "fit", margin = 0 } = {}) {
  const doc = await PDFDocument.create(); let img;
  const n = file.name.toLowerCase(), buf = await file.arrayBuffer();
  try {
    if (file.type === "image/jpeg" || /\.jpe?g$/.test(n)) img = await doc.embedJpg(buf);
    else if (file.type === "image/png" || n.endsWith(".png")) img = await doc.embedPng(buf);
  } catch { img = null; }
  if (!img) {
    let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name} is not an image this browser can read.`); }
    const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; cv.getContext("2d").drawImage(bmp, 0, 0);
    img = await doc.embedPng(await canvasBytes(cv));
  }
  let W, H;
  if (page === "fit") { const k = 842 / Math.max(img.width, img.height); W = img.width * k + 2 * margin; H = img.height * k + 2 * margin; }
  else { [W, H] = page === "letter" ? [612, 792] : [595.28, 841.89]; if (img.width > img.height) [W, H] = [H, W]; }
  const k = Math.min((W - 2 * margin) / img.width, (H - 2 * margin) / img.height), w = img.width * k, hh = img.height * k;
  doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - hh) / 2, width: w, height: hh });
  return await doc.save();
}
/* every page becomes one JPEG image; `paint(ctx, pageIndex, scale)` may draw on top before encoding */
async function rasterize(js, { dpi = 150, quality = 0.8, progress, paint } = {}) {
  const out = await PDFDocument.create();
  for (let i = 1; i <= js.numPages; i++) {
    progress?.(`Rendering page ${i} of ${js.numPages}…`);
    const { cv, w, h: ph, scale } = await renderPage(js, i, { scale: dpi / 72 });
    paint?.(cv.getContext("2d"), i - 1, scale);
    const img = await out.embedJpg(await canvasBytes(cv, "image/jpeg", quality));
    out.addPage([w, ph]).drawImage(img, { x: 0, y: 0, width: w, height: ph });
    cv.width = cv.height = 0;
  }
  return await out.save();
}
/* copyPages follows every reference on a kept page, so a link, an annotation /P or a form field that points at
   another page would pull in that page and, through its /Parent, the whole source tree with the removed pages.
   Point kept pages at their new copies and everything else page-shaped at null, then check nothing slipped in.
   A kept widget's /Parent also leads into the form-field tree, whose /Kids list fields on removed pages too: copy
   those fields with only the kids that lead to a widget on a kept page, and drop the value of a field that loses kids. */
async function copyPagesClean(out, doc, indices) {
  await doc.flush();
  const ctx = out.context, N = s => PDFName.of(s), pages = doc.getPages();
  const typeOf = o => { const t = o instanceof PDFDict && o.lookup(N("Type")); return t instanceof PDFName ? t.decodeText() : null; };
  const kept = new Map(indices.map(i => [pages[i].ref, null])), gone = new Set([doc.context.trailerInfo.Root]);
  for (const p of pages) {
    for (let n = p.node, r; (r = n.get(N("Parent"))) instanceof PDFRef && !gone.has(r); n = doc.context.lookup(r)) gone.add(r);
    if (!kept.has(p.ref)) { gone.add(p.ref); for (const a of p.node.Annots()?.asArray() ?? []) if (a instanceof PDFRef) gone.add(a); }
  }
  for (const [ref, o] of doc.context.enumerateIndirectObjects())
    if (!kept.has(ref) && (["Page", "Pages", "Catalog"].includes(typeOf(o)) || o instanceof PDFDict && gone.has(o.get(N("P"))))) gone.add(ref);
  const copier = PL.PDFObjectCopier.for(doc.context, ctx), nil = ctx.register(PL.PDFNull);
  for (const r of gone) copier.traversedObjects.set(r, nil);
  for (const r of kept.keys()) { const nr = ctx.nextRef(); kept.set(r, nr); copier.traversedObjects.set(r, nr); }
  const own = new Set(indices.flatMap(i => pages[i].node.Annots()?.asArray() ?? []).filter(a => a instanceof PDFRef && !gone.has(a)));
  const live = (r, done = new Set()) => {
    if (!(r instanceof PDFRef) || gone.has(r) || done.has(r)) return false; if (own.has(r)) return true; done.add(r);
    const k = doc.context.lookup(r)?.lookup?.(N("Kids")); return k instanceof PDFArray && k.asArray().some(x => live(x, done));
  };
  const fields = new Map(), field = r => { if (r instanceof PDFRef && !gone.has(r) && !fields.has(r)) { fields.set(r, null); return true; } };
  for (const a of own) for (let d = doc.context.lookup(a), p; d instanceof PDFDict && field(p = d.get(N("Parent"))); d = doc.context.lookup(p));
  for (const r of fields.keys()) {
    const d = doc.context.lookup(r), kids = d instanceof PDFDict && d.lookup(N("Kids"));
    if (!(kids instanceof PDFArray)) { fields.delete(r); continue; }
    const k = kids.asArray().filter(x => live(x)), c = d.clone(doc.context);
    for (const x of k) if (doc.context.lookup(x)?.lookup?.(N("Kids")) instanceof PDFArray) field(x);
    c.set(N("Kids"), doc.context.obj(k)); if (k.length < kids.size()) for (const x of ["V", "DV", "RV"]) c.delete(N(x));
    const nr = ctx.nextRef(); fields.set(r, [nr, c]); copier.traversedObjects.set(r, nr);
  }
  for (const [nr, c] of fields.values()) ctx.assign(nr, copier.copy(c));
  const dead = a => {
    const d = ctx.lookup(a); if (!(d instanceof PDFDict)) return true;
    if (d.lookup(N("Subtype")) !== N("Link")) return false;
    const act = d.lookup(N("A")), dest = d.lookup(N("Dest")) ?? (act instanceof PDFDict ? act.lookup(N("D")) : undefined);
    return dest instanceof PDFArray && dest.get(0) === nil;
  };
  const copies = [];
  for (const i of indices) {
    const src = pages[i], node = copier.copy(src.node);
    let ref = kept.get(src.ref); if (ctx.lookup(ref)) ref = ctx.nextRef();
    const annots = node.lookup(N("Annots"));
    if (annots instanceof PDFArray) { const live = annots.asArray().filter(a => !dead(a)); live.length ? node.set(N("Annots"), ctx.obj(live)) : node.delete(N("Annots")); }
    ctx.assign(ref, node); copies.push(PL.PDFPage.of(node, ref, out));
  }
  return copies;
}
async function subsetPdf(doc, indices) {
  const out = await PDFDocument.create();
  for (const p of await copyPagesClean(out, doc, indices)) out.addPage(p);
  if (!await trimToPages(out)) throw new Error("Could not separate the chosen pages from the rest of this PDF.");
  return await out.save();
}
/* Which resource each content-stream operator draws, by the /Resources category its name is looked up in. */
const RES_OPS = { Do: "XObject", Tf: "Font", gs: "ExtGState", sh: "Shading", cs: "ColorSpace", CS: "ColorSpace", scn: "Pattern", SCN: "Pattern", BDC: "Properties", DP: "Properties" };
function streamData(s) {
  if (!(s instanceof PDFRawStream)) return s.getUnencodedContents ? s.getUnencodedContents() : s.getContents();
  const parms = s.dict.lookup(PDFName.of("DecodeParms")), list = parms instanceof PDFArray ? parms.asArray().map(x => s.dict.context.lookup(x)) : [parms];
  for (const d of list) { const pr = d instanceof PDFDict && d.lookup(PDFName.of("Predictor")); if (pr instanceof PDFNumber && pr.asNumber() > 1) throw new Error("predictor"); }
  return PL.decodePDFRawStream(s).decode();
}
/* calls add(category, name) for every resource name a content stream uses */
function resourceNames(b, add, budget = { left: 32 * b.length + (1 << 20) }) {
  const n = b.length, WS = c => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
  const DL = c => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  const ASCII = c => WS(c) || (c > 32 && c < 127);
  const strEnd = k => { for (let d = 0; k < n; k++) { if (b[k] === 92) k++; else if (b[k] === 40) d++; else if (b[k] === 41 && --d === 0) return k + 1; } return -1; };
  let i = 0, ops = [];
  while (i < n) {
    const c = b[i];
    if (WS(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    if (c === 40) { if ((i = strEnd(i)) < 0) throw new Error("unterminated string"); ops.push(null); continue; }
    if ((c === 60 || c === 62) && b[i + 1] === c) { i += 2; ops.push(null); continue; }
    if (c === 60) { while (i < n && b[i] !== 62) i++; i++; ops.push(null); continue; }
    if (c === 47) {
      let nm = "";
      for (i++; i < n && !WS(b[i]) && !DL(b[i]); i++) nm += b[i] === 35 && i + 2 < n ? String.fromCharCode(parseInt(String.fromCharCode(b[++i], b[++i]), 16)) : String.fromCharCode(b[i]);
      ops.push(nm); continue;
    }
    if (DL(c)) { i++; ops.push(null); continue; }
    let tok = ""; for (; i < n && !WS(b[i]) && !DL(b[i]); i++) tok += String.fromCharCode(b[i]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { ops.push(Number(tok)); continue; }
    if (tok === "true" || tok === "false" || tok === "null") { ops.push(null); continue; }
    if (tok === "ID") {
      const at = k => { const j = ops.findIndex(v => k.includes(v)); return j < 0 ? undefined : ops[j + 1]; };
      const cs = at(["CS", "ColorSpace"]), len = at(["L", "Length"]);
      if (typeof cs === "string") add("ColorSpace", cs);
      /* end the data where PDF.js does (an EI followed by 10 plain bytes); a viewer may end it at any earlier EI instead,
         so also read what follows each of those as content: an extra name kept is harmless, a missed one loses a drawing */
      let j = i + 1 + (Number.isInteger(len) && len >= 0 ? len : 0);
      const ends = [];
      for (;; j++) {
        if (j + 1 >= n) { j = n; break; }
        if (b[j] === 69 && b[j + 1] === 73 && WS(b[j - 1]) && (j + 2 >= n || WS(b[j + 2]) || DL(b[j + 2]))) {
          ends.push(j + 2);
          if (b.subarray(j + 2, j + 12).every(ASCII)) { j += 2; break; }
        }
      }
      for (const e of ends) if (e < j) {
        if ((budget.left -= j - e) < 0) throw new Error("content too complex");
        try { resourceNames(b.subarray(e, j), add, budget); } catch (err) { if (budget.left < 0) throw err; }
      }
      if (!(j > i)) throw new Error("inline image did not advance");
      i = j; ops = []; continue;
    }
    const cat = RES_OPS[tok];
    if (cat) { const nm = tok === "Tf" ? ops[0] : tok === "BDC" || tok === "DP" ? (ops.length === 2 ? ops[1] : null) : ops[ops.length - 1]; if (typeof nm === "string") add(cat, nm); }
    ops = [];
  }
}
/* Copied pages keep the whole /Resources they had in the source, and a source often shares one dictionary across pages (inherited from the
   page tree, or one object every page points at), so images and forms that only removed or redacted pages draw would ride along unseen.
   Give every page its own Resources holding only what its content, its annotations' appearances and the forms, patterns, soft masks and
   Type 3 glyphs they draw actually name, drop every object nothing points at any more, then check that no page-tree object other than the
   output's own and no image or form other than the ones drawn is left. Returns false when the file cannot be trimmed safely. */
async function trimToPages(out) {
  await out.flush();
  const ctx = out.context, N = PDFName.of, look = v => ctx.lookup(v), used = new Set(), own = new Set(), stack = new Set();
  const isStream = o => o instanceof PL.PDFStream;
  const build = (res, names) => {
    const d = ctx.obj({}), ps = res instanceof PDFDict && res.get(N("ProcSet")); if (ps) d.set(N("ProcSet"), ps);
    const cs = res instanceof PDFDict && res.lookup(N("ColorSpace"));
    if (cs instanceof PDFDict) for (const k of ["DefaultGray", "DefaultRGB", "DefaultCMYK"]) if (cs.get(N(k))) { if (!names.has("ColorSpace")) names.set("ColorSpace", new Set()); names.get("ColorSpace").add(k); }
    for (const [cat, set] of names) {
      const src = res instanceof PDFDict && res.lookup(N(cat)); if (!(src instanceof PDFDict)) continue;
      const c = ctx.obj({}); for (const k of set) { const v = src.get(N(k)); if (v) c.set(N(k), v); }
      if (c.keys().length) d.set(N(cat), c);
    }
    return d;
  };
  const sub = (o, res, names) => {
    if (!isStream(o)) return;
    const r = o.dict.lookup(N("Resources"));
    if (!(r instanceof PDFDict)) return collect([o], res, names);
    if (own.has(o)) return; own.add(o);
    const m = new Map(); collect([o], r, m); o.dict.set(N("Resources"), build(r, m));
  };
  const follow = (cat, o, res, names) => {
    if (cat === "XObject" && isStream(o)) {
      used.add(o);
      if (o.dict.lookup(N("Subtype")) === N("Form")) return sub(o, res, names);
      for (const k of ["SMask", "Mask"]) { const m = o.dict.lookup(N(k)); if (isStream(m)) used.add(m); }
      const alt = o.dict.lookup(N("Alternates"));
      if (alt instanceof PDFArray) for (const a of alt.asArray()) { const im = look(a)?.lookup?.(N("Image")); if (isStream(im)) used.add(im); }
    } else if (cat === "Pattern") sub(o, res, names);
    else if (cat === "ExtGState" && o instanceof PDFDict) { const sm = o.lookup(N("SMask")), g = sm instanceof PDFDict && sm.lookup(N("G")); if (isStream(g)) { used.add(g); sub(g, res, names); } }
    else if (cat === "Font" && o instanceof PDFDict && o.lookup(N("Subtype")) === N("Type3")) {
      const cp = o.lookup(N("CharProcs")), glyphs = cp instanceof PDFDict ? cp.values().map(look) : [], r = o.lookup(N("Resources"));
      if (!(r instanceof PDFDict)) collect(glyphs, res, names);
      else if (!own.has(o)) { own.add(o); const m = new Map(); collect(glyphs, r, m); o.set(N("Resources"), build(r, m)); }
    }
  };
  /* a page's content array is one stream split anywhere, even between an operand and its operator, so read the parts as one */
  const collect = (streams, res, names) => {
    const fresh = streams.filter(s => isStream(s) && !stack.has(s)); if (!fresh.length) return;
    fresh.forEach(s => stack.add(s));
    const parts = fresh.map(streamData), all = new Uint8Array(parts.reduce((t, p) => t + p.length + 1, 0));
    let at = 0; for (const p of parts) { all.set(p, at); all[at + p.length] = 10; at += p.length + 1; }
    resourceNames(all, (cat, nm) => {
      if (!names.has(cat)) names.set(cat, new Set());
      const set = names.get(cat); if (set.has(nm)) return; set.add(nm);
      const dict = res instanceof PDFDict && res.lookup(N(cat));
      if (dict instanceof PDFDict) follow(cat, look(dict.get(N(nm))), res, names);
    });
    fresh.forEach(s => stack.delete(s));
  };
  try {
    for (const p of out.getPages()) {
      const node = p.node, res = node.lookup(N("Resources")), names = new Map(), c = look(node.get(N("Contents")));
      node.delete(N("Thumb"));
      collect(c instanceof PDFArray ? c.asArray().map(look) : [c], res, names);
      const annots = node.lookup(N("Annots"));
      for (const a of annots instanceof PDFArray ? annots.asArray().map(look) : []) {
        if (!(a instanceof PDFDict)) continue;
        const ap = a.lookup(N("AP")), mk = a.lookup(N("MK")), forms = [];
        if (ap instanceof PDFDict) for (const v of ap.values().map(look)) v instanceof PDFDict ? forms.push(...v.values().map(look)) : forms.push(v);
        if (mk instanceof PDFDict) for (const k of ["I", "RI", "IX"]) forms.push(mk.lookup(N(k)));
        for (const f of forms) if (isStream(f)) { used.add(f); sub(f, res, names); }
      }
      node.set(N("Resources"), build(res, names));
    }
  } catch (e) { console.warn(e); return false; }
  const reach = new Set(), todo = [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt];
  while (todo.length) {
    let o = todo.pop();
    if (o instanceof PDFRef) { if (reach.has(o)) continue; reach.add(o); o = look(o); }
    if (isStream(o)) o = o.dict;
    if (o instanceof PDFDict) for (const v of o.values()) todo.push(v);
    else if (o instanceof PDFArray) for (const v of o.asArray()) todo.push(v);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reach.has(ref)) ctx.delete(ref);
  const ok = new Set([ctx.trailerInfo.Root, ...out.getPages().map(p => p.ref)]);
  for (const p of out.getPages()) for (let n = p.node, r; (r = n.get(N("Parent"))) instanceof PDFRef && !ok.has(r); n = look(r)) ok.add(r);
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    const t = o instanceof PDFDict ? o.lookup(N("Type")) : null, st = isStream(o) ? o.dict.lookup(N("Subtype")) : null;
    if ((t === N("Page") || t === N("Pages") || t === N("Catalog")) && !ok.has(ref)) return false;
    if ((st === N("Image") || st === N("Form")) && !used.has(o)) return false;
  }
  return true;
}
