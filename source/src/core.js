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
const { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFRawStream, PDFNumber, PDFRef,
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
  chat: "M4 5h16v11H9l-5 4z", spark: "M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.500 2.700 2.500 15.300 0 18M12 3c-2.500 2.700-2.500 15.300 0 18",
  quiz: "M9.500 9a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 .900-1 1.700M12 17h.010M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4", table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14", slides: "M3 5h18v12H3zM12 17v4M8 21h8",
  form: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h4", layers: "M12 4 3 9l9 5 9-5zM3 14l9 5 9-5", bar: "M3 9h18v6H3z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", swap: "M4 8h14l-3-3M20 16H6l3 3",
  sign: "M3 17c3-6 5-9 7-9s0 8 2 8 3-5 5-5 2 4 4 4M3 21h18", scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 12h8",
  cursor: "M6 4l11 8-5 1.200L10 19z", rect: "M4 6h16v12H4z", circle: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", mark: "M5 15l9-9 4 4-9 9H5zM4 21h16",
  white: "M5 8h14v8H5zM3 20h18", back: "M11 6l-6 6 6 6M5 12h14", send: "M4 12l16-8-6 16-3-7z", stop: "M7 7h10v10H7z",
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
const downloadsReady = (async () => { try { return window.claude?.use ? await window.claude.use("downloads") : null; } catch { return null; } })();
async function saveFile(name, data) {
  const blob = toBlob(data), dl = await downloadsReady;
  if (dl) { await dl.save({ filename: name, data: blob }); return; }
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function saveErrorText(e) {
  if (e?.code === "declined") return "Download cancelled.";
  if (e?.code === "rate_limited") return "A download prompt is already open. Answer it, then try again.";
  if (e?.code === "too_large") return "This file is too large to save from here.";
  if (e?.code) return "Downloads are not available in this view. Open the page on claude.ai and try again.";
  return "The file could not be saved: " + (e?.message || "unknown error");
}
async function makeZip(files) {
  const z = new JSZip(), seen = new Set();
  for (const f of files) { let n = f.name, k = 1; while (seen.has(n)) n = baseName(f.name) + `-${++k}.` + extOf(f.name); seen.add(n); z.file(n, f.data); }
  return await z.generateAsync({ type: "blob" });
}
const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) loadedScripts.set(src, (async () => {
    const s = h("script", { src: (await embeddedLib(src)) || src });
    const p = new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error("A required component could not be loaded.")); });
    document.head.append(s); await p;
  })());
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
   Point kept pages at their new copies and everything else page-shaped at null, then check nothing slipped in. */
async function subsetPdf(doc, indices) {
  await doc.flush();
  const out = await PDFDocument.create(), ctx = out.context, N = s => PDFName.of(s), pages = doc.getPages();
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
  const dead = a => {
    const d = ctx.lookup(a); if (!(d instanceof PDFDict)) return true;
    if (d.lookup(N("Subtype")) !== N("Link")) return false;
    const act = d.lookup(N("A")), dest = d.lookup(N("Dest")) ?? (act instanceof PDFDict ? act.lookup(N("D")) : undefined);
    return dest instanceof PDFArray && dest.get(0) === nil;
  };
  for (const i of indices) {
    const src = pages[i], node = copier.copy(src.node);
    let ref = kept.get(src.ref); if (ctx.lookup(ref)) ref = ctx.nextRef();
    const annots = node.lookup(N("Annots"));
    if (annots instanceof PDFArray) { const live = annots.asArray().filter(a => !dead(a)); live.length ? node.set(N("Annots"), ctx.obj(live)) : node.delete(N("Annots")); }
    ctx.assign(ref, node); out.addPage(PL.PDFPage.of(node, ref, out));
  }
  const ok = new Set([ctx.trailerInfo.Root, ...out.getPages().map(p => p.ref)]);
  for (const p of out.getPages()) for (let n = p.node, r; (r = n.get(N("Parent"))) instanceof PDFRef && !ok.has(r); n = ctx.lookup(r)) ok.add(r);
  for (const [ref, o] of ctx.enumerateIndirectObjects())
    if (["Page", "Pages", "Catalog"].includes(typeOf(o)) && !ok.has(ref)) throw new Error("Could not separate the chosen pages from the rest of this PDF.");
  return await out.save();
}
