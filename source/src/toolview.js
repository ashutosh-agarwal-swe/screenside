/* ---------- tool registry and the generic tool bench ---------- */
const TOOLS = [], TOOL = {};
const CATS = { org: ["Organize", "--c-org"], conv: ["Compress and convert", "--c-conv"], edit: ["View and edit", "--c-edit"], sec: ["Sign and protect", "--c-sec"] };
function tool(def) { TOOLS.push(def); TOOL[def.id] = def; return def; }
const alias = (base, over) => tool({ ...TOOL[base], ...over });
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", zip: "application/zip", txt: "text/plain", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
const accepts = (t, kind) => t.accept.includes("*") || t.accept.includes(kind);
const acceptAttr = t => t.accept.includes("*") ? "" : t.accept.map(k => k === "pdf" ? ".pdf,application/pdf" : k === "image" ? "image/*" : "." + k).join(",");
const acceptText = t => t.accept.includes("*") ? "PDF, images, Office and text files" : t.accept.map(k => k === "pdf" ? "PDF" : k === "image" ? "JPG, PNG, WebP, GIF, BMP" : k.toUpperCase()).join(", ");
const bytesOf = async e => e.bytes || (e.bytes = await readBytes(e.file));
const freshDoc = async e => loadDoc(await bytesOf(e));

const TV = { t: null, files: [], opts: {}, out: null, err: "", busy: false, dyn: null, statusEl: null, x: {} };
function openTool(t, files) {
  Object.assign(TV, { t, files: [], opts: {}, out: null, err: "", busy: false, dyn: null, x: {} });
  for (const o of t.options || []) if (o.id) TV.opts[o.id] = o.default;
  Object.assign(TV.opts, t.preset || {});
  drawBench(); if (files?.length) tvAdd(files);
}
async function prepPdf(e, t) {
  e.bytes = await readBytes(e.file);
  try { e.doc = await loadDoc(e.bytes); e.pages = e.doc.getPageCount(); }
  catch (err) { if (err.code === "encrypted" && t.allowLocked) e.locked = true; else e.err = err.message; }
}
async function tvAdd(list) {
  const t = TV.t; let added = 0;
  for (const f of list) {
    const kind = kindOf(f);
    if (!accepts(t, kind)) { toast(`${f.name}: ${t.name} takes ${acceptText(t)} files.`); continue; }
    if (!t.multi) TV.files = [];
    TV.files.push({ file: f, name: f.name, size: f.size, kind }); added++;
  }
  if (!added) return;
  TV.out = null; TV.err = ""; TV.dyn = null; TV.x = {}; TV.loading = true; drawBench();
  await Promise.all(TV.files.filter(e => e.kind === "pdf" && !e.bytes).map(e => prepPdf(e, t)));
  if (TV.t !== t) return;
  if (t.prepare && TV.files.every(e => !e.err)) { try { TV.dyn = await t.prepare(TV.files, TV.opts); } catch (e) { TV.err = e.message; } }
  if (TV.t !== t) return;
  TV.loading = false;
  if (t.editor && TV.files[0] && !TV.files[0].err) return App.editor.open(t, TV.files[0]);
  drawBench();
}
function pickFiles(camera) { const i = $("toolFile"); i.accept = acceptAttr(TV.t); i.multiple = !!TV.t.multi && !camera; camera ? i.setAttribute("capture", "environment") : i.removeAttribute("capture"); i.value = ""; i.click(); }
function canShare(f) { try { return !!navigator.canShare?.({ files: [new File([f.blob], f.name, { type: f.blob.type })] }); } catch { return false; } }
async function shareFile(f) { try { await navigator.share({ files: [new File([f.blob], f.name, { type: f.blob.type })], title: f.name }); } catch (e) { if (e?.name !== "AbortError") toast("Sharing is not available here. Download the file instead."); } }
$("toolFile").addEventListener("change", e => tvAdd([...e.target.files]));
const progress = msg => { if (TV.statusEl) TV.statusEl.textContent = msg; };
function normOut(res) {
  const o = Array.isArray(res) ? { files: res } : res;
  o.files = (o.files || []).map(f => { const blob = toBlob(f.data, MIME[extOf(f.name)]); return { ...f, blob, size: blob.size }; });
  return o;
}
async function tvRun() {
  const t = TV.t; if (TV.busy) return;
  if (TV.files.length < (t.min || 1)) { TV.err = `Add at least ${t.min} files.`; return drawBench(); }
  TV.busy = true; TV.err = ""; TV.out = null; drawBench(); progress("Working…"); await sleep0();
  try { const res = await t.run({ files: TV.files, opts: TV.opts, progress, dyn: TV.dyn, x: TV.x }); if (TV.t !== t) return; TV.out = normOut(res); }
  catch (e) { console.warn(e); if (TV.t !== t) return; TV.err = e?.message || String(e); }
  TV.busy = false; drawBench();
}
function tvFinish(res) { TV.out = normOut(res); TV.err = ""; App.show("tool"); drawBench(); }
function handoff(id, files) { App.pending = files; if (location.hash.slice(1) === id) App.go(); else location.hash = id; }
async function tryDownload(name, data) { try { await saveFile(name, data); } catch (e) { toast(saveErrorText(e)); } }

function fieldEl(o) {
  const id = "o-" + o.id, v = TV.opts[o.id], set = (val, redraw) => { TV.opts[o.id] = val; if (redraw) drawBench(); };
  let input;
  if (o.type === "info") return h("div", { class: "field wide" }, h("small", {}, o.label));
  if (o.type === "select") input = h("select", { id, onchange: e => set(e.target.value, true) }, o.choices.map(([val, lab]) => h("option", { value: val, selected: String(v) === String(val) }, lab)));
  else if (o.type === "check") return h("div", { class: "field" + (o.wide ? " wide" : "") }, h("label", { class: "ck", for: id }, h("input", { type: "checkbox", id, checked: !!v, onchange: e => set(e.target.checked, true) }), o.label), o.hint && h("small", {}, o.hint));
  else if (o.type === "range") { const lab = h("small", {}, (o.fmt || String)(v)); input = h("input", { type: "range", id, min: o.min, max: o.max, step: o.step || 1, value: v, oninput: e => { set(+e.target.value); lab.textContent = (o.fmt || String)(+e.target.value); } }); return h("div", { class: "field" }, h("label", { for: id }, o.label), input, lab); }
  else if (o.type === "textarea") input = h("textarea", { id, placeholder: o.placeholder || "", oninput: e => set(e.target.value) }, v || "");
  else input = h("input", { type: o.type || "text", id, value: v ?? "", placeholder: o.placeholder || "", min: o.min, max: o.max, step: o.step, autocomplete: "off", spellcheck: false, oninput: e => set(o.type === "number" ? +e.target.value : e.target.value) });
  return h("div", { class: "field" + (o.wide ? " wide" : "") }, h("label", { for: id }, o.label), input, o.hint && h("small", {}, typeof o.hint === "function" ? o.hint(TV) : o.hint));
}
function drawBench() {
  const t = TV.t, B = $("bench"); B.style.setProperty("--c", `var(${CATS[t.cat][1]})`);
  const kids = [h("div", {}, h("a", { class: "crumb", href: "#home", html: ic("back") + " All tools" })),
    h("div", { class: "thead" }, h("h1", {}, t.name), h("p", {}, t.desc), t.note && h("p", { class: "note" }, t.note))];
  if (!TV.files.length) {
    kids.push(h("div", { class: "drop" }, h("div", { class: "runrow", style: { justifyContent: "center" } }, t.camera && h("button", { class: "btn primary big", html: ic("scan") + "Take a photo", onclick: () => pickFiles(true) }),
        h("button", { class: "btn big" + (t.camera ? "" : " primary"), html: ic("plus") + (t.multi ? "Choose files" : "Choose file"), onclick: () => pickFiles() })),
      h("div", {}, "or drop ", t.multi ? "files" : "a file", " here"), h("small", {}, "Takes: " + acceptText(t))));
  } else {
    const rows = TV.files.map((e, i) => h("div", { class: "frow" },
      h("span", { class: "nm", title: e.name }, e.name),
      e.err ? h("span", { class: "er" }, e.err) : h("span", { class: "mt" }, fmtSize(e.size) + (e.pages ? ` · ${e.pages} page${e.pages === 1 ? "" : "s"}` : "") + (e.locked ? " · locked" : "")),
      t.multi && TV.files.length > 1 && [h("button", { class: "x", title: "Move up", "aria-label": "Move up", disabled: i === 0, html: ic("up"), onclick: () => { TV.files.splice(i - 1, 0, TV.files.splice(i, 1)[0]); TV.out = null; drawBench(); } }),
        h("button", { class: "x", title: "Move down", "aria-label": "Move down", disabled: i === TV.files.length - 1, html: ic("dn"), onclick: () => { TV.files.splice(i + 1, 0, TV.files.splice(i, 1)[0]); TV.out = null; drawBench(); } })],
      h("button", { class: "x", title: "Remove", "aria-label": "Remove " + e.name, html: ic("x"), onclick: () => { TV.files.splice(i, 1); TV.out = null; TV.dyn = null; drawBench(); } })));
    kids.push(h("div", { class: "panel" }, h("h3", {}, t.multi ? "Files, in output order" : "File"), rows,
      h("div", { class: "runrow" }, t.camera && h("button", { class: "btn", html: ic("scan") + "Take another photo", onclick: () => pickFiles(true) }), h("button", { class: "btn", html: ic("plus") + (t.multi ? "Add more" : "Choose another file"), onclick: () => pickFiles() }))));
    const blocked = TV.files.some(e => e.err) || TV.loading;
    if (t.panel && !blocked) kids.push(t.panel(TV));
    else if (!t.editor) {
      const opts = [...(t.options || []), ...(TV.dyn || [])].filter(o => !o.show || o.show(TV.opts, TV));
      if (opts.length) kids.push(h("div", { class: "panel" }, h("h3", {}, "Options"), h("div", { class: "fields" }, opts.map(fieldEl))));
      if (t.preview && !blocked) kids.push(t.preview(TV));
      TV.statusEl = h("span", { class: "status" + (TV.err ? " err" : ""), role: "status" }, TV.err || (TV.loading ? "Reading…" : ""));
      kids.push(h("div", { class: "runrow" }, h("button", { class: "btn primary big", disabled: TV.busy || blocked, onclick: tvRun }, TV.busy ? "Working…" : t.verb || t.name), TV.statusEl));
    }
    if (t.editor && TV.err) kids.push(h("p", { class: "status err" }, TV.err));
    if (TV.out) kids.push(resultPanel(t, TV.out));
  }
  B.replaceChildren(...kids.filter(Boolean));
}
function resultPanel(t, o) {
  const next = TOOLS.filter(x => x.accept.includes("pdf") && x.id !== t.id && !x.base && !x.link);
  const rows = o.files.map(f => h("div", { class: "frow" },
    h("span", { class: "nm", title: f.name }, f.name), h("span", { class: "mt" }, (f.sizeText || fmtSize(f.size)) + (f.note ? " · " + f.note : "")),
    extOf(f.name) === "pdf" && h("select", { "aria-label": "Continue in another tool", onchange: e => { if (e.target.value) handoff(e.target.value, [new File([f.blob], f.name, { type: "application/pdf" })]); } },
      h("option", { value: "" }, "Continue in…"), next.map(x => h("option", { value: x.id }, x.name))),
    extOf(f.name) === "pdf" && h("button", { class: "btn", html: ic("eye") + "Preview", onclick: async () => App.editor.open(TOOL.reader, { name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) }) }),
    canShare(f) && h("button", { class: "btn", onclick: () => shareFile(f) }, "Share"),
    h("button", { class: "btn primary", html: ic("down") + "Download", onclick: () => tryDownload(f.name, f.blob) })));
  return h("div", { class: "panel res" }, h("div", { class: "ok" + (o.warn ? " warn" : ""), html: ic(o.warn ? "x" : "check") + esc(o.note || "Done") }), o.el, rows,
    o.text != null && h("div", { class: "textout", tabindex: 0 }, o.text),
    h("div", { class: "runrow" },
      o.files.length > 1 && h("button", { class: "btn", html: ic("down") + "Download all (.zip)", onclick: async () => tryDownload(t.id + ".zip", await makeZip(o.files.map(f => ({ name: f.name, data: f.blob })))) }),
      o.text != null && h("button", { class: "btn", html: ic("copy") + "Copy text", onclick: async e => { try { await navigator.clipboard.writeText(o.text); toast("Copied."); } catch { toast("Copy was blocked. Select the text and copy it by hand."); } } }),
      h("button", { class: "btn", onclick: () => openTool(t) }, "Start over")));
}
/* dropping files on the bench */
let tvDepth = 0;
const tvDragOk = e => $("v-tool").classList.contains("on") && [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragenter", e => { if (tvDragOk(e)) { e.preventDefault(); tvDepth++; document.body.classList.add("tooldrag"); } });
addEventListener("dragover", e => { if (tvDragOk(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
addEventListener("dragleave", e => { if (tvDragOk(e) && --tvDepth <= 0) { tvDepth = 0; document.body.classList.remove("tooldrag"); } });
addEventListener("drop", e => { if (!tvDragOk(e)) return; e.preventDefault(); tvDepth = 0; document.body.classList.remove("tooldrag"); tvAdd([...e.dataTransfer.files]); });

/* home */
function drawHome(q = "") {
  q = q.trim().toLowerCase();
  const secs = Object.entries(CATS).map(([cat, [title, c]]) => {
    const list = TOOLS.filter(t => t.cat === cat && (!q || (t.name + " " + t.desc + " " + (t.keys || "")).toLowerCase().includes(q)));
    return list.length && h("section", { class: "cat", style: { "--c": `var(${c})` } }, h("h2", {}, title),
      h("div", { class: "tgrid" }, list.map(t => h("a", { class: "tcard", href: t.link || "#" + t.id }, h("span", { class: "ti", html: ic(t.icon) }), h("span", {}, h("b", {}, t.name), h("small", {}, t.desc))))));
  }).filter(Boolean);
  const body = $("homeBody"); body.replaceChildren(...(secs.length ? secs : [h("p", { class: "status" }, "No tool matches that search.")]));
}
function buildHome() {
  const mail = SITE.mail[0] && SITE.mail[1] ? SITE.mail.join("@") : "";
  const ext = { target: "_blank", rel: "noopener noreferrer" };
  $("home").replaceChildren(
    h("div", { class: "hero" }, h("div", {}, h("h1", {}, "Screenside"), h("p", {}, TOOLS.length + " tools to help you with PDFs")),
      h("input", { class: "search", id: "search", type: "search", placeholder: "Find a tool", "aria-label": "Find a tool", oninput: e => drawHome(e.target.value) })),
    h("div", { class: "shield", html: ic("lock") }, h("div", {}, h("b", {}, PUBLIC_BUILD ? "Your files cannot leave this device" : "Your files stay on this device"),
      h("span", {}, PUBLIC_BUILD ? "This page has no server, no account, no tracking and no storage. Its security policy blocks every outgoing connection, so even a faulty tool could not send a file anywhere. Close the tab and everything is gone."
        : "The tools run inside this page and upload nothing."))),
    h("div", { id: "homeBody", style: { display: "flex", flexDirection: "column", gap: "26px" } }),
    h("p", { class: "missing", html: "<b>Not in this build.</b> Converting to PDF/A; HWP files; old binary .doc, .xls and .ppt files; share links, signature requests, accounts and cloud storage. Each needs a server, and a server would mean uploading your files." }),
    h("footer", { class: "foot" },
      SITE.kofi && h("div", {}, h("h3", {}, "Support, if you like"), h("p", {}, "Screenside is free and stays free. If it saved you time, you can ", h("a", { href: SITE.kofi, ...ext }, "leave a tip on Ko-fi"), ". This is entirely optional and unlocks nothing.")),
      mail && h("div", {}, h("h3", {}, "Request a feature"), h("p", {}, "Missing a tool, or found a file that breaks one? Email ", h("a", { href: "mailto:" + mail + "?subject=Screenside%20feature%20request" }, mail), ". Please do not attach private documents.")),
      h("div", {}, h("h3", {}, "What this cannot protect"), h("p", {}, "Screenside cannot see or stop malware or browser extensions already on your device. Those can read anything you open in any page, including here. Use a device and browser you trust for sensitive documents.")),
      h("p", { class: "legal" }, "Screenside is an independent project and is not affiliated with Smallpdf or any other PDF service. ", SITE.source && h("a", { href: SITE.source, ...ext }, "Source code"), SITE.source && " is published under the GNU AGPL v3. ", "Provided as is, without warranty.")));
  drawHome();
}
