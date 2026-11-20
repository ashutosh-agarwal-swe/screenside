/* ---------- Make a scan searchable: text recognition on the device ----------
   The engine and its language data are embedded in the page. A build made without them (OCR_EMBEDDED false) shows a link to a page that has them. */
if (!OCR_EMBEDDED) {
  tool({ id: "ocr", name: "Make a Scan Searchable", cat: "conv", icon: "scan", desc: "Read the text off scanned pages, in English or French, so it can be searched and copied. Opens the larger OCR edition of Screenside (about 30 MB).", keys: "ocr text recognition tesseract", accept: [], link: "ocr.html#ocr" });
} else {
  const SIMD_TEST = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11);
  /* Starts the engine from files embedded in this page: nothing is fetched and nothing is cached. */
  const startReader = async (codes, logger) => {
    if (typeof WebAssembly !== "object" || !WebAssembly.validate(SIMD_TEST)) throw new Error("This browser is too old to run text recognition. Update it and try again.");
    await loadScript("./vendor/ocr/tesseract.min.js");
    const langs = codes.map(code => ({ code, data: embeddedBytes(`ocr/${code}.traineddata.gz`) }));
    if (langs.some(l => !l.data)) throw new Error("The language data is missing from this copy of the page.");
    /* The engine core and the worker go into one in-memory script. With the core already present, the worker never tries to load it from an address. */
    const starter = URL.createObjectURL(new Blob([embeddedBytes("./vendor/ocr/tesseract-core-simd-lstm.wasm.js"), "\n;\n", embeddedBytes("./vendor/ocr/worker.min.js")], { type: "text/javascript" }));
    return await new Promise((res, rej) => {
      window.Tesseract.createWorker(langs, 1, {
        workerPath: starter, corePath: "embedded/tesseract-core-simd-lstm.wasm.js",
        workerBlobURL: false, cacheMethod: "none", gzip: true, logger, errorHandler: e => rej(new Error("Text recognition could not start on this device: " + String(e?.message || e).slice(0, 160))),
      }).then(res, e => rej(new Error("Text recognition could not start on this device: " + String(e?.message || e).slice(0, 160))));
    });
  };
  tool({ id: "ocr", name: "Make a Scan Searchable", cat: "conv", icon: "scan", desc: "Read the text off scanned pages, in English or French, so the PDF can be searched and its text copied.", keys: "ocr text recognition tesseract",
    note: "Reads printed and typed text. It cannot read handwriting. The pages keep their exact appearance; the recognized text is added invisibly on top. Recognition runs on this device: allow a few seconds a page on a computer, and longer on a phone. Recognized text is never perfect, so check anything important against the page. If a page was scanned sideways, straighten it with Rotate PDF first.",
    accept: ["pdf", "image"], verb: "Read the text",
    options: [{ id: "lang", label: "Language of the document", type: "select", default: "eng", choices: [["eng", "English"], ["fra", "French"], ["eng+fra", "English and French"]] },
      { id: "dpi", label: "Care", type: "select", default: "300", choices: [["300", "Best: 300 dpi"], ["200", "Faster: 200 dpi"]] },
      { ...optPages("Pages to read"), hint: tv => `Write pages like 1-3, 5, 8-. Empty means all${tv.files[0]?.pages ? ` ${tv.files[0].pages}` : ""} pages.`, show: (o, tv) => tv.files[0]?.kind === "pdf" },
      { id: "skip", label: "Skip pages that already have text", type: "check", default: true, wide: true, hint: "Avoids adding a second copy of the text to pages that are not scans." }],
    async run({ files: [f], opts: o, progress }) {
      const bytes = f.kind === "image" ? await imageToPdf(f.file) : f.bytes;   /* a photo becomes a one-page PDF first */
      const js = await openJs(bytes), idx = parseRanges(o.pages, js.numPages), dpi = +o.dpi, codes = o.lang.split("+"), texts = [];
      let at = "", words = 0, read = 0, skipped = 0, conf = 0, empty = 0;
      progress("Starting the text reader…");
      const worker = await startReader(codes, m => { if (m.status === "recognizing text") progress(`${at}: ${Math.round((m.progress || 0) * 100)}%`); else if (!at && m.status) progress(`Starting the text reader (${m.status})…`); });
      let doc;
      try {
        await worker.setParameters({ tessedit_pageseg_mode: "3", user_defined_dpi: String(dpi) });
        doc = await loadDoc(bytes); const font = await doc.embedFont(StandardFonts.Helvetica);
        for (const [k, pi] of idx.entries()) {
          at = `Reading page ${pi + 1} (${k + 1} of ${idx.length})`; progress(at + "…");
          if (o.skip) { const { lines } = await pageLines(js, pi + 1); if (lines.reduce((n, L) => n + L.text.length, 0) > 25) { skipped++; texts.push({ page: pi + 1, text: lines.map(L => L.text).join("\n") }); continue; } }
          const { cv, scale } = await renderPage(js, pi + 1, { scale: dpi / 72 }), blob = await canvasBlob(cv, "image/png"); cv.width = cv.height = 0;
          const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
          const page = doc.getPage(pi), before = words;
          await inView(page, v => {
            page.pushOperators(PL.setTextRenderingMode(PL.TextRenderingMode.Invisible));
            for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const L of p.lines || []) for (const w of L.words || []) {
              const t = [...String(w.text || "").normalize("NFKC")].filter(ch => canEncode(font, ch)).join(""); if (!t.trim()) continue;
              const bl = L.baseline, x = w.bbox.x0 / scale, wpt = Math.max(1, (w.bbox.x1 - w.bbox.x0) / scale);
              const by = bl && bl.x1 !== bl.x0 ? bl.y0 + (bl.y1 - bl.y0) * ((w.bbox.x0 - bl.x0) / (bl.x1 - bl.x0)) : w.bbox.y1;
              page.drawText(t + " ", { x, y: v.H - by / scale, size: Math.max(1, Math.min(400, wpt / font.widthOfTextAtSize(t, 1))), font }); words++;
            }
          });
          read++; if (words > before) conf += data.confidence || 0; else empty++; texts.push({ page: pi + 1, text: String(data.text || "").trim() });
        }
      } finally { try { await worker.terminate(); } catch {} }
      if (!read) throw new Error(skipped ? "Every page you chose already has text, so there was nothing to read. Untick the skip option to read them anyway." : "No pages were read.");
      if (!words) throw new Error(`No printed text could be read on ${read === 1 ? "this page" : `any of the ${read} pages`}. This tool reads printed and typed text; it cannot read handwriting. A blurred or dark photo can also cause this.`);
      const all = texts.map(t => `[Page ${t.page}]\n${t.text}`).join("\n\n"), avg = Math.round(conf / (read - empty)), poor = avg < 80 || empty > 0;
      const hits = h("div", { class: "textout", style: { maxHeight: "190px", display: "none" } });
      const find = h("input", { class: "search", type: "search", id: "ocrFind", placeholder: "Search the recognized text", "aria-label": "Search the recognized text", oninput: e => {
        const q = e.target.value.trim().toLowerCase(); hits.replaceChildren(); hits.style.display = q.length < 2 ? "none" : "block"; if (q.length < 2) return; let n = 0;
        for (const t of texts) { const low = t.text.toLowerCase(); for (let i = low.indexOf(q); i >= 0 && n < 50; i = low.indexOf(q, i + 1)) { hits.append(h("div", {}, h("b", {}, `Page ${t.page}: `), "…" + t.text.slice(Math.max(0, i - 45), i + q.length + 45).replace(/\s+/g, " ") + "…")); n++; } }
        if (!n) hits.textContent = "No match in the recognized text.";
      } });
      const line = (k, v) => h("div", { class: "frow" }, h("span", { class: "nm" }, k), h("span", { class: "mt" }, v));
      const el = h("div", {}, line("Pages read", `${read}` + (skipped ? `, plus ${skipped} skipped because they already had text` : "")), line("Words recognized", words.toLocaleString("en-US")),
        line("Engine's own confidence", `${avg}%` + (avg < 80 ? " (low: expect many mistakes)" : "")), empty > 0 && line("Pages where nothing was read", String(empty)),
        poor && h("p", { class: "status err" }, "Check this result carefully. Low confidence or empty pages usually mean handwriting, a blurred or dark photo, or the wrong language chosen. This tool cannot read handwriting."), h("div", { style: { margin: "10px 0 6px" } }, find), hits);
      return { files: [one(f, "-searchable", await doc.save()), one(f, "-text", all, "txt")], text: all, el, warn: poor,
        note: `Read ${read} page${read === 1 ? "" : "s"} and found ${words.toLocaleString("en-US")} words` + (avg < 80 ? ". Confidence is low" : "") + (empty ? `. Nothing was read on ${empty} page${empty === 1 ? "" : "s"}` : "") };
    } });
}
