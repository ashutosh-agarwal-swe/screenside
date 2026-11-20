/* ---------- Repair a two-sided scan ---------- */
function pageThumb(tv, f, i) {
  const cache = tv.x.thumbs || (tv.x.thumbs = new Map()), key = f.name + ":" + f.size + ":" + i, box = h("span", { class: "pthumb" });
  if (!cache.has(key)) cache.set(key, (async () => {
    const js = await (f.js || (f.js = openJs(f.bytes))), { cv } = await renderPage(js, i + 1, { maxSide: 150 });
    return URL.createObjectURL(await canvasBlob(cv, "image/jpeg", 0.8));
  })());
  cache.get(key).then(url => box.append(h("img", { src: url, alt: "" })), () => {});
  return box;
}
/* fronts and backs in final reading order; a page with no partner keeps its place */
function duplexPlan(F, B, reverse) {
  const backs = [...Array(B.pages).keys()]; if (reverse) backs.reverse();
  const seq = [];
  for (let i = 0; i < Math.max(F.pages, backs.length); i++) {
    if (i < F.pages) seq.push({ f: F, i, side: "front", solo: i >= backs.length });
    if (i < backs.length) seq.push({ f: B, i: backs[i], side: "back", solo: i >= F.pages });
  }
  return seq;
}
tool({ id: "two-sided", name: "Repair a Two-Sided Scan", cat: "org", icon: "rev", desc: "Scanned the fronts, then flipped the stack and scanned the backs? Weave the two files back into one.",
  note: "Add the fronts file first and the backs file second. Use the arrows to swap them.", accept: ["pdf"], multi: true, min: 2, verb: "Weave pages together",
  options: [{ id: "reverse", label: "Reverse back pages", type: "check", default: true, wide: true, hint: "Leave ticked if you flipped the whole stack over to scan the backs: the last back page was then scanned first." }],
  preview(tv) {
    const [F, B] = tv.files;
    if (tv.files.length !== 2 || !F.pages || !B.pages) return h("div", { class: "panel" }, h("h3", {}, "Preview"), h("p", { class: "status" + (tv.files.length > 2 ? " err" : "") }, tv.files.length > 2 ? "Keep exactly two files: one with the fronts, one with the backs." : "Add the second file to see how the pages pair up."));
    const seq = duplexPlan(F, B, tv.opts.reverse), shown = seq.slice(0, 60), solos = seq.filter(s => s.solo), pairs = [];
    shown.forEach((s, k) => {
      const cell = h("div", { class: "pcell" + (s.solo ? " solo" : "") }, pageThumb(tv, s.f, s.i), h("b", {}, String(k + 1)), h("small", {}, s.solo ? "no partner" : `${s.side} p${s.i + 1}`));
      if (s.side === "front" || !pairs.length || pairs[pairs.length - 1].children.length === 2) pairs.push(h("div", { class: "pair" }, cell)); else pairs[pairs.length - 1].append(cell);
    });
    return h("div", { class: "panel" }, h("h3", {}, "Preview: final page order"),
      F.pages !== B.pages && h("p", { class: "status err" }, `The fronts file has ${F.pages} page${F.pages === 1 ? "" : "s"} and the backs file has ${B.pages}. ${solos.length} page${solos.length === 1 ? " has" : "s have"} no partner and ${solos.length === 1 ? "is" : "are"} kept in place, marked below. Check the order before you save.`),
      h("div", { class: "pairs" }, pairs), seq.length > shown.length && h("p", { class: "status" }, `Showing the first ${shown.length} of ${seq.length} pages. The rest follow the same pattern.`));
  },
  async run({ files, opts: o }) {
    if (files.length !== 2) throw new Error("Keep exactly two files: one with the fronts, one with the backs.");
    const [F, B] = files, seq = duplexPlan(F, B, o.reverse), out = await PDFDocument.create();
    const fp = await out.copyPages(F.doc, F.doc.getPageIndices()), bp = await out.copyPages(B.doc, B.doc.getPageIndices());
    for (const s of seq) out.addPage((s.f === F ? fp : bp)[s.i]);
    const solo = seq.filter(s => s.solo).length;
    return { files: [one(F, "-two-sided", await out.save())], note: `Wove ${F.pages} fronts and ${B.pages} backs into ${seq.length} pages` + (solo ? `. ${solo} had no partner` : ""), warn: solo > 1 };
  } });

/* ---------- Fit a PDF to a file-size limit ---------- */
const FIT_STEPS = [[0.82, 2600], [0.72, 2000], [0.62, 1600], [0.52, 1300], [0.42, 1050], [0.33, 850], [0.25, 700]];
const FIT_RASTER = [[120, 0.6], [96, 0.5], [72, 0.42], [60, 0.32]];
const bytesText = n => n.toLocaleString("en-US") + " bytes";
const decSize = n => n >= 1e6 ? (Math.ceil(n / 1e4) / 100).toFixed(2) + " MB" : Math.ceil(n / 1000) + " KB";   /* decimal units, rounded up, to match the limit as typed */
tool({ id: "fit-size", name: "Fit PDF to a File Limit", cat: "conv", icon: "compress", desc: "Combine PDFs and photos into one file that fits under an upload limit, such as 4 MB.",
  note: "Pictures are shrunk only as far as needed, and text stays selectable. A file that is mostly text cannot be made much smaller: if the limit cannot be met, you are told the size that was reached.",
  accept: ["pdf", "image"], multi: true, verb: "Fit to limit",
  options: [{ id: "size", label: "Largest file allowed", type: "number", default: 4, min: 0.01, step: "any" },
    { id: "unit", label: "Unit", type: "select", default: "mb", choices: [["mb", "MB"], ["kb", "KB"]], hint: "1 MB is counted as 1,000,000 bytes, the stricter reading, so the result fits whichever way the website counts." },
    { id: "raster", label: "If shrinking pictures is not enough, turn whole pages into pictures", type: "check", default: false, wide: true, hint: "Last resort. It usually gets much smaller, but text can no longer be selected or searched, and fine print gets softer." }],
  async run({ files, opts: o, progress }) {
    const target = Math.floor(+o.size * (o.unit === "kb" ? 1000 : 1e6));
    if (!(target > 0)) throw new Error("Enter the largest file size the website allows, for example 4.");
    const merged = await PDFDocument.create();
    for (const f of files) {
      progress(`Adding ${f.name}…`);
      const d = f.kind === "pdf" ? f.doc : await PDFDocument.load(await imageToPdf(f.file));
      for (const p of await merged.copyPages(d, d.getPageIndices())) merged.addPage(p);
    }
    const pages = merged.getPageCount(), base = await merged.save({ useObjectStreams: true });
    let best = base, how = "Nothing had to be changed";
    if (base.length > target) {
      for (const [k, [quality, maxSide]] of FIT_STEPS.entries()) {
        progress(`Too large at ${decSize(best.length)}. Shrinking pictures, step ${k + 1} of ${FIT_STEPS.length}…`);
        const doc = await loadDoc(base), changed = await recompressImages(doc, { quality, maxSide });
        if (!changed) continue;
        const data = await doc.save({ useObjectStreams: true });
        if (data.length < best.length) { best = data; how = `Pictures were shrunk (step ${k + 1} of ${FIT_STEPS.length}); text is still selectable`; }
        if (best.length <= target) break;
      }
      if (best.length > target && o.raster) {
        const js = await openJs(base);
        for (const [dpi, quality] of FIT_RASTER) {
          const data = await rasterize(js, { dpi, quality, progress: m => progress(`Turning pages into pictures at ${dpi} dpi. ${m}`) });
          if (data.length < best.length) { best = data; how = `Pages were turned into pictures at ${dpi} dpi; text can no longer be selected`; }
          if (best.length <= target) break;
        }
      }
    }
    const name = files.length === 1 ? `${baseName(files[0].name)}-fit.pdf` : "combined-fit.pdf", fits = best.length <= target;
    const line = (k, v) => h("div", { class: "frow" }, h("span", { class: "nm" }, k), h("span", { class: "mt" }, v));
    const el = h("div", {}, line("Limit", bytesText(target)), line("Result", `${bytesText(best.length)} (${decSize(best.length)})`),
      line(fits ? "Room to spare" : "Over the limit by", bytesText(Math.abs(target - best.length))), line("Pages", `${pages}, in the order listed above`), line("What was done", how),
      !fits && h("p", { class: "status err" }, o.raster ? "This is the smallest this tool can make it. Split the document into parts, or scan at a lower quality." : "This is the smallest it gets while keeping text selectable. Tick the last-resort option above and run again, or split the document into parts."),
      h("p", { class: "status" }, "Use Preview to check that small print is still readable before you send it."));
    return { files: [{ name, data: best, sizeText: decSize(best.length), note: fits ? "fits" : "over the limit" }], note: fits ? `Fits: ${decSize(best.length)} against a limit of ${+o.size} ${o.unit.toUpperCase()}` : `Does not fit: ${decSize(best.length)} against a limit of ${+o.size} ${o.unit.toUpperCase()}`, warn: !fits, el };
  } });

/* ---------- PDF privacy inspector: reads the file's structure, runs nothing ---------- */
async function inspectPdf(bytes) {
  const N = s => PDFName.of(s), doc = repairStreams(await PDFDocument.load(bytes, { updateMetadata: false })), ctx = doc.context, cat = doc.catalog, checks = [];
  const get = (d, k) => { try { return d.lookup(N(k)); } catch { return undefined; } };
  const str = v => { try { return v instanceof PDFString || v instanceof PDFHexString ? cleanText(v.decodeText()) : v instanceof PDFName ? v.decodeText() : v instanceof PDFNumber ? String(v.asNumber()) : null; } catch { return null; } };
  const clip = (s, n = 140) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
  const streamText = s => new TextDecoder("utf-8").decode(s instanceof PDFRawStream ? PL.decodePDFRawStream(s).decode() : s.getContents());
  const run = async (title, why, fn) => {
    try { const items = (await fn()).filter(Boolean); checks.push({ title, why, status: items.length ? "found" : "none", items }); }
    catch (e) { console.warn(title, e); checks.push({ title, why, status: "error", items: [], error: "This part of the file could not be read, so nothing can be said about it." }); }
  };
  const nameTree = (node, out = [], depth = 0) => {
    if (!(node instanceof PDFDict) || depth > 12) return out;
    const names = get(node, "Names"), kids = get(node, "Kids");
    if (names instanceof PDFArray) for (let i = 0; i + 1 < names.size(); i += 2) out.push([str(names.lookup(i)) || "(unnamed)", names.lookup(i + 1), names.get(i + 1)]);
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) nameTree(kids.lookup(i), out, depth + 1);
    return out;
  };
  const pages = doc.getPages(), annots = [], label = new Map();   /* label: object number -> where it sits, in plain words */
  pages.forEach((pg, pi) => {
    const arr = pg.node.Annots(); if (!(arr instanceof PDFArray)) return;
    for (let i = 0; i < arr.size(); i++) { const raw = arr.get(i), d = arr.lookup(i); if (raw instanceof PDFRef) label.set(raw.objectNumber, `page ${pi + 1}`); if (d instanceof PDFDict) annots.push({ d, page: pi + 1 }); }
  });
  const fileSpec = (fs, fallback) => {
    if (!(fs instanceof PDFDict)) return fallback;
    const nm = str(get(fs, "UF")) || str(get(fs, "F")) || fallback, ef = get(fs, "EF"), st = ef instanceof PDFDict ? get(ef, "F") || get(ef, "UF") : null;
    let size = null; try { if (st instanceof PL.PDFStream) { const p = get(st.dict, "Params"); size = (p instanceof PDFDict && get(p, "Size") instanceof PDFNumber) ? get(p, "Size").asNumber() : (st instanceof PDFRawStream ? st.contents.length : null); } } catch {}
    return nm + (size != null ? ` (${fmtSize(size)})` : "");
  };

  await run("Document properties", "Who made the file, with what software, and when. Anyone who receives the file can read these.", () => {
    const out = [], info = ctx.trailerInfo.Info ? ctx.lookup(ctx.trailerInfo.Info) : null;
    if (info instanceof PDFDict) for (const [k, v] of info.entries()) {
      let val = str(v); if (!val || !val.trim()) continue; const key = k.decodeText(), m = val.match(/^D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?/);
      if (m) val = `${m[1]}-${m[2] || "01"}-${m[3] || "01"}` + (m[4] ? ` ${m[4]}:${m[5] || "00"}` : "");
      out.push(`${{ CreationDate: "Created", ModDate: "Last changed", Creator: "Made with", Producer: "Saved by" }[key] || key}: ${clip(val)}`);
    }
    const meta = get(cat, "Metadata");
    if (meta instanceof PL.PDFStream) {
      let x = ""; try { x = streamText(meta); } catch { out.push("A second metadata block (XMP) is present but could not be read."); }
      if (x) { const tag = t => { const m = x.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">")); return m ? clip(m[1].replace(/<[^>]+>/g, " ")) : ""; };
        const bits = [["dc:creator", "author"], ["xmp:CreatorTool", "made with"], ["pdf:Producer", "saved by"], ["xmpMM:DocumentID", "document ID"]].map(([t, l]) => tag(t) && `${l}: ${tag(t)}`).filter(Boolean);
        out.push(`A second metadata block (XMP) of ${fmtSize(x.length)}` + (bits.length ? `, holding ${bits.join("; ")}` : "")); }
    }
    return out;
  });
  await run("Comments and markup", "Notes, highlights and drawings added on top of the pages, often with the name of the person who made them.", () =>
    annots.map(({ d, page }) => {
      const sub = get(d, "Subtype") instanceof PDFName ? get(d, "Subtype").decodeText() : "Unknown"; if (/^(Link|Widget|Popup|FileAttachment|PrinterMark|TrapNet)$/.test(sub)) return null;
      const who = str(get(d, "T")), text = str(get(d, "Contents"));
      return `Page ${page}: ${sub === "Text" ? "Note" : sub}` + (who ? ` by ${clip(who, 60)}` : "") + (text && text.trim() ? `: "${clip(text)}"` : "");
    }));
  await run("Attached files", "Whole files carried inside the PDF, such as the spreadsheet a table came from.", () => {
    const out = [], names = get(cat, "Names");
    if (names instanceof PDFDict) for (const [nm, fs] of nameTree(get(names, "EmbeddedFiles"))) out.push(`${fileSpec(fs, nm)}, attached to the document`);
    for (const { d, page } of annots) if (get(d, "Subtype") instanceof PDFName && get(d, "Subtype").decodeText() === "FileAttachment") out.push(`${fileSpec(get(d, "FS"), "(unnamed file)")}, pinned to page ${page}`);
    const af = get(cat, "AF"); if (af instanceof PDFArray && !out.length) for (let i = 0; i < af.size(); i++) out.push(`${fileSpec(af.lookup(i), "(unnamed file)")}, associated with the document`);
    return out;
  });
  await run("Saved form answers", "What was typed or ticked in the PDF's form fields.", () => {
    const out = [], acro = get(cat, "AcroForm"); if (!(acro instanceof PDFDict)) return out;
    if (acro.has(N("XFA"))) out.push("This form also stores its data in a second format (XFA) that this tool cannot read. It may hold answers not listed here.");
    for (const fd of doc.getForm().getFields()) {
      try {
        const nm = prettyField(fd.getName());
        if (fd instanceof PL.PDFTextField) { const v = fd.getText(); if (v && v.trim()) out.push(`${nm}: "${clip(v)}"`); }
        else if (fd instanceof PL.PDFCheckBox) { if (fd.isChecked()) out.push(`${nm}: ticked`); }
        else if (fd instanceof PL.PDFRadioGroup) { const v = fd.getSelected(); if (v) out.push(`${nm}: ${clip(v)}`); }
        else if (fd instanceof PL.PDFDropdown || fd instanceof PL.PDFOptionList) { const v = fd.getSelected(); if (v.length) out.push(`${nm}: ${clip(v.join(", "))}`); }
        else if (fd instanceof PL.PDFSignature) out.push(`${nm}: signature field`);
      } catch { out.push(`${fd.getName()}: present, but its value could not be read`); }
    }
    return out;
  });
  await run("Scripts and automatic actions", "Code or commands the PDF asks a reader app to run. This tool only reads them; it never runs them.", () => {
    const out = [], names = get(cat, "Names");
    if (names instanceof PDFDict) for (const [nm, , raw] of nameTree(get(names, "JavaScript"))) if (raw instanceof PDFRef) label.set(raw.objectNumber, `document script "${clip(nm, 50)}"`);
    const oa = cat.get(N("OpenAction")); if (oa instanceof PDFRef) label.set(oa.objectNumber, "runs when the document opens");
    const visit = (o, where, depth) => {
      if (depth > 8 || !o) return; if (o instanceof PL.PDFStream) o = o.dict;
      if (o instanceof PDFDict) {
        const S = o.get(N("S")), kind = S instanceof PDFName ? S.decodeText() : "";
        if (kind === "JavaScript" || o.has(N("JS"))) {
          let src = ""; try { const js = o.lookup(N("JS")); src = js instanceof PL.PDFStream ? streamText(js) : str(js) || ""; } catch {}
          out.push(`Script, ${where}, ${src.length.toLocaleString("en-US")} characters` + (src.trim() ? `, starting: ${clip(src, 90)}` : ""));
        } else if (kind === "Launch") out.push(`Command to open another program or file, ${where}`);
        else if (kind === "SubmitForm") { const f = get(o, "F"); out.push(`Command to send form answers to ${clip(str(f instanceof PDFDict ? get(f, "F") : f) || "a web address", 90)}, ${where}`); }
        else if (kind === "ImportData") out.push(`Command to import data from another file, ${where}`);
        for (const [, v] of o.entries()) if (v instanceof PDFDict || v instanceof PDFArray) visit(v, where, depth + 1);
      } else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) { const v = o.get(i); if (v instanceof PDFDict || v instanceof PDFArray) visit(v, where, depth + 1); }
    };
    const catRef = ctx.trailerInfo.Root;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) visit(obj, label.get(ref.objectNumber) || (catRef === ref ? "document level" : `object ${ref.objectNumber}`), 0);
    return out;
  });
  await run("Hidden layers", "Content that can be switched off so it does not show, but is still in the file.", () => {
    const out = [], oc = get(cat, "OCProperties"); if (!(oc instanceof PDFDict)) return out;
    const ocgs = get(oc, "OCGs"), d = get(oc, "D"), off = new Set(), offArr = d instanceof PDFDict ? get(d, "OFF") : null;
    if (offArr instanceof PDFArray) for (let i = 0; i < offArr.size(); i++) off.add(offArr.lookup(i));
    if (ocgs instanceof PDFArray) for (let i = 0; i < ocgs.size(); i++) { const g = ocgs.lookup(i); if (g instanceof PDFDict) out.push(`Layer "${clip(str(get(g, "Name")) || "unnamed", 60)}"` + (off.has(g) ? ", hidden by default" : ", shown by default")); }
    return out;
  });
  await run("Earlier versions inside the file", "Some apps save changes by adding to the end of the file. The older content stays inside and can sometimes be recovered.", () => {
    let n = 0;
    for (let i = 0; i + 5 <= bytes.length; i++) if (bytes[i] === 37 && bytes[i + 1] === 37 && bytes[i + 2] === 69 && bytes[i + 3] === 79 && bytes[i + 4] === 70) n++;
    if (new TextDecoder("latin1").decode(bytes.subarray(0, 2048)).includes("/Linearized")) n--;
    return n > 1 ? [`The file was saved ${n - 1} time${n === 2 ? "" : "s"} on top of an earlier version. Text or pictures deleted in between may still be recoverable.`] : [];
  });
  return checks;
}
const INSPECT_TITLES = ["Document properties", "Comments and markup", "Attached files", "Saved form answers", "Scripts and automatic actions", "Hidden layers", "Earlier versions inside the file"];
tool({ id: "inspect", name: "PDF Privacy Inspector", cat: "sec", icon: "zoom", desc: "See what else you would be sending along with a PDF: author details, comments, attached files, form answers and scripts.",
  note: "A report only: the file is not changed. \"None found\" means these checks found nothing. It is not a promise that the file holds nothing else.", accept: ["pdf"], allowLocked: true, verb: "Inspect",
  async run({ files: [f] }) {
    let checks;
    if (f.locked) checks = INSPECT_TITLES.map(title => ({ title, why: "", status: "error", items: [], error: "The file is password-protected, so its contents could not be read. Unlock it first, then inspect the unlocked original." }));
    else checks = await inspectPdf(f.bytes);
    const LAB = { found: "Found", none: "None found", error: "Couldn't inspect" }, found = checks.filter(c => c.status === "found").length, failed = checks.filter(c => c.status === "error").length;
    const el = h("div", {}, checks.map(c => h("div", { class: "chk" },
      h("h4", {}, h("span", { class: "pill " + c.status }, LAB[c.status] + (c.status === "found" ? ` ${c.items.length}` : "")), c.title), c.why && h("p", {}, c.why), c.error && h("p", { class: "status err" }, c.error),
      c.items.length > 0 && h("ul", {}, c.items.slice(0, 60).map(i => h("li", {}, i)), c.items.length > 60 && h("li", {}, `and ${c.items.length - 60} more, listed in the report file`)))));
    const report = [`Privacy report for ${f.name}`, `Made on this device by Screenside. The file itself was not changed.`, ""].concat(checks.flatMap(c => [`${c.title}: ${LAB[c.status].toUpperCase()}${c.status === "found" ? ` (${c.items.length})` : ""}`, ...(c.error ? ["  " + c.error] : []), ...c.items.map(i => "  - " + i), ""]),
      ['"None found" means these checks found nothing. It is not a promise that the file holds nothing else.']).join("\n");
    const note = failed ? (failed === checks.length ? "Could not inspect this file" : `${found} of ${checks.length} checks found something; ${failed} could not be run`) : found ? `${found} of ${checks.length} checks found something` : `Nothing found by any of the ${checks.length} checks`;
    return { files: [one(f, "-privacy-report", report, "txt")], note, warn: failed > 0, el };
  } });
