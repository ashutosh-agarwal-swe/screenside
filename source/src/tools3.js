/* ---------- metadata editor / scrubber ---------- */
const META_FIELDS = [
  ["Title", "Title"], ["Author", "Author"], ["Subject", "Subject"], ["Keywords", "Keywords, separated by commas"],
  ["Creator", "Made with (app that created it)"], ["Producer", "Saved by (app that last saved it)"],
];
tool({ id: "metadata", name: "PDF Metadata", cat: "sec", icon: "form",
  desc: "See, edit or wipe the details stored inside the file: title, author, software.",
  note: "Emptying a box deletes that detail from the saved copy. The hidden metadata block (XMP) is always dropped. The inspector lists what a file carries now.",
  accept: ["pdf"], verb: "Save metadata",
  async prepare([f], opts) {
    let doc; try { doc = repairStreams(await PDFDocument.load(f.bytes, { updateMetadata: false })); } catch (e) { throw pdfError(e); }
    const get = k => { try { return cleanText(doc.getInfoDict().lookup(PDFName.of(k))?.decodeText?.() ?? ""); } catch { return ""; } };
    const dyn = META_FIELDS.map(([key, label]) => ({ id: "m_" + key.toLowerCase(), label, type: "text", default: get(key) }));
    for (const d of dyn) opts[d.id] = d.default;
    const date = d => d ? ` ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : " not recorded";
    dyn.push({ type: "info", label: "Dates: created" + date(doc.getCreationDate()) + " · last changed" + date(doc.getModificationDate()) + ". Dates stay as they are in the saved copy.", wide: true });
    return dyn;
  },
  async run({ files: [f], opts: o }) {
    let doc; try { doc = repairStreams(await PDFDocument.load(f.bytes, { updateMetadata: false })); } catch (e) { throw pdfError(e); }
    const info = doc.getInfoDict(), N = s => PDFName.of(s);
    const set = { title: v => doc.setTitle(v), author: v => doc.setAuthor(v), subject: v => doc.setSubject(v),
      keywords: v => doc.setKeywords(v.split(",").map(s => s.trim()).filter(Boolean)), creator: v => doc.setCreator(v), producer: v => doc.setProducer(v) };
    for (const [key] of META_FIELDS) {
      const v = cleanText(o["m_" + key.toLowerCase()] || "").trim();
      if (v) set[key.toLowerCase()](v); else info.delete(N(key));
    }
    const meta = doc.catalog.get(N("Metadata"));
    if (meta instanceof PDFRef) { const st = doc.context.lookup(meta); if (st instanceof PL.PDFStream) doc.context.assign(meta, PDFRawStream.of(st.dict, new Uint8Array(0))); }
    doc.catalog.delete(N("Metadata"));
    return { files: [one(f, "-metadata", await doc.save({ useObjectStreams: false }))], note: "Metadata updated" };
  } });

/* ---------- pull embedded pictures out ---------- */
tool({ id: "extract-images", name: "Extract Images", cat: "conv", icon: "copy",
  desc: "Pull the pictures embedded in a PDF out as JPG or PNG files.",
  note: "JPEG pictures come out byte-for-byte; others are rebuilt as PNG, which drops any transparency mask. Pictures stored as JPEG 2000 or fax encodings cannot be decoded in a browser and are skipped.",
  accept: ["pdf"], verb: "Extract images",
  async run({ files: [f], progress }) {
    const doc = await freshDoc(f), ctx = doc.context, N = s => PDFName.of(s), out = [];
    const nameOf = v => v instanceof PDFName ? v.decodeText() : v instanceof PDFArray && v.size() === 1 && v.get(0) instanceof PDFName ? v.get(0).decodeText() : null;
    let skipped = 0;
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict; if (nameOf(d.get(N("Subtype"))) !== "Image") continue;
      const W = d.lookupMaybe(N("Width"), PDFNumber)?.asNumber(), H = d.lookupMaybe(N("Height"), PDFNumber)?.asNumber();
      if (!W || !H || d.has(N("ImageMask"))) continue;
      const fv = d.lookup(N("Filter")), filters = fv instanceof PDFName ? [fv.decodeText()] : fv instanceof PDFArray ? fv.asArray().map(x => x instanceof PDFName ? x.decodeText() : "?") : [];
      let data = obj.contents;
      if (filters[0] === "ASCII85Decode") { data = a85decode(data); filters.shift(); }
      if (filters.length !== 1) { skipped++; continue; }
      if (filters[0] === "DCTDecode") { out.push({ name: `${baseName(f.name)}-img${out.length + 1}.jpg`, data }); }
      else if (filters[0] === "FlateDecode" && !d.has(N("DecodeParms")) && !d.has(N("Decode"))) {
        const cs = d.lookup(N("ColorSpace")), bpc = d.lookupMaybe(N("BitsPerComponent"), PDFNumber)?.asNumber();
        const comps = cs instanceof PDFName ? ({ DeviceRGB: 3, DeviceGray: 1 }[cs.decodeText()] || 0) : 0;
        if (!comps || bpc !== 8) { skipped++; continue; }
        try {
          const raw = await inflateBytes(data); if (raw.length < W * H * comps) { skipped++; continue; }
          const px = new Uint8ClampedArray(W * H * 4);
          for (let i = 0, j = 0; i < W * H; i++, j += 4) { if (comps === 3) { px[j] = raw[i * 3]; px[j + 1] = raw[i * 3 + 1]; px[j + 2] = raw[i * 3 + 2]; } else px[j] = px[j + 1] = px[j + 2] = raw[i]; px[j + 3] = 255; }
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          cv.getContext("2d").putImageData(new ImageData(px, W, H), 0, 0);
          out.push({ name: `${baseName(f.name)}-img${out.length + 1}.png`, data: await canvasBytes(cv, "image/png") });
          cv.width = cv.height = 0;
        } catch { skipped++; }
      } else skipped++;
      progress?.(`Found ${out.length} picture${out.length === 1 ? "" : "s"}…`);
    }
    if (!out.length) throw new Error(skipped ? `The file holds ${skipped} picture${skipped === 1 ? "" : "s"}, but none in a format a browser can decode.` : "This PDF has no embedded pictures.");
    return { files: out, note: `Extracted ${out.length} picture${out.length === 1 ? "" : "s"}` + (skipped ? ` · skipped ${skipped} in other formats` : "") };
  } });

/* ---------- several pages per sheet, or a booklet ---------- */
const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
/* embedPage refuses a page with no Contents stream (a truly blank page) — give it an empty one first.
   Its BBox clips content in unrotated page space, so pass the CropBox itself; the Matrix rotates it
   into displayed space. ep.width/height are then the display size, not the clipped CropBox's. */
const embedPage = async (out, page) => {
  if (!page.node.has(PDFName.of("Contents"))) page.node.set(PDFName.of("Contents"), page.doc.context.obj([]));
  const cb = page.getCropBox(), R = ((page.getRotation().angle % 360) + 360) % 360, th = R * Math.PI / 180;
  const cw = R % 180 ? cb.height : cb.width, ch = R % 180 ? cb.width : cb.height;
  const z = v => Math.abs(v) < 1e-9 ? 0 : v, cos = z(Math.cos(th)), sin = z(Math.sin(th));
  const rot = (x, y) => [x * cos + y * sin, -x * sin + y * cos];
  const cs = [[cb.x, cb.y], [cb.x + cb.width, cb.y], [cb.x + cb.width, cb.y + cb.height], [cb.x, cb.y + cb.height]].map(p => rot(...p));
  const minX = Math.min(...cs.map(c => c[0])), minY = Math.min(...cs.map(c => c[1]));
  const ep = await out.embedPage(page, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height }, [cos, -sin, sin, cos, -minX, -minY]);
  ep.width = cw; ep.height = ch;
  return ep;
};
const placePage = (p, ep, cx, cy, cw, ch) => {
  const k = Math.min(cw / ep.width, ch / ep.height), w = ep.width * k, hh = ep.height * k;
  p.drawPage(ep, { x: cx + (cw - w) / 2, y: cy + (ch - hh) / 2, width: w, height: hh });
};
tool({ id: "nup", name: "N-up and Booklet", cat: "org", icon: "grid",
  desc: "Put two or four pages on each sheet, or reorder pages into a booklet for printing and folding.",
  note: "Booklet reorders pages so that printing double-sided and folding the stack gives a readable booklet; empty half-pages are added when the count is not a multiple of four. Page links and form fields are not carried over.",
  accept: ["pdf"], verb: "Impose pages",
  options: [{ id: "layout", label: "Layout", type: "select", default: "2up", choices: [["2up", "2 pages per sheet, landscape"], ["4up", "4 pages per sheet, portrait"], ["booklet", "Booklet, ready to print double-sided and fold"]] },
    { id: "paper", label: "Sheet size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"]] },
    optPages("Pages to include")],
  async run({ files: [f], opts: o }) {
    const idx = parseRanges(o.pages, f.pages), [pw, ph] = PAPER[o.paper], out = await PDFDocument.create();
    const emb = []; for (const i of idx) emb.push(await embedPage(out, f.doc.getPage(i)));
    if (o.layout === "booklet") {
      while (emb.length % 4) emb.push(null);
      const N = emb.length, order = [];
      for (let i = 0; i < N / 4; i++) { order.push([N - 1 - 2 * i, 2 * i]); order.push([2 * i + 1, N - 2 - 2 * i]); }
      for (const [l, r] of order) {
        const p = out.addPage([ph, pw]);
        if (emb[l]) placePage(p, emb[l], 0, 0, ph / 2, pw);
        if (emb[r]) placePage(p, emb[r], ph / 2, 0, ph / 2, pw);
      }
      return { files: [one(f, "-booklet", await out.save())], note: `Booklet of ${order.length} sheets (print double-sided, flip on the short edge)` };
    }
    const cells = o.layout === "2up" ? [[ph, pw], [[0, 0, ph / 2, pw], [ph / 2, 0, ph / 2, pw]]] : [[pw, ph], [[0, ph / 2, pw / 2, ph / 2], [pw / 2, ph / 2, pw / 2, ph / 2], [0, 0, pw / 2, ph / 2], [pw / 2, 0, pw / 2, ph / 2]]];
    for (let i = 0; i < emb.length; i += cells[1].length) {
      const p = out.addPage(cells[0]);
      for (const [k, cell] of cells[1].entries()) if (emb[i + k]) placePage(p, emb[i + k], ...cell);
    }
    return { files: [one(f, "-nup", await out.save())], note: `Placed ${idx.length} page${idx.length === 1 ? "" : "s"} on ${out.getPageCount()} sheet${out.getPageCount() === 1 ? "" : "s"}` };
  } });

/* ---------- all pages onto one paper size ---------- */
tool({ id: "resize", name: "Resize Pages", cat: "org", icon: "rect",
  desc: "Scale every page onto A4 or US Letter, centred, without turning pages into pictures.",
  note: "Text stays text and can still be selected. Page links and form fields are not carried over.",
  accept: ["pdf"], verb: "Resize pages",
  options: [{ id: "paper", label: "Page size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"]] },
    { id: "mode", label: "Which pages", type: "select", default: "both", choices: [["both", "Shrink and enlarge to fit"], ["down", "Only shrink pages that are larger"]] },
    { id: "orient", label: "Orientation", type: "select", default: "keep", choices: [["keep", "Follow each page's shape"], ["portrait", "Always portrait"], ["landscape", "Always landscape"]] },
    optPages("Pages to resize")],
  async run({ files: [f], opts: o }) {
    const idx = parseRanges(o.pages, f.pages), [pw, ph] = PAPER[o.paper], out = await PDFDocument.create();
    for (const i of idx) {
      const ep = await embedPage(out, f.doc.getPage(i)), land = ep.width > ep.height;
      let [W, H] = o.orient === "portrait" ? [pw, ph] : o.orient === "landscape" ? [ph, pw] : land ? [ph, pw] : [pw, ph];
      let k = Math.min(W / ep.width, H / ep.height); if (o.mode === "down") k = Math.min(1, k);
      const w = ep.width * k, hh = ep.height * k;
      out.addPage([W, H]).drawPage(ep, { x: (W - w) / 2, y: (H - hh) / 2, width: w, height: hh });
    }
    return { files: [one(f, "-resized", await out.save())], note: `Resized ${idx.length} page${idx.length === 1 ? "" : "s"} to ${o.paper === "a4" ? "A4" : "US Letter"}` };
  } });

/* ---------- grayscale ---------- */
const lumaCanvas = cv => {
  const c = cv.getContext("2d"), im = c.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = d[i + 1] = d[i + 2] = l; }
  c.putImageData(im, 0, 0); return cv;
};
tool({ id: "grayscale", name: "Grayscale PDF", cat: "conv", icon: "drop",
  desc: "Turn a colour PDF into shades of grey, for printing without colour ink.",
  accept: ["pdf"], verb: "Convert to greyscale",
  options: [optDpi, optPages()],
  async run({ files: [f], opts: o, progress }) {
    const js = await openJs(f.bytes), idx = parseRanges(o.pages, f.pages), out = await PDFDocument.create();
    for (const i of idx) {
      progress(`Rendering page ${i + 1}…`);
      const { cv, w, h: ph } = await renderPage(js, i + 1, { scale: +o.dpi / 72 });
      const img = await out.embedJpg(await canvasBytes(lumaCanvas(cv), "image/jpeg", 0.85));
      out.addPage([w, ph]).drawImage(img, { x: 0, y: 0, width: w, height: ph });
      cv.width = cv.height = 0;
    }
    return { files: [one(f, "-gray", await out.save())], note: `Greyscaled ${idx.length} page${idx.length === 1 ? "" : "s"}. Each is now a picture: text can no longer be selected or searched` };
  } });

/* ---------- bates numbers / headers and footers ---------- */
tool({ id: "stamp", name: "Stamp Pages", cat: "edit", icon: "text",
  desc: "Print the same text on every page, with an automatic counter — Bates numbers, case names, dates.",
  accept: ["pdf"], verb: "Stamp pages",
  options: [{ id: "text", label: "Text", type: "text", default: "Exhibit A-{n}", hint: "{n} becomes the counter, {total} the last number. For example: Exhibit A-{n}." },
    { id: "pos", label: "Position", type: "select", default: "br", choices: [["bc", "Bottom centre"], ["br", "Bottom right"], ["bl", "Bottom left"], ["tc", "Top centre"], ["tr", "Top right"], ["tl", "Top left"]] },
    { id: "start", label: "First number", type: "number", default: 1 },
    { id: "size", label: "Text size", type: "select", default: "10", choices: [["8", "Small"], ["10", "Normal"], ["13", "Large"]] },
    { ...optPages("Pages to stamp"), hint: "The counter starts on the first page you list. Empty means all pages." }],
  async run({ files: [f], opts: o }) {
    const tpl = cleanText(o.text).trim(); if (!tpl) throw new Error("Write the text to stamp first.");
    const doc = await freshDoc(f), font = await doc.embedFont(StandardFonts.Helvetica), idx = parseRanges(o.pages, f.pages), size = +o.size, m = 28;
    const start = Math.floor(o.start) || 1, last = start + idx.length - 1;
    for (const [k, pi] of idx.entries()) {
      const text = tpl.replaceAll("{n}", String(start + k)).replaceAll("{total}", String(last)), w = textWidth(font, text, size);
      await inView(doc.getPage(pi), v => drawTextSmart(doc.getPage(pi), doc, font, text, { x: o.pos[1] === "l" ? m : o.pos[1] === "r" ? v.W - m - w : (v.W - w) / 2, y: o.pos[0] === "t" ? v.H - m - size * 0.7 : m, size, color: "#1f1f24" }));
    }
    return { files: [one(f, "-stamped", await doc.save())], note: `Stamped ${idx.length} page${idx.length === 1 ? "" : "s"}` };
  } });

/* ---------- repair a damaged file ---------- */
tool({ id: "repair", name: "Repair PDF", cat: "conv", icon: "check",
  desc: "Re-save a PDF that opens with errors or whose last change never finished writing.",
  note: "The file is rebuilt from what can still be read. Content written by a damaged last save may be lost. If the file opens fine, there is nothing to repair.",
  accept: ["pdf"], verb: "Repair file",
  async run({ files: [f] }) {
    let doc;
    try { doc = repairStreams(await PDFDocument.load(f.bytes)); }
    catch (e) {
      try { doc = repairStreams(await PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false })); }
      catch (e2) { throw pdfError(e); }
    }
    return { files: [one(f, "-repaired", await doc.save({ useObjectStreams: false }))], note: `Rebuilt ${doc.getPageCount()} page${doc.getPageCount() === 1 ? "" : "s"} into a clean file` };
  } });

/* ---------- straighten scanned pages ---------- */
async function skewAngle(cv) {
  const k = Math.min(1, 420 / Math.max(cv.width, cv.height)), w = Math.max(40, Math.round(cv.width * k)), hh = Math.max(40, Math.round(cv.height * k));
  const a = document.createElement("canvas"); a.width = w; a.height = hh;
  const ac = a.getContext("2d", { willReadFrequently: true }); ac.drawImage(cv, 0, 0, w, hh);
  const scratch = document.createElement("canvas"); scratch.width = w; scratch.height = hh;
  const sc = scratch.getContext("2d", { willReadFrequently: true });
  const score = deg => {
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, w, hh);
    sc.translate(w / 2, hh / 2); sc.rotate(deg * Math.PI / 180); sc.drawImage(a, -w / 2, -hh / 2);
    const d = sc.getImageData(0, 0, w, hh).data, rows = new Float64Array(hh);
    for (let y = 0; y < hh; y++) { let s = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 100 && (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8 < 150) s++; } rows[y] = s; }
    let m = 0; for (const r of rows) m += r; m /= hh; let v = 0; for (const r of rows) v += (r - m) * (r - m);
    return v;
  };
  const s0 = score(0); let best = 0, bs = s0;
  for (let deg = -4; deg <= 4; deg += 0.25) { if (!deg) continue; const s = score(deg); if (s > s0 * 1.02 && s > bs) { bs = s; best = deg; } }
  return best;
}
tool({ id: "deskew", name: "Straighten a Scan", cat: "conv", icon: "rotL",
  desc: "Straighten pages that were scanned or photographed at a slight tilt.",
  note: "Finds each page's tilt by eye (up to about 4 degrees) and re-renders it straightened. Every page becomes a picture, so text can no longer be selected or searched.",
  accept: ["pdf"], verb: "Straighten pages",
  options: [optDpi, optPages()],
  async run({ files: [f], opts: o, progress }) {
    const js = await openJs(f.bytes), idx = parseRanges(o.pages, f.pages), out = await PDFDocument.create(), fixed = [];
    for (const i of idx) {
      progress(`Measuring page ${i + 1}…`);
      let { cv, w, h: ph } = await renderPage(js, i + 1, { scale: +o.dpi / 72 });
      const deg = await skewAngle(cv); if (deg) fixed.push([i + 1, deg]);
      if (deg) {
        const rc = document.createElement("canvas"); rc.width = cv.width; rc.height = cv.height;
        const c = rc.getContext("2d"); c.fillStyle = "#ffffff"; c.fillRect(0, 0, rc.width, rc.height);
        c.translate(rc.width / 2, rc.height / 2); c.rotate(deg * Math.PI / 180); c.drawImage(cv, -cv.width / 2, -cv.height / 2);
        cv.width = cv.height = 0; cv = rc;
      }
      const img = await out.embedJpg(await canvasBytes(cv, "image/jpeg", 0.85));
      out.addPage([w, ph]).drawImage(img, { x: 0, y: 0, width: w, height: ph });
      cv.width = cv.height = 0;
    }
    const list = fixed.length <= 8 ? fixed.map(([p, d]) => `p${p} by ${Math.abs(d).toFixed(2)}°${d > 0 ? " right" : " left"}`).join(", ") : `${fixed.length} pages`;
    return { files: [one(f, "-straightened", await out.save())], note: fixed.length ? `Straightened ${list}` : "No tilt found — pages already look straight" };
  } });
