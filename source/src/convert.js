/* ---------- reading text out of a PDF ---------- */
async function pageLines(js, n) {
  const pg = await js.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
  const items = tc.items.filter(i => i.str && i.str.trim()).map(i => {
    const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
    return { x, y, w: i.width, size: Math.hypot(i.transform[2], i.transform[3]) || i.height || 10, str: i.str };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L.y - it.y) < Math.max(2, it.size * 0.45)) L.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  for (const L of lines) {
    L.items.sort((a, b) => a.x - b.x); L.size = Math.max(...L.items.map(i => i.size)); L.x = L.items[0].x;
    let s = "", prev = null;
    for (const it of L.items) { if (prev && it.x - (prev.x + prev.w) > it.size * 0.15 && !/\s$/.test(s) && !/^\s/.test(it.str)) s += " "; s += it.str; prev = it; }
    L.text = s.replace(/\s+/g, " ").trim();
  }
  return { lines: lines.filter(L => L.text), w: vp.width, h: vp.height };
}
/* paragraphs: consecutive lines of similar size with normal leading */
function paragraphs(lines) {
  const sizes = lines.map(L => L.size).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 11, out = [];
  let cur = null, prev = null;
  for (const L of lines) {
    const gap = prev ? L.y - prev.y : 0;
    if (!cur || gap > prev.size * 1.7 || gap < 0 || Math.abs(L.size - prev.size) > prev.size * 0.15) { cur = { text: L.text, size: L.size, head: L.size > med * 1.2 }; out.push(cur); }
    else cur.text += (/-$/.test(cur.text) ? "" : " ") + L.text;
    prev = L;
  }
  return out;
}
async function pdfText(js, { max = Infinity, progress } = {}) {
  let s = "", cut = false;
  for (let i = 1; i <= js.numPages; i++) {
    progress?.(`Reading page ${i} of ${js.numPages}…`);
    const { lines } = await pageLines(js, i);
    const chunk = `[Page ${i}]\n` + paragraphs(lines).map(p => p.text).join("\n") + "\n\n";
    if (s.length + chunk.length > max) { s += chunk.slice(0, max - s.length); cut = true; break; }
    s += chunk;
  }
  return { text: s.trim(), cut };
}

/* ---------- writing Office files ---------- */
const xesc = s => cleanText(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const RELS = t => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${t}</Relationships>`;
/* paras: [{ text, bold, size, breakBefore }] */
async function makeDocx(paras) {
  const body = paras.map(p => {
    const rp = `<w:rPr>${p.bold ? "<w:b/>" : ""}<w:sz w:val="${Math.round((p.size || 11) * 2)}"/></w:rPr>`;
    const runs = String(p.text).split("\n").map((t, i) => `<w:r>${rp}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${xesc(t)}</w:t></w:r>`).join("");
    return `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr>${p.breakBefore ? '<w:r><w:br w:type="page"/></w:r>' : ""}${runs}</w:p>`;
  }).join("");
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", RELS(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`));
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return await z.generateAsync({ type: "uint8array" });
}
const colName = i => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const NUMRE = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
/* sheets: [{ name, rows: [[cell, ...], ...] }] */
async function makeXlsx(sheets) {
  const z = new JSZip(), names = new Set();
  const sheetXml = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    if (c == null || c === "") return ""; const ref = colName(ci) + (ri + 1), s = String(c).trim();
    if (NUMRE.test(s) && !/^-?0\d/.test(s) && s.replace(/[^\d]/g, "").length < 16) return `<c r="${ref}"><v>${s.replace(/,/g, "")}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xesc(s)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
  sheets.forEach((s, i) => { let n = cleanText(s.name).replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || `Sheet${i + 1}`; while (names.has(n)) n += "_"; names.add(n); s.name = n; z.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)); });
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  z.file("_rels/.rels", RELS(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`));
  z.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s.name).replace(/"/g, "&quot;")}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", RELS(sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")));
  return await z.generateAsync({ type: "uint8array" });
}
/* a page of text lines -> rows of cells, by clustering the x positions where cells start */
function linesToRows(lines) {
  const rows = lines.map(L => {
    const cells = []; let cur = null, prev = null;
    for (const it of L.items) {
      if (!cur || it.x - (prev.x + prev.w) > it.size * 1.1) { cur = { x: it.x, text: it.str }; cells.push(cur); }
      else cur.text += (it.x - (prev.x + prev.w) > it.size * 0.15 ? " " : "") + it.str;
      prev = it;
    }
    return cells;
  });
  const xs = rows.flat().map(c => c.x).sort((a, b) => a - b), cols = [];
  for (const x of xs) { const last = cols[cols.length - 1]; if (last && x - last.max < 14) { last.max = x; last.sum += x; last.n++; } else cols.push({ max: x, sum: x, n: 1 }); }
  const centers = cols.map(c => c.sum / c.n);
  return rows.map(cells => {
    const r = [];
    for (const c of cells) { let bi = 0; centers.forEach((cx, i) => { if (Math.abs(cx - c.x) < Math.abs(centers[bi] - c.x)) bi = i; }); r[bi] = r[bi] ? r[bi] + " " + c.text.trim() : c.text.trim(); }
    return Array.from(r, v => v ?? "");
  });
}

/* ---------- blocks -> PDF: a small text layout engine ----------
   block: { type: "h"|"p"|"li"|"table"|"break", level, ordered, n, runs: [{ text, b, i, m }], rows } */
async function blocksToPdf(blocks, { size = "a4", land = false, margin = 56, fs = 11 } = {}) {
  const doc = await PDFDocument.create();
  const F = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold), i: await doc.embedFont(StandardFonts.HelveticaOblique),
    bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique), m: await doc.embedFont(StandardFonts.Courier) };
  let [PW, PH] = size === "letter" ? [612, 792] : [595.28, 841.89]; if (land) [PW, PH] = [PH, PW];
  const CW = PW - 2 * margin; let page, y, dirty = false;
  const newPage = () => { page = doc.addPage([PW, PH]); y = PH - margin; dirty = false; };
  newPage();
  const fontOf = st => st.m ? F.m : F[(st.b ? "b" : "") + (st.i ? "i" : "") || "r"];
  const measure = (t, st, sz) => textWidth(fontOf(st), t, sz, st);
  function wrap(runs, sz, width) {
    const lines = [[]]; let x = 0, space = false; const spw = F.r.widthOfTextAtSize(" ", sz);
    const put = (t, st, w) => { if (space && x > 0) x += spw; lines[lines.length - 1].push({ t, st, x, w }); x += w; space = false; };
    for (const r of runs) for (const part of cleanText(r.text).split(/(\n| +)/)) {
      if (!part) continue;
      if (part === "\n") { lines.push([]); x = 0; space = false; continue; }
      if (/^ +$/.test(part)) { space = true; if (r.m && x > 0) { x += spw * (part.length - 1); } continue; }
      let t = part, w = measure(t, r, sz);
      if (x > 0 && x + (space ? spw : 0) + w > width) { lines.push([]); x = 0; space = false; }
      while (w > width && t.length > 1) {
        let k = t.length - 1; while (k > 1 && measure(t.slice(0, k), r, sz) > width) k--;
        put(t.slice(0, k), r, measure(t.slice(0, k), r, sz)); lines.push([]); x = 0; t = t.slice(k); w = measure(t, r, sz);
      }
      put(t, r, w);
    }
    return lines;
  }
  async function drawLine(segs, x0, yb, sz, width) {
    if (segs.some(s => RTL_RE.test(s.t))) {   /* right-to-left line: let the browser order and shape the whole line, then set it flush right */
      const im = await textImage(doc, segs.map(s => s.t).join(" "), sz, "#000000", segs[0].st, true), w = Math.min(im.w, width);
      page.drawImage(im.img, { x: x0 + width - w, y: yb - (im.h - im.base), width: w, height: im.h }); dirty = true; return;
    }
    const groups = [];
    for (const s of segs) {
      const g = groups[groups.length - 1], f = fontOf(s.st);
      if (g && g.st === s.st && g.enc && canEncode(f, s.t) && Math.abs(g.x + g.w + F.r.widthOfTextAtSize(" ", sz) - s.x) < 0.01) { g.t += " " + s.t; g.w = s.x + s.w - g.x; }
      else groups.push({ t: s.t, st: s.st, x: s.x, w: s.w, enc: canEncode(f, s.t) });
    }
    for (const g of groups) await drawTextSmart(page, doc, fontOf(g.st), g.t, { x: x0 + g.x, y: yb, size: sz, st: g.st });
    dirty = true;
  }
  async function para(runs, { sz = fs, indent = 0, before = 0, after = fs * 0.55, lead = 1.38, bullet, keep = 1 } = {}) {
    const lines = wrap(runs, sz, CW - indent);
    if (y - before - sz * lead * Math.min(lines.length, keep) < margin && dirty) newPage(); else y -= before;
    for (const [i, L] of lines.entries()) {
      if (y - sz * lead < margin) newPage();
      y -= sz * lead;
      if (i === 0 && bullet) { page.drawText(bullet, { x: margin + indent - F.r.widthOfTextAtSize(bullet, sz) - 5, y, size: sz, font: F.r }); dirty = true; }
      await drawLine(L, margin + indent, y, sz, CW - indent);
    }
    y -= after;
  }
  async function table(rows) {
    const ncol = Math.min(40, Math.max(0, ...rows.map(r => r.length))); if (!ncol) return;
    const sz = ncol <= 5 ? fs - 1 : ncol <= 9 ? fs - 2.5 : 6.5, pad = 3, lh = sz * 1.25;
    let widths = Array(ncol).fill(24);
    for (const [ri, r] of rows.slice(0, 300).entries()) r.slice(0, ncol).forEach((c, i) => { widths[i] = Math.max(widths[i], Math.min(CW * 0.5, measure(cleanText(c).slice(0, 80), { b: ri === 0 }, sz) + 2 * pad + 3)); });
    const total = widths.reduce((a, b) => a + b, 0); if (total > CW) widths = widths.map(w => w * CW / total);
    const tw = widths.reduce((a, b) => a + b, 0), line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.4, color: rgb(.6, .62, .68) });
    y -= 4; let top = true;
    for (const [ri, r] of rows.entries()) {
      const cells = Array.from({ length: ncol }, (_, i) => wrap([{ text: String(r[i] ?? ""), b: ri === 0 }], sz, widths[i] - 2 * pad));
      const maxLines = Math.floor((PH - 2 * margin - 2 * pad) / lh);
      const nl = Math.min(maxLines, Math.max(1, ...cells.map(c => c.length))), rh = nl * lh + 2 * pad;
      if (y - rh < margin) { newPage(); top = true; }
      if (top) { line(margin, y, margin + tw, y); top = false; }
      let x = margin;
      for (const [i, c] of cells.entries()) { for (const [li, L] of c.slice(0, nl).entries()) await drawLine(L, x + pad, y - pad - sz - li * lh + sz * 0.12, sz, widths[i] - 2 * pad); line(x, y, x, y - rh); x += widths[i]; }
      line(x, y, x, y - rh); line(margin, y - rh, margin + tw, y - rh); y -= rh; dirty = true;
    }
    y -= fs;
  }
  const HS = [1.9, 1.5, 1.25, 1.1, 1, 1];
  for (const b of blocks) {
    if (b.type === "break") { if (dirty) newPage(); }
    else if (b.type === "table") await table(b.rows);
    else if (b.type === "h") { const sz = fs * HS[Math.min(6, Math.max(1, b.level || 1)) - 1]; await para(b.runs.map(r => ({ ...r, b: true })), { sz, before: dirty ? sz * 0.7 : 0, after: sz * 0.35, lead: 1.25, keep: 3 }); }
    else if (b.type === "li") await para(b.runs, { indent: 20, bullet: b.ordered ? `${b.n}.` : "\u2022", after: fs * 0.2 });
    else if (!b.runs.length || !b.runs.some(r => r.text.trim())) y -= fs * 0.7;
    else await para(b.runs, { after: b.tight ? 0 : fs * 0.55 });
  }
  return await doc.save();
}

/* ---------- parsers: file bytes -> blocks ---------- */
function decodeText(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}
const xmlDoc = s => new DOMParser().parseFromString(s, "application/xml");
const kidsNamed = (n, tag) => [...n.children].filter(c => c.tagName === tag);
const txtBlocks = text => text.replace(/\r\n?/g, "\n").split("\n").map(l => ({ type: "p", tight: true, runs: l.trim() ? [{ text: l }] : [] }));
function parseCsv(text) {
  text = text.replace(/^\ufeff/, ""); const first = text.split(/\r?\n/, 1)[0];
  const d = [",", ";", "\t", "|"].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [[]]; let cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { rows[rows.length - 1].push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; rows[rows.length - 1].push(cur); cur = ""; rows.push([]); }
    else cur += c;
  }
  rows[rows.length - 1].push(cur);
  return rows.filter(r => r.some(c => c.trim()));
}
function domToBlocks(root) {
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.runs.some(r => r.text.trim())) out.push(cur); cur = null; };
  const BLOCK = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|BLOCKQUOTE|H[1-6]|UL|OL|LI|PRE|HR|FIGURE|FIGCAPTION|DL|DT|DD|ADDRESS|FORM|NAV|BODY|HTML)$/;
  const walk = (n, st, ctx) => {
    if (n.nodeType === 3) {
      const t = ctx.pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, " "); if (!t) return;
      if (!cur) { if (!t.trim()) return; cur = { type: ctx.type, level: ctx.level, ordered: ctx.ordered, n: ctx.n, runs: [] }; }
      cur.runs.push({ text: t, b: st.b, i: st.i, m: ctx.pre }); return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toUpperCase().replace(/^.*:/, "");
    if (/^(SCRIPT|STYLE|HEAD|NOSCRIPT|TEMPLATE|SVG|IFRAME|TITLE|META|LINK|OBJECT|EMBED)$/.test(tag)) return;
    if (tag === "BR") { if (cur) cur.runs.push({ text: "\n" }); return; }
    if (tag === "TABLE") {
      flush();
      const rows = [...n.querySelectorAll("tr")].map(tr => [...tr.children].filter(c => /^t[dh]$/i.test(c.tagName)).map(c => c.textContent.replace(/\s+/g, " ").trim())).filter(r => r.length);
      if (rows.length) out.push({ type: "table", rows }); return;
    }
    if (/^(B|STRONG|TH)$/.test(tag)) st = { ...st, b: true };
    if (/^(I|EM|CITE)$/.test(tag)) st = { ...st, i: true };
    const hm = tag.match(/^H([1-6])$/), block = BLOCK.test(tag);
    if (block) flush();
    if (hm) ctx = { type: "h", level: +hm[1] };
    else if (tag === "LI") { const ol = n.parentElement?.tagName.toUpperCase() === "OL"; ctx = { type: "li", ordered: ol, n: ol ? [...n.parentElement.children].indexOf(n) + 1 : 0 }; }
    else if (tag === "PRE") ctx = { type: "p", pre: true };
    else if (block && ctx.type !== "li") ctx = { type: "p" };
    for (const c of n.childNodes) walk(c, st, ctx);
    if (block) flush();
  };
  walk(root, {}, { type: "p" }); flush();
  return out;
}
function rtfText(s) {
  let out = "", depth = 0, skip = 0, i = 0; const dec = new TextDecoder("windows-1252");
  while (i < s.length) {
    const c = s[i];
    if (c === "{") { depth++; i++; if (!skip && /^\\(\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|object|themedata|datastore|generator)/.test(s.slice(i, i + 14))) skip = depth; continue; }
    if (c === "}") { if (skip === depth) skip = 0; depth--; i++; continue; }
    if (c === "\\") {
      const m = s.slice(i, i + 40).match(/^\\([a-zA-Z]+)(-?\d+)? ?|^\\'([0-9a-fA-F]{2})|^\\([^a-zA-Z])/);
      if (!m) { i++; continue; }
      i += m[0].length; if (skip) continue;
      if (m[3]) out += dec.decode(new Uint8Array([parseInt(m[3], 16)]));
      else if (m[4]) out += m[4] === "~" ? " " : /[\\{}]/.test(m[4]) ? m[4] : m[4] === "\n" || m[4] === "\r" ? "\n" : "";
      else if (m[1] === "par" || m[1] === "line" || m[1] === "sect" || m[1] === "page") out += "\n";
      else if (m[1] === "tab") out += "    ";
      else if (m[1] === "u" && m[2]) { out += String.fromCharCode((+m[2] + 65536) % 65536); if (s[i] === "\\" && s[i + 1] === "'") i += 4; else if (s[i] !== "\\" && s[i] !== "{" && s[i] !== "}") i++; }
      continue;
    }
    if (!skip && c !== "\r" && c !== "\n") out += c;
    i++;
  }
  return out;
}
async function docxBlocks(zip) {
  const xml = await zip.file("word/document.xml")?.async("string"); if (!xml) throw new Error("This does not look like a Word .docx file.");
  const body = xmlDoc(xml).getElementsByTagName("w:body")[0], out = [];
  const on = (rp, tag) => { const e = rp && kidsNamed(rp, tag)[0]; return !!e && !["0", "false"].includes(e.getAttribute("w:val")); };
  const runsOf = p => {
    const runs = [];
    for (const r of p.getElementsByTagName("w:r")) {
      const rp = kidsNamed(r, "w:rPr")[0]; let t = "";
      for (const c of r.children) { if (c.tagName === "w:t") t += c.textContent; else if (c.tagName === "w:tab") t += "    "; else if (c.tagName === "w:br" || c.tagName === "w:cr") t += "\n"; }
      if (t) runs.push({ text: t, b: on(rp, "w:b"), i: on(rp, "w:i") });
    }
    return runs;
  };
  const visit = nodes => {
    for (const n of nodes) {
      if (n.tagName === "w:p") {
        const pp = kidsNamed(n, "w:pPr")[0], style = pp?.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || "", runs = runsOf(n);
        const hm = style.match(/(?:heading|titre|berschrift|ttulo)\s*(\d)/i);
        if (hm || /^(title|titel)$/i.test(style)) out.push({ type: "h", level: hm ? +hm[1] : 1, runs });
        else if (pp?.getElementsByTagName("w:numPr")[0] || /list/i.test(style)) out.push({ type: "li", runs });
        else out.push({ type: "p", runs });
      } else if (n.tagName === "w:tbl") {
        out.push({ type: "table", rows: kidsNamed(n, "w:tr").map(tr => kidsNamed(tr, "w:tc").map(tc => [...tc.getElementsByTagName("w:p")].map(p => runsOf(p).map(r => r.text).join("")).join("\n"))) });
      } else if (n.tagName === "w:sdt") visit(kidsNamed(n, "w:sdtContent").flatMap(c => [...c.children]));
    }
  };
  visit([...body.children]);
  return out;
}
/* OpenDocument text helpers */
function odText(n) {
  let s = "";
  for (const c of n.childNodes) {
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeType === 1) s += c.tagName === "text:tab" ? "    " : c.tagName === "text:line-break" ? "\n" : c.tagName === "text:s" ? " ".repeat(Math.min(+c.getAttribute("text:c") || 1, 500)) : /^(text:note|office:annotation)$/.test(c.tagName) ? "" : odText(c);
  }
  return s;
}
function odTable(t) {
  const rows = [];
  for (const tr of t.getElementsByTagName("table:table-row")) {
    const r = [];
    for (const c of tr.children) {
      if (!/^table:(covered-)?table-cell$/.test(c.tagName)) continue;
      const text = [...c.getElementsByTagName("text:p")].map(odText).join("\n"), rep = Math.min(+c.getAttribute("table:number-columns-repeated") || 1, text ? 50 : 1);
      for (let i = 0; i < rep; i++) r.push(text);
    }
    while (r.length && !r[r.length - 1]) r.pop();
    if (r.length && rows.length < 5000) rows.push(r);
  }
  return rows;
}
async function odBlocks(zip, kind) {
  const xml = await zip.file("content.xml")?.async("string"); if (!xml) throw new Error("This does not look like an OpenDocument file.");
  const d = xmlDoc(xml), out = [];
  if (kind === "ods") { for (const t of d.getElementsByTagName("table:table")) { const rows = odTable(t); if (rows.length) out.push({ type: "h", level: 2, runs: [{ text: t.getAttribute("table:name") || "Sheet" }] }, { type: "table", rows }); } return out; }
  if (kind === "odp") { [...d.getElementsByTagName("draw:page")].forEach((pg, i) => { if (i) out.push({ type: "break" }); out.push({ type: "h", level: 2, runs: [{ text: `Slide ${i + 1}` }] }); for (const p of pg.getElementsByTagName("text:p")) { const t = odText(p); if (t.trim()) out.push({ type: "p", runs: [{ text: t }] }); } }); return out; }
  const visit = nodes => {
    for (const n of nodes) {
      if (n.tagName === "text:h") out.push({ type: "h", level: +n.getAttribute("text:outline-level") || 1, runs: [{ text: odText(n) }] });
      else if (n.tagName === "text:p") out.push({ type: "p", runs: [{ text: odText(n) }] });
      else if (n.tagName === "text:list") for (const li of n.getElementsByTagName("text:list-item")) for (const p of kidsNamed(li, "text:p")) out.push({ type: "li", runs: [{ text: odText(p) }] });
      else if (n.tagName === "table:table") out.push({ type: "table", rows: odTable(n) });
      else if (n.tagName === "text:section") visit([...n.children]);
    }
  };
  visit([...(d.getElementsByTagName("office:text")[0]?.children || [])]);
  return out;
}
async function xlsxBlocks(zip) {
  const read = async p => (await zip.file(p)?.async("string")) || "";
  const wb = await read("xl/workbook.xml"); if (!wb) throw new Error("This does not look like an Excel .xlsx file.");
  const shared = [...xmlDoc(await read("xl/sharedStrings.xml") || "<sst/>").getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join(""));
  const rels = {}; for (const r of xmlDoc(await read("xl/_rels/workbook.xml.rels") || "<r/>").getElementsByTagName("Relationship")) rels[r.getAttribute("Id")] = r.getAttribute("Target");
  const out = [];
  for (const s of xmlDoc(wb).getElementsByTagName("sheet")) {
    const target = rels[s.getAttribute("r:id")]; if (!target) continue;
    const xml = await read(target.startsWith("/") ? target.slice(1) : "xl/" + target); if (!xml) continue;
    const rows = [];
    for (const row of xmlDoc(xml).getElementsByTagName("row")) {
      const r = [];
      for (const c of row.getElementsByTagName("c")) {
        const letters = (c.getAttribute("r") || "").replace(/\d/g, ""); let ci = 0; for (const ch of letters) ci = ci * 26 + ch.charCodeAt(0) - 64;
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        const val = t === "s" ? shared[+v] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map(x => x.textContent).join("") : t === "b" ? (v === "1" ? "TRUE" : "FALSE") : /^-?\d+\.\d{7,}$/.test(v) ? String(+(+v).toFixed(6)) : v;
        if (ci > 0 && ci <= 60) r[ci - 1] = val;
      }
      if (r.some(v => v) && rows.length < 5000) rows.push(Array.from(r, v => v ?? ""));
    }
    if (rows.length) out.push({ type: "h", level: 2, runs: [{ text: s.getAttribute("name") || "Sheet" }] }, { type: "table", rows });
  }
  return out;
}
async function pptxBlocks(zip) {
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  if (!names.length) throw new Error("This does not look like a PowerPoint .pptx file.");
  const out = [];
  for (const [i, n] of names.entries()) {
    if (i) out.push({ type: "break" });
    const d = xmlDoc(await zip.file(n).async("string")); let titled = false; const body = [];
    for (const sp of d.getElementsByTagName("p:sp")) {
      const isTitle = /title/i.test(sp.getElementsByTagName("p:ph")[0]?.getAttribute("type") || "");
      for (const p of sp.getElementsByTagName("a:p")) {
        let t = ""; for (const c of p.children) t += c.tagName === "a:r" || c.tagName === "a:fld" ? (c.getElementsByTagName("a:t")[0]?.textContent || "") : c.tagName === "a:br" ? "\n" : "";
        if (!t.trim()) continue;
        if (isTitle && !titled) { out.push({ type: "h", level: 2, runs: [{ text: t }] }); titled = true; } else body.push({ type: "li", runs: [{ text: t }] });
      }
    }
    if (!titled) out.push({ type: "h", level: 2, runs: [{ text: `Slide ${i + 1}` }] });
    out.push(...body);
  }
  return out;
}
async function epubBlocks(zip) {
  const cont = await zip.file("META-INF/container.xml")?.async("string"); if (!cont) throw new Error("This does not look like an EPUB file.");
  const opfPath = xmlDoc(cont).getElementsByTagName("rootfile")[0]?.getAttribute("full-path"), opf = xmlDoc(await zip.file(opfPath).async("string"));
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "", items = {};
  for (const it of opf.getElementsByTagName("item")) items[it.getAttribute("id")] = it.getAttribute("href");
  const out = [];
  for (const ref of opf.getElementsByTagName("itemref")) {
    const href = items[ref.getAttribute("idref")]; if (!href) continue;
    const f = zip.file(dir + decodeURIComponent(href.split("#")[0])); if (!f) continue;
    const d = new DOMParser().parseFromString(await f.async("string"), "text/html"), bl = domToBlocks(d.body);
    if (bl.length) { if (out.length) out.push({ type: "break" }); out.push(...bl); }
  }
  return out;
}
const TOPDF_EXT = ["docx", "odt", "rtf", "txt", "md", "csv", "tsv", "html", "htm", "xlsx", "ods", "pptx", "odp", "epub", "zip"];
/* any supported file -> PDF bytes */
async function anyToPdf(name, bytes, o = {}) {
  const ext = extOf(name), file = () => new File([bytes], name);
  if (ext === "pdf") return bytes;
  if (/^(png|jpe?g|webp|gif|bmp)$/.test(ext)) return await imageToPdf(file());
  if (/^(doc|xls|ppt)$/.test(ext)) throw new Error(`${name}: old binary Office files cannot be read here. Save it as .${ext}x first.`);
  if (/^(pages|numbers|key)$/.test(ext)) {
    let zip; try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error(`${name} could not be opened. The file may be damaged.`); }
    const pv = Object.keys(zip.files).find(n => /(^|\/)QuickLook\/Preview\.pdf$/i.test(n)); if (pv) return await zip.files[pv].async("uint8array");
    const jp = Object.keys(zip.files).find(n => /(^|\/)preview\.jpe?g$/i.test(n));
    if (jp) return await imageToPdf(new File([await zip.files[jp].async("uint8array")], "preview.jpg", { type: "image/jpeg" }));
    throw new Error(`${name} holds no preview to convert. Export it to PDF from its own app.`);
  }
  if (ext === "hwp") throw new Error(`${name}: HWP files have no browser-side reader. Export it to PDF from its own app.`);
  let blocks, land = o.land;
  if (ext === "txt" || ext === "md") blocks = txtBlocks(decodeText(bytes));
  else if (ext === "csv" || ext === "tsv") { blocks = [{ type: "table", rows: parseCsv(decodeText(bytes)) }]; land ??= blocks[0].rows[0]?.length > 6; }
  else if (ext === "html" || ext === "htm") blocks = domToBlocks(new DOMParser().parseFromString(decodeText(bytes), "text/html").body);
  else if (ext === "rtf") blocks = txtBlocks(rtfText(new TextDecoder("latin1").decode(bytes))).map(b => ({ ...b, tight: false }));
  else if (TOPDF_EXT.includes(ext)) {
    let zip; try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error(`${name} could not be opened. The file may be damaged.`); }
    if (ext === "docx") blocks = await docxBlocks(zip);
    else if (ext === "xlsx") { blocks = await xlsxBlocks(zip); land ??= true; }
    else if (ext === "pptx") { blocks = await pptxBlocks(zip); land ??= true; }
    else if (ext === "epub") blocks = await epubBlocks(zip);
    else if (ext === "zip") {
      const out = await PDFDocument.create(); let n = 0;
      for (const en of Object.keys(zip.files).sort()) {
        const f = zip.files[en]; if (f.dir || /(^|\/)(\.|__MACOSX)/.test(en) || extOf(en) === "zip") continue;
        try { const d = await loadDoc(await anyToPdf(en.split("/").pop(), await f.async("uint8array"), o)); for (const p of await out.copyPages(d, d.getPageIndices())) out.addPage(p); n++; } catch (e) { console.warn("skipped", en, e); }
      }
      if (!n) throw new Error(`${name} holds no file that can be converted.`);
      return await out.save();
    }
    else blocks = await odBlocks(zip, ext);
  }
  else throw new Error(`${name}: .${ext || "?"} files cannot be converted here.`);
  if (!blocks.length) blocks = [{ type: "p", runs: [{ text: "(This file has no text.)" }] }];
  return await blocksToPdf(blocks, { ...o, land: !!land });
}
