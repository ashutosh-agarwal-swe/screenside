/* ---------- tool definitions ---------- */
const optPages = (label = "Pages") => ({ id: "pages", label, type: "text", default: "", placeholder: "All pages", hint: tv => `Write pages like 1-3, 5, 8- or odd / even. Empty means all${tv.files[0]?.pages ? ` ${tv.files[0].pages}` : ""} pages.` });
const one = (f, suffix, data, ext = "pdf", note) => ({ name: `${baseName(f.name)}${suffix}.${ext}`, data, note });

/* Organize */
tool({ id: "merge", name: "Merge PDF", cat: "org", icon: "merge", desc: "Combine several PDFs and images into one document.", accept: ["pdf", "image"], multi: true, min: 2, verb: "Merge files",
  async run({ files, progress }) {
    const out = await PDFDocument.create();
    for (const f of files) {
      progress(`Adding ${f.name}…`);
      const d = f.kind === "pdf" ? f.doc : await PDFDocument.load(await imageToPdf(f.file));
      for (const p of await out.copyPages(d, d.getPageIndices())) out.addPage(p);
    }
    return { files: [{ name: "merged.pdf", data: await out.save() }], note: `Merged ${files.length} files into ${out.getPageCount()} pages` };
  } });
tool({ id: "split", name: "Split PDF", cat: "org", icon: "split", desc: "Cut one PDF into several files.", accept: ["pdf"], verb: "Split file",
  options: [{ id: "mode", label: "How to split", type: "select", default: "each", choices: [["each", "Every page becomes its own file"], ["every", "A new file every N pages"], ["ranges", "Custom ranges"]] },
    { id: "n", label: "Pages per file", type: "number", default: 2, min: 1, show: o => o.mode === "every" },
    { id: "ranges", label: "Ranges, one file each", type: "text", default: "", placeholder: "1-3; 4-6; 7-", hint: "Separate files with a semicolon.", show: o => o.mode === "ranges" }],
  async run({ files: [f], opts: o }) {
    const n = f.pages; let groups;
    if (o.mode === "each") groups = [...Array(n).keys()].map(i => [i]);
    else if (o.mode === "every") { const k = Math.max(1, Math.floor(o.n) || 1); groups = []; for (let i = 0; i < n; i += k) groups.push([...Array(Math.min(k, n - i)).keys()].map(j => i + j)); }
    else { groups = o.ranges.split(";").map(s => s.trim()).filter(Boolean).map(s => parseRanges(s, n)); if (!groups.length) throw new Error("Write at least one range, for example 1-3; 4-6."); }
    const out = [];
    for (const g of groups) out.push(one(f, g.length === 1 ? `-page-${g[0] + 1}` : `-pages-${g[0] + 1}-${g[g.length - 1] + 1}`, await subsetPdf(f.doc, g)));
    return { files: out, note: `Split into ${out.length} file${out.length === 1 ? "" : "s"}` };
  } });
tool({ id: "organize", name: "Organize PDF", cat: "org", icon: "grid", desc: "Reorder, rotate, duplicate, delete and insert pages by dragging thumbnails.", accept: ["pdf", "image"], view: "organize" });
tool({ id: "rotate", name: "Rotate PDF", cat: "org", icon: "rotR", desc: "Turn all pages, or only some, by 90 or 180 degrees.", accept: ["pdf"], verb: "Rotate pages",
  options: [{ id: "angle", label: "Turn", type: "select", default: "90", choices: [["90", "90° right"], ["270", "90° left"], ["180", "Upside down (180°)"]] }, optPages("Pages to rotate")],
  async run({ files: [f], opts: o }) {
    const doc = await freshDoc(f), idx = new Set(parseRanges(o.pages, f.pages));
    doc.getPages().forEach((p, i) => { if (idx.has(i)) p.setRotation(degrees((p.getRotation().angle + +o.angle) % 360)); });
    return { files: [one(f, "-rotated", await doc.save())], note: `Rotated ${idx.size} page${idx.size === 1 ? "" : "s"}` };
  } });
tool({ id: "delete-pages", name: "Delete PDF Pages", cat: "org", icon: "trash", desc: "Remove the pages you name and keep the rest.", accept: ["pdf"], verb: "Delete pages",
  options: [{ ...optPages("Pages to delete"), placeholder: "2, 5-7", hint: "Write pages like 2, 5-7 or odd / even." }],
  async run({ files: [f], opts: o }) {
    if (!o.pages.trim()) throw new Error("Write which pages to delete, for example 2, 5-7.");
    const del = new Set(parseRanges(o.pages, f.pages)), keep = [...Array(f.pages).keys()].filter(i => !del.has(i));
    if (!keep.length) throw new Error("That would delete every page. Leave at least one.");
    return { files: [one(f, "-trimmed", await subsetPdf(f.doc, keep))], note: `Deleted ${del.size} page${del.size === 1 ? "" : "s"}, kept ${keep.length}` };
  } });
tool({ id: "extract-pages", name: "Extract PDF Pages", cat: "org", icon: "copy", desc: "Keep only the pages you name, in the order you write them.", accept: ["pdf"], verb: "Extract pages",
  options: [{ ...optPages("Pages to keep"), placeholder: "1-3, 8", hint: "Write pages like 1-3, 8. The order you write is the order you get." }],
  async run({ files: [f], opts: o }) {
    if (!o.pages.trim()) throw new Error("Write which pages to keep, for example 1-3, 8.");
    const idx = parseRanges(o.pages, f.pages);
    return { files: [one(f, "-extract", await subsetPdf(f.doc, idx))], note: `Extracted ${idx.length} page${idx.length === 1 ? "" : "s"}` };
  } });

/* Compress */
async function inflateBytes(b) { return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()); }
function a85decode(b) {
  const out = []; let t = 0, n = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i]; if (c === 126) break; if (c <= 32) continue;
    if (c === 122 && n === 0) { out.push(0, 0, 0, 0); continue; }
    t = t * 85 + (c - 33);
    if (++n === 5) { out.push(t >>> 24 & 255, t >>> 16 & 255, t >>> 8 & 255, t & 255); t = 0; n = 0; }
  }
  if (n > 1) { for (let k = n; k < 5; k++) t = t * 85 + 84; for (let k = 0; k < n - 1; k++) out.push((t >>> (24 - 8 * k)) & 255); }
  return Uint8Array.from(out);
}
async function recompressImages(doc, { quality, maxSide, progress }) {
  const ctx = doc.context, N = s => PDFName.of(s), objs = [...ctx.enumerateIndirectObjects()]; let done = 0;
  const nameOf = v => v instanceof PDFName ? v.decodeText() : v instanceof PDFArray && v.size() === 1 && v.get(0) instanceof PDFName ? v.get(0).decodeText() : null;
  /* an image that carries a mask, or that is used as one, must keep its exact size: leave both alone or mask and picture drift out of register */
  const masked = new Set();
  for (const [, obj] of objs) {
    if (!(obj instanceof PDFRawStream)) continue;
    for (const k of ["SMask", "Mask"]) { const v = obj.dict.get(N(k)); if (v instanceof PDFRef) masked.add(v); }
  }
  for (const [ref, obj] of objs) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict; if (nameOf(d.get(N("Subtype"))) !== "Image") continue;
    if (masked.has(ref)) continue;
    const W = d.lookupMaybe(N("Width"), PDFNumber)?.asNumber(), H = d.lookupMaybe(N("Height"), PDFNumber)?.asNumber();
    if (!W || !H || W * H < 40000 || obj.contents.length < 12000) continue;
    if (d.has(N("Mask")) || d.has(N("SMask")) || d.has(N("Matte")) || d.has(N("Decode")) || d.has(N("ImageMask")) || d.lookupMaybe(N("BitsPerComponent"), PDFNumber)?.asNumber() !== 8) continue;
    const fv = d.lookup(N("Filter")); let filters = fv instanceof PDFName ? [fv.decodeText()] : fv instanceof PDFArray ? fv.asArray().map(x => x instanceof PDFName ? x.decodeText() : "?") : [], data = obj.contents;
    if (filters[0] === "ASCII85Decode") { data = a85decode(data); filters = filters.slice(1); }
    if (filters.length !== 1) continue;
    const filter = filters[0]; let cs = d.lookup(N("ColorSpace")), comps = 0;
    if (cs instanceof PDFName) comps = { DeviceRGB: 3, DeviceGray: 1 }[cs.decodeText()] || 0;
    else if (cs instanceof PDFArray && nameOf(cs.get(0)) === "ICCBased") comps = ctx.lookup(cs.get(1))?.dict?.lookupMaybe(N("N"), PDFNumber)?.asNumber() || 0;
    if (comps !== 1 && comps !== 3) continue;
    const k = Math.min(1, maxSide / Math.max(W, H)), nw = Math.max(1, Math.round(W * k)), nh = Math.max(1, Math.round(H * k));
    const cv = document.createElement("canvas"); cv.width = nw; cv.height = nh; const c = cv.getContext("2d");
    try {
      if (filter === "DCTDecode") c.drawImage(await createImageBitmap(new Blob([data], { type: "image/jpeg" })), 0, 0, nw, nh);
      else if (filter === "FlateDecode" && !d.has(N("DecodeParms"))) {
        const raw = await inflateBytes(data); if (raw.length < W * H * comps) continue;
        const px = new Uint8ClampedArray(W * H * 4);
        for (let i = 0, j = 0; i < W * H; i++, j += 4) { if (comps === 3) { px[j] = raw[i * 3]; px[j + 1] = raw[i * 3 + 1]; px[j + 2] = raw[i * 3 + 2]; } else px[j] = px[j + 1] = px[j + 2] = raw[i]; px[j + 3] = 255; }
        const src = document.createElement("canvas"); src.width = W; src.height = H; src.getContext("2d").putImageData(new ImageData(px, W, H), 0, 0);
        c.drawImage(src, 0, 0, nw, nh);
      } else continue;
    } catch { continue; }
    const jpg = await canvasBytes(cv, "image/jpeg", quality);
    if (jpg.length >= obj.contents.length * 0.92) continue;
    d.set(N("Filter"), N("DCTDecode")); d.set(N("ColorSpace"), N("DeviceRGB")); d.set(N("Width"), PDFNumber.of(nw)); d.set(N("Height"), PDFNumber.of(nh)); d.delete(N("DecodeParms"));
    ctx.assign(ref, PDFRawStream.of(d, jpg)); progress?.(`Recompressed ${++done} image${done === 1 ? "" : "s"}…`);
  }
  return done;
}
tool({ id: "compress", name: "Compress PDF", cat: "conv", icon: "compress", desc: "Make a PDF smaller, mostly by shrinking the pictures inside it.", accept: ["pdf"], multi: true, verb: "Compress",
  options: [{ id: "level", label: "Strength", type: "select", default: "balanced", choices: [["balanced", "Balanced: smaller pictures, text stays text"], ["strong", "Strong: much smaller pictures, text stays text"], ["max", "Maximum: every page becomes one picture"]] },
    { type: "info", label: "Maximum gives the smallest file for scans, but text can no longer be selected or searched.", show: o => o.level === "max" }],
  async run({ files, opts: o, progress }) {
    const out = []; let before = 0, after = 0;
    for (const f of files) {
      let data;
      if (o.level === "max") data = await rasterize(await openJs(f.bytes), { dpi: 110, quality: 0.6, progress });
      else { const doc = await freshDoc(f); await recompressImages(doc, o.level === "strong" ? { quality: 0.5, maxSide: 1300, progress } : { quality: 0.72, maxSide: 2200, progress }); data = await doc.save({ useObjectStreams: true }); }
      const kept = data.length >= f.size; if (kept) data = f.bytes;
      before += f.size; after += data.length;
      out.push(one(f, "-compressed", data, "pdf", kept ? "already compact, unchanged" : `${Math.round((1 - data.length / f.size) * 100)}% smaller`));
    }
    return { files: out, note: after < before ? `Saved ${Math.round((1 - after / before) * 100)}%: ${fmtSize(before)} down to ${fmtSize(after)}` : "No saving found: this file is already compact" };
  } });

/* Convert from PDF */
const optDpi = { id: "dpi", label: "Resolution", type: "select", default: "150", choices: [["72", "72 dpi, screen"], ["110", "110 dpi"], ["150", "150 dpi, good"], ["220", "220 dpi"], ["300", "300 dpi, print"]] };
function pdfToImages(ext, type, q) {
  return async ({ files: [f], opts: o, progress }) => {
    const js = await openJs(f.bytes), idx = parseRanges(o.pages, js.numPages), out = [];
    for (const i of idx) {
      progress(`Rendering page ${i + 1}…`);
      const { cv } = await renderPage(js, i + 1, { scale: +o.dpi / 72 });
      out.push(one(f, `-${String(i + 1).padStart(String(js.numPages).length, "0")}`, await canvasBlob(cv, type, q), ext)); cv.width = cv.height = 0;
    }
    return { files: out, note: `Made ${out.length} image${out.length === 1 ? "" : "s"}` };
  };
}
tool({ id: "pdf-to-jpg", name: "PDF to JPG", cat: "conv", icon: "image", desc: "Save each page as a JPG picture.", accept: ["pdf"], verb: "Convert to JPG", options: [optDpi, optPages()], run: pdfToImages("jpg", "image/jpeg", 0.9) });
tool({ id: "pdf-to-png", name: "PDF to PNG", cat: "conv", icon: "image", desc: "Save each page as a lossless PNG picture.", accept: ["pdf"], verb: "Convert to PNG", options: [optDpi, optPages()], run: pdfToImages("png", "image/png") });
tool({ id: "pdf-to-word", name: "PDF to Word", cat: "conv", icon: "file", desc: "Pull the text into an editable .docx file.", note: "Carries text, paragraphs and heading sizes. Pictures, columns and exact layout are not rebuilt, and scanned pages have no text to pull (use OCR first).",
  accept: ["pdf"], verb: "Convert to Word",
  async run({ files: [f], progress }) {
    const js = await openJs(f.bytes), paras = [];
    for (let i = 1; i <= js.numPages; i++) {
      progress(`Reading page ${i} of ${js.numPages}…`);
      paragraphs((await pageLines(js, i)).lines).forEach((p, k) => paras.push({ text: p.text, size: Math.max(8, Math.min(28, Math.round(p.size))), bold: p.head, breakBefore: i > 1 && k === 0 }));
    }
    if (!paras.length) throw new Error("No text was found. This PDF is probably a scan: run OCR on it first.");
    return [one(f, "", await makeDocx(paras), "docx")];
  } });
tool({ id: "pdf-to-excel", name: "PDF to Excel", cat: "conv", icon: "table", desc: "Rebuild tables as an .xlsx workbook, one sheet per page.", note: "Columns are found from where text lines up, so clean tables convert well and free-form pages convert poorly.",
  accept: ["pdf"], verb: "Convert to Excel",
  async run({ files: [f], progress }) {
    const js = await openJs(f.bytes), sheets = [];
    for (let i = 1; i <= js.numPages; i++) { progress(`Reading page ${i} of ${js.numPages}…`); const rows = linesToRows((await pageLines(js, i)).lines); if (rows.length) sheets.push({ name: `Page ${i}`, rows }); }
    if (!sheets.length) throw new Error("No text was found. This PDF is probably a scan: run OCR on it first.");
    return [one(f, "", await makeXlsx(sheets), "xlsx")];
  } });
tool({ id: "pdf-to-ppt", name: "PDF to PPT", cat: "conv", icon: "slides", desc: "Turn each page into a slide of a .pptx deck.", note: "Each slide is a picture of the page, so it presents faithfully but its text is not editable.",
  accept: ["pdf"], verb: "Convert to PowerPoint",
  async run({ files: [f], progress }) {
    await loadScript("./vendor/pptxgen.bundle.js");
    const js = await openJs(f.bytes), pp = new window.PptxGenJS(); let SW, SH;
    for (let i = 1; i <= js.numPages; i++) {
      progress(`Rendering page ${i} of ${js.numPages}…`);
      const { cv, w, h: ph } = await renderPage(js, i, { scale: 150 / 72 });
      if (i === 1) { SW = w / 72; SH = ph / 72; pp.defineLayout({ name: "PDF", width: SW, height: SH }); pp.layout = "PDF"; }
      const k = Math.min(SW / w, SH / ph), iw = w * k, ih = ph * k;
      pp.addSlide().addImage({ data: cv.toDataURL("image/jpeg", 0.88).slice(5), x: (SW - iw) / 2, y: (SH - ih) / 2, w: iw, h: ih }); cv.width = cv.height = 0;
    }
    return [one(f, "", await pp.write({ outputType: "arraybuffer" }), "pptx")];
  } });
tool({ id: "pdf-to-text", name: "PDF to Text", cat: "conv", icon: "text", desc: "Pull all the text into a plain .txt file.", accept: ["pdf"], verb: "Extract text",
  async run({ files: [f], progress }) {
    const { text } = await pdfText(await openJs(f.bytes), { progress });
    if (!text.replace(/\[Page \d+\]/g, "").trim()) throw new Error("No text was found. This PDF is probably a scan: run OCR on it first.");
    return { files: [one(f, "", text, "txt")], text };
  } });

/* Convert to PDF */
tool({ id: "jpg-to-pdf", name: "JPG to PDF", cat: "conv", icon: "image", desc: "Turn JPG, PNG, WebP, GIF or BMP pictures into one PDF.", accept: ["image"], multi: true, verb: "Convert to PDF",
  options: [{ id: "page", label: "Page size", type: "select", default: "fit", choices: [["fit", "Fit each picture"], ["a4", "A4"], ["letter", "US Letter"]] },
    { id: "margin", label: "Margin", type: "select", default: "0", choices: [["0", "None"], ["18", "Small"], ["40", "Large"]] }],
  async run({ files, opts: o, progress }) {
    const out = await PDFDocument.create();
    for (const f of files) { progress(`Adding ${f.name}…`); const d = await PDFDocument.load(await imageToPdf(f.file, { page: o.page, margin: +o.margin })); for (const p of await out.copyPages(d, [0])) out.addPage(p); }
    return [{ name: files.length === 1 ? baseName(files[0].name) + ".pdf" : "images.pdf", data: await out.save() }];
  } });
async function scanPage(file, look) {
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name} is not a picture this browser can read.`); }
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const c = cv.getContext("2d"); c.drawImage(bmp, 0, 0, cv.width, cv.height);
  if (look !== "color") {
    const im = c.getImageData(0, 0, cv.width, cv.height), d = im.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = l; hist[l]++; }
    let lo = 0, hi = 255, n = d.length / 4, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc < n * 0.03) lo = v; if (acc < n * 0.6) hi = v; }
    if (look === "gray") { lo = Math.min(lo, 40); hi = 255; } const span = Math.max(30, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / span)); d[i] = d[i + 1] = d[i + 2] = v; }
    c.putImageData(im, 0, 0);
  }
  return { jpg: await canvasBytes(cv, "image/jpeg", 0.8), w: cv.width, h: cv.height };
}
tool({ id: "scan", name: "PDF Scanner", cat: "conv", icon: "scan", desc: "Photograph paper pages with your phone camera and save them as one PDF.", note: "On a phone, Take a photo opens the camera. On a computer it opens the file picker. Photos are not straightened or cropped for you.", accept: ["image"], multi: true, camera: true, verb: "Make PDF",
  options: [{ id: "look", label: "Clean-up", type: "select", default: "doc", choices: [["doc", "Document: white paper, dark text"], ["gray", "Greyscale"], ["color", "Keep colours"]] },
    { id: "page", label: "Page size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"], ["fit", "Same shape as the photo"]] }],
  async run({ files, opts: o, progress }) {
    const out = await PDFDocument.create();
    for (const [i, f] of files.entries()) {
      progress(`Cleaning page ${i + 1} of ${files.length}…`);
      const s = await scanPage(f.file, o.look), img = await out.embedJpg(s.jpg); let W, H;
      if (o.page === "fit") { const k = 842 / Math.max(s.w, s.h); W = s.w * k; H = s.h * k; } else { [W, H] = o.page === "letter" ? [612, 792] : [595.28, 841.89]; if (s.w > s.h) [W, H] = [H, W]; }
      const k = Math.min(W / s.w, H / s.h); out.addPage([W, H]).drawImage(img, { x: (W - s.w * k) / 2, y: (H - s.h * k) / 2, width: s.w * k, height: s.h * k });
    }
    return { files: [{ name: "scan.pdf", data: await out.save() }], note: `Scanned ${files.length} page${files.length === 1 ? "" : "s"}` };
  } });
const TOPDF_NOTE = "Rebuilds text, headings, lists and tables on clean pages. Pictures, fonts, colours and exact layout are not carried over.";
tool({ id: "to-pdf", name: "TXT, HTML, CSV, EPUB, ZIP to PDF", cat: "conv", icon: "file", desc: "Also takes RTF, ODT, ODS, ODP and the preview inside Apple Pages, Numbers and Keynote files. A ZIP becomes one PDF.", note: TOPDF_NOTE,
  accept: ["txt", "md", "rtf", "html", "htm", "csv", "tsv", "epub", "zip", "odt", "ods", "odp", "docx", "xlsx", "pptx", "pages", "numbers", "key"], multi: true, verb: "Convert to PDF",
  options: [{ id: "size", label: "Page size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"]] }, { id: "fs", label: "Text size", type: "select", default: "11", choices: [["9", "Small"], ["11", "Normal"], ["13", "Large"]] },
    { id: "join", label: "Combine everything into one PDF", type: "check", default: false, show: (o, tv) => tv.files.length > 1 }],
  async run({ files, opts: o, progress }) {
    const out = [];
    for (const f of files) { progress(`Converting ${f.name}…`); out.push(one(f, "", await anyToPdf(f.name, await bytesOf(f), { size: o.size, fs: +o.fs }))); }
    if (o.join && out.length > 1) { const all = await PDFDocument.create(); for (const x of out) { const d = await PDFDocument.load(x.data); for (const p of await all.copyPages(d, d.getPageIndices())) all.addPage(p); } return [{ name: "combined.pdf", data: await all.save() }]; }
    return out;
  } });
alias("to-pdf", { id: "word-to-pdf", base: "to-pdf", name: "Word to PDF", icon: "file", desc: "Convert .docx, .odt, .rtf or .txt documents to PDF.", accept: ["docx", "doc", "odt", "rtf", "txt"] });
alias("to-pdf", { id: "excel-to-pdf", base: "to-pdf", name: "Excel to PDF", icon: "table", desc: "Convert .xlsx, .ods or .csv sheets to PDF tables.", accept: ["xlsx", "xls", "ods", "csv"], note: TOPDF_NOTE + " Dates stored as serial numbers show as numbers." });
alias("to-pdf", { id: "ppt-to-pdf", base: "to-pdf", name: "PPT to PDF", icon: "slides", desc: "Convert .pptx or .odp slides to a PDF of their text.", accept: ["pptx", "ppt", "odp"], note: "Carries each slide's title and text only, one slide per page. Pictures, shapes and design are not carried over." });
tool({ id: "converter", name: "PDF Converter", cat: "conv", icon: "swap", desc: "Drop anything: PDFs convert to the format you pick, everything else converts to PDF.", accept: ["*"], multi: true, verb: "Convert",
  options: [{ id: "to", label: "Convert PDFs to", type: "select", default: "word", choices: [["word", "Word (.docx)"], ["excel", "Excel (.xlsx)"], ["ppt", "PowerPoint (.pptx)"], ["jpg", "JPG pictures"], ["png", "PNG pictures"], ["text", "Plain text"]], show: (o, tv) => tv.files.some(f => f.kind === "pdf") }],
  async run({ files, opts: o, progress }) {
    const out = [];
    for (const f of files) {
      if (f.kind === "pdf") { const r = await TOOL["pdf-to-" + o.to].run({ files: [f], opts: { dpi: "150", pages: "" }, progress }); out.push(...(Array.isArray(r) ? r : r.files)); }
      else { progress(`Converting ${f.name}…`); out.push(one(f, "", await anyToPdf(f.name, await bytesOf(f)))); }
    }
    return out;
  } });

/* Edit: stamped content */
tool({ id: "number-pages", name: "Number Pages", cat: "edit", icon: "hash", desc: "Print page numbers in a corner or along an edge.", accept: ["pdf"], verb: "Add page numbers",
  options: [{ id: "pos", label: "Position", type: "select", default: "bc", choices: [["bc", "Bottom centre"], ["br", "Bottom right"], ["bl", "Bottom left"], ["tc", "Top centre"], ["tr", "Top right"], ["tl", "Top left"]] },
    { id: "fmt", label: "Format", type: "select", default: "n", choices: [["n", "1"], ["nN", "1 / 12"], ["page", "Page 1"], ["pageN", "Page 1 of 12"]] },
    { id: "start", label: "First number", type: "number", default: 1 }, { id: "size", label: "Text size", type: "select", default: "10", choices: [["8", "Small"], ["10", "Normal"], ["13", "Large"]] },
    { ...optPages("Pages to number"), hint: "Numbering starts on the first page you list. Empty means all pages." }],
  async run({ files: [f], opts: o }) {
    const doc = await freshDoc(f), font = await doc.embedFont(StandardFonts.Helvetica), idx = parseRanges(o.pages, f.pages), size = +o.size, m = 28;
    const start = Math.floor(o.start) || 1, last = start + idx.length - 1;
    for (const [k, pi] of idx.entries()) {
      const n = start + k, text = { n: `${n}`, nN: `${n} / ${last}`, page: `Page ${n}`, pageN: `Page ${n} of ${last}` }[o.fmt], w = font.widthOfTextAtSize(text, size), page = doc.getPage(pi);
      await inView(page, v => page.drawText(text, { x: o.pos[1] === "l" ? m : o.pos[1] === "r" ? v.W - m - w : (v.W - w) / 2, y: o.pos[0] === "t" ? v.H - m - size * 0.7 : m, size, font, color: rgb(.12, .12, .15) }));
    }
    return { files: [one(f, "-numbered", await doc.save())], note: `Numbered ${idx.length} page${idx.length === 1 ? "" : "s"}` };
  } });
tool({ id: "watermark", name: "Watermark PDF", cat: "edit", icon: "drop", desc: "Stamp text such as DRAFT or CONFIDENTIAL across pages.", accept: ["pdf"], verb: "Add watermark",
  options: [{ id: "text", label: "Watermark text", type: "text", default: "CONFIDENTIAL" },
    { id: "layout", label: "Layout", type: "select", default: "diag", choices: [["diag", "Diagonal, centred"], ["flat", "Horizontal, centred"], ["tile", "Repeated across the page"]] },
    { id: "color", label: "Colour", type: "select", default: "#6b7280", choices: [["#6b7280", "Grey"], ["#c8102e", "Red"], ["#16296b", "Blue"], ["#000000", "Black"]] },
    { id: "opacity", label: "Opacity", type: "range", default: 25, min: 5, max: 90, step: 5, fmt: v => v + "%" }, optPages("Pages to mark")],
  async run({ files: [f], opts: o }) {
    const text = cleanText(o.text).trim(); if (!text) throw new Error("Write the watermark text first.");
    const doc = await freshDoc(f), font = await doc.embedFont(StandardFonts.HelveticaBold), idx = parseRanges(o.pages, f.pages), enc = canEncode(font, text), opacity = o.opacity / 100;
    const stamp = async (page, cx, cy, size, deg) => {
      const th = deg * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
      if (enc) { const w = font.widthOfTextAtSize(text, size), up = size * 0.35; page.drawText(text, { x: cx - w / 2 * cos + up * sin, y: cy - w / 2 * sin - up * cos, size, font, color: hexRgb(o.color), opacity, rotate: degrees(deg) }); }
      else { const im = await textImage(doc, text, size, o.color, { b: true }); page.drawImage(im.img, { x: cx - im.w / 2 * cos + im.h / 2 * sin, y: cy - im.w / 2 * sin - im.h / 2 * cos, width: im.w, height: im.h, opacity, rotate: degrees(deg) }); }
    };
    for (const pi of idx) {
      const page = doc.getPage(pi);
      await inView(page, async v => {
        const w1 = textWidth(font, text, 1, { b: true });
        if (o.layout === "tile") { const size = Math.max(14, Math.min(v.W, v.H) / 22), sx = w1 * size + size * 4, sy = size * 7; for (let y = sy / 2, r = 0; y < v.H + sy; y += sy, r++) for (let x = (r % 2 ? 0 : sx / 2); x < v.W + sx; x += sx) await stamp(page, x, y, size, 30); }
        else { const diag = o.layout === "diag", span = diag ? Math.hypot(v.W, v.H) * 0.72 : v.W * 0.8; await stamp(page, v.W / 2, v.H / 2, Math.min(span / w1, v.H / 4), diag ? Math.atan2(v.H, v.W) * 180 / Math.PI : 0); }
      });
    }
    return { files: [one(f, "-watermarked", await doc.save())], note: `Marked ${idx.length} page${idx.length === 1 ? "" : "s"}` };
  } });
const prettyField = n => n.split(".").pop().replace(/\[\d+\]/g, "").replace(/[_-]+/g, " ").trim() || n;
tool({ id: "form-filler", name: "PDF Form Filler", cat: "edit", icon: "form", desc: "Fill in a PDF's form fields and save the answers.", accept: ["pdf"], verb: "Fill form",
  async prepare([f], opts) {
    const fields = (await freshDoc(f)).getForm().getFields(), dyn = [];
    fields.forEach((fd, i) => {
      let o = null;
      try {
        if (fd instanceof PL.PDFTextField) o = { type: fd.isMultiline() ? "textarea" : "text", default: fd.getText() || "" };
        else if (fd instanceof PL.PDFCheckBox) o = { type: "check", default: fd.isChecked() };
        else if (fd instanceof PL.PDFRadioGroup) o = { type: "select", choices: [["", "(none)"], ...fd.getOptions().map(x => [x, x])], default: fd.getSelected() || "" };
        else if (fd instanceof PL.PDFDropdown || fd instanceof PL.PDFOptionList) o = { type: "select", choices: [["", "(none)"], ...fd.getOptions().map(x => [x, x])], default: fd.getSelected()[0] || "" };
      } catch { o = null; }
      if (o) { dyn.push({ ...o, id: "f" + i, label: prettyField(fd.getName()), fname: fd.getName(), wide: o.type === "textarea" }); opts["f" + i] = o.default; }
    });
    if (!dyn.length) return [{ type: "info", label: "This PDF has no fillable form fields. Open it in Edit PDF to type onto the page instead." }];
    opts.flat = false; dyn.push({ id: "flat", type: "check", label: "Flatten after filling, so the answers can no longer be changed", wide: true });
    return dyn;
  },
  async run({ files: [f], opts: o, dyn }) {
    const fields = (dyn || []).filter(d => d.fname); if (!fields.length) throw new Error("This PDF has no fillable form fields. Use Edit PDF instead.");
    const doc = await freshDoc(f), form = doc.getForm(); let n = 0;
    for (const d of fields) {
      const fd = form.getField(d.fname), v = o[d.id];
      try {
        if (fd instanceof PL.PDFTextField) fd.setText(v ? cleanText(v).replace(/[^\u0000-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/g, "?") : undefined);
        else if (fd instanceof PL.PDFCheckBox) v ? fd.check() : fd.uncheck();
        else if (fd instanceof PL.PDFRadioGroup) { if (v) fd.select(v); }
        else if (v) fd.select(v); else fd.clear();
        n++;
      } catch (e) { console.warn("field", d.fname, e); }
    }
    if (o.flat) form.flatten();
    return { files: [one(f, "-filled", await doc.save())], note: `Filled ${n} field${n === 1 ? "" : "s"}` + (o.flat ? " and flattened" : "") };
  } });

/* Editor tools */
tool({ id: "edit", name: "Edit PDF", cat: "edit", icon: "pen", desc: "Add text, shapes, pictures and freehand marks on top of the pages.", note: "Adds content on top of the page. Existing text is covered with the whiteout tool, not rewritten.", accept: ["pdf"], editor: "edit" });
tool({ id: "annotate", name: "PDF Annotator", cat: "edit", icon: "mark", desc: "Highlight, draw and write notes on a PDF.", accept: ["pdf"], editor: "annotate" });
tool({ id: "reader", name: "PDF Reader", cat: "edit", icon: "eye", desc: "Open and read a PDF, with zoom.", accept: ["pdf"], editor: "read" });
tool({ id: "crop", name: "Crop PDF", cat: "edit", icon: "crop", desc: "Drag a box around what to keep and trim away the rest.", accept: ["pdf"], editor: "crop" });
tool({ id: "redact", name: "Redact PDF", cat: "edit", icon: "bar", desc: "Black out sensitive areas for good.", note: "Each page you mark is rebuilt as a picture with the boxes burned in, so the hidden text is gone from the file, not just covered.", accept: ["pdf"], editor: "redact" });

/* Sign and protect */
tool({ id: "sign", name: "Sign PDF", cat: "sec", icon: "sign", desc: "Draw, type or upload your signature and place it on the page.", note: "This places a picture of your signature. It is not a certificate-based digital signature.", accept: ["pdf"], editor: "sign" });
tool({ id: "protect", name: "Protect PDF", cat: "sec", icon: "lock", desc: "Encrypt a PDF so it opens only with a password.", note: "Uses AES-256, the strongest encryption in the PDF standard. Pick a long password: nobody, including this tool, can recover the file if it is lost.", accept: ["pdf"], verb: "Protect with password",
  options: [{ id: "pw", label: "Password", type: "password", default: "" }, { id: "pw2", label: "Repeat password", type: "password", default: "" }],
  async run({ files: [f], opts: o }) {
    if (!o.pw) throw new Error("Choose a password first.");
    if (o.pw !== o.pw2) throw new Error("The two passwords do not match.");
    const plain = await (await freshDoc(f)).save({ useObjectStreams: false });
    return { files: [one(f, "-protected", await encryptPdf(plain, o.pw))], note: "Encrypted. Keep the password safe" };
  } });
tool({ id: "unlock", name: "Unlock PDF", cat: "sec", icon: "unlock", desc: "Remove the password from a PDF you are allowed to open.", note: "You must know the password. The unlocked copy is rebuilt from pictures of each page, so it looks identical but its text cannot be selected.", accept: ["pdf"], allowLocked: true, verb: "Unlock",
  options: [{ id: "pw", label: "Password", type: "password", default: "", hint: "Leave empty if the file opens without one and only blocks printing or copying." }],
  async run({ files: [f], opts: o, progress }) {
    if (!f.locked) throw new Error("This PDF is not password-protected. There is nothing to unlock.");
    const js = await openJs(f.bytes, o.pw || undefined);
    return { files: [one(f, "-unlocked", await rasterize(js, { dpi: 170, quality: 0.86, progress }))], note: "Unlocked copy made" };
  } });
tool({ id: "flatten", name: "Flatten PDF", cat: "sec", icon: "layers", desc: "Lock form answers into the page so they can no longer be edited.", accept: ["pdf"], verb: "Flatten",
  options: [{ id: "all", label: "Flatten everything: turn each page into one picture", type: "check", default: false, wide: true, hint: "Stops all editing and copying of text, at the cost of selectable text." }],
  async run({ files: [f], opts: o, progress }) {
    if (o.all) return { files: [one(f, "-flattened", await rasterize(await openJs(f.bytes), { dpi: 170, quality: 0.86, progress }))], note: "Every page is now a picture" };
    const doc = await freshDoc(f), form = doc.getForm(), n = form.getFields().length;
    if (!n) throw new Error("This PDF has no form fields to flatten. Tick the box to flatten whole pages instead.");
    form.flatten();
    return { files: [one(f, "-flattened", await doc.save())], note: `Flattened ${n} form field${n === 1 ? "" : "s"}` };
  } });
