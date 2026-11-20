/* ---------- organizer: drag-and-drop page desk ---------- */
{


/* ---------- icons ---------- */

$("undoBtn").innerHTML = ic("undo"); $("redoBtn").innerHTML = ic("redo");
$("finishBtn").innerHTML = ic("down") + "Finish";
$("addBtn").innerHTML = ic("plus") + "Add files";
$("blankBtn").innerHTML = ic("file") + "Blank page";
$("rotLBtn").innerHTML = ic("rotL"); $("rotRBtn").innerHTML = ic("rotR");
$("dupBtn").innerHTML = ic("copy"); $("delBtn").innerHTML = ic("trash");
$("revBtn").innerHTML = ic("rev") + "Reverse";
$("insFiles").innerHTML = ic("plus") + "Add files here";
$("insBlank").innerHTML = ic("file") + "Blank page here";
$("exGo").innerHTML = ic("down") + "Download PDF";
$("pvPrev").innerHTML = ic("prev"); $("pvNext").innerHTML = ic("next"); $("pvRot").innerHTML = ic("rotR"); $("pvClose").innerHTML = ic("x");

/* ---------- state ---------- */
const sources = new Map();   // sid -> { name, bytes, doc (pdf-lib), js (promise of pdf.js doc), color, sample }
const dims = new Map();      // "sid:index" -> { w, h } in points, as displayed before user rotation
const thumbs = new Map();    // "sid:index" -> blob url ("" when it could not be drawn)
let pages = [];              // { id, kind: "pdf"|"blank", src, index, rot, w, h }
let selection = new Set();
let anchor = null;
let undoStack = [], redoStack = [];
let sampleActive = false;
let seq = 0;
const COLORS = ["#2545d3", "#d9480f", "#0b8a6a", "#a626a4", "#b7791f", "#0e7490", "#be185d", "#4d7c0f"];
const grid = $("grid"), desk = $("desk");
const keyOf = p => p.src + ":" + p.index;
const pid = () => "p" + (++seq);

const snapshot = () => ({ pages: pages.map(p => ({ ...p })), sel: [...selection], sample: sampleActive });
function restore(s) { pages = s.pages.map(p => ({ ...p })); selection = new Set(s.sel); sampleActive = s.sample; render(); }
function mutate(fn) {
  undoStack.push(snapshot()); if (undoStack.length > 200) undoStack.shift();
  redoStack = []; fn(); render();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

/* ---------- geometry ---------- */
function pageDims(p) {
  const d = p.kind === "blank" ? { w: p.w, h: p.h } : (dims.get(keyOf(p)) || { w: 595, h: 842 });
  const odd = p.rot % 180 !== 0;
  return { w: d.w, h: d.h, dw: odd ? d.h : d.w, dh: odd ? d.w : d.h, odd };
}
function sheetHTML(p) {
  const g = pageDims(p), a = g.dw / g.dh;
  const width = a >= 1 ? 100 : a * 100;
  let inner;
  if (p.kind === "blank") inner = `<div class="blank">Blank</div>`;
  else {
    const k = keyOf(p), url = thumbs.get(k);
    const iw = g.odd ? (g.w / g.h) * 100 : 100;
    inner = `<img data-key="${k}" alt="" draggable="false" ${url ? `src="${url}"` : ""} style="width:${iw}%;transform:translate(-50%,-50%) rotate(${p.rot}deg)">`;
  }
  return `<div class="sheet" style="width:${width}%;aspect-ratio:${g.dw}/${g.dh}">${inner}</div>`;
}
function srcLabel(p) {
  if (p.kind === "blank") return "Blank page";
  const s = sources.get(p.src); return `${s.name} · p${p.index + 1}`;
}

/* ---------- render ---------- */
function render() {
  const focusId = document.activeElement?.closest?.(".card")?.dataset.id;
  for (const id of [...selection]) if (!pages.some(p => p.id === id)) selection.delete(id);
  if (!pages.length) {
    grid.innerHTML = `<div class="empty" style="flex:1">
      <h2>Drop PDFs or images here</h2>
      <p>Add one file to rearrange its pages, or several to merge them into one document.</p>
      <button class="btn primary" data-act="add">${ic("plus")}Choose files</button></div>`;
  } else {
    grid.innerHTML = pages.map((p, i) => {
      const label = srcLabel(p), color = p.kind === "blank" ? "var(--line)" : sources.get(p.src).color;
      return `<div class="card${selection.has(p.id) ? " sel" : ""}" data-id="${p.id}" tabindex="0" role="option" aria-selected="${selection.has(p.id)}" aria-label="Page ${i + 1}, ${esc(label)}">
        <div class="thumb">${sheetHTML(p)}</div>
        <span class="pick">${ic("check")}</span>
        <div class="meta"><span class="num">${i + 1}</span><span class="dot" style="background:${color}"></span><span class="src" title="${esc(label)}">${esc(label)}</span></div>
        <div class="acts">
          <button data-act="rot" title="Rotate right" aria-label="Rotate page ${i + 1} right">${ic("rotR")}</button>
          <button data-act="dup" title="Duplicate" aria-label="Duplicate page ${i + 1}">${ic("copy")}</button>
          <button data-act="view" title="Preview" aria-label="Preview page ${i + 1}">${ic("zoom")}</button>
          <button data-act="del" class="del" title="Delete" aria-label="Delete page ${i + 1}">${ic("trash")}</button>
        </div>
        <button class="ins" data-act="ins" title="Insert after page ${i + 1}" aria-label="Insert after page ${i + 1}">${ic("plus")}</button>
      </div>`;
    }).join("") + `<div class="addtile"><button data-act="add">${ic("plus")}<br>Add files</button><button data-act="blank">Blank page</button></div>`;
  }
  if (focusId) grid.querySelector(`.card[data-id="${focusId}"]`)?.focus({ preventScroll: true });
  chrome(); queueThumbs();
}
function syncSelection() {
  for (const c of grid.querySelectorAll(".card")) {
    const on = selection.has(c.dataset.id);
    c.classList.toggle("sel", on); c.setAttribute("aria-selected", on);
  }
  chrome();
}
function chrome() {
  const n = pages.length, s = selection.size;
  $("count").innerHTML = `<b>${n}</b> page${n === 1 ? "" : "s"}${s ? ` · <b>${s}</b> selected` : ""}`;
  for (const id of ["rotLBtn", "rotRBtn", "dupBtn", "delBtn"]) $(id).disabled = !s;
  $("revBtn").disabled = (s || n) < 2;
  $("selAllBtn").disabled = !n;
  $("selAllBtn").textContent = n && s === n ? "Clear selection" : "Select all";
  $("undoBtn").disabled = !undoStack.length; $("redoBtn").disabled = !redoStack.length;
  $("finishBtn").disabled = !n;
  // strip: sample banner + source legend
  const used = new Map();
  for (const p of pages) if (p.kind === "pdf") used.set(p.src, (used.get(p.src) || 0) + 1);
  let h = "";
  if (sampleActive && pages.length) h += `<div class="banner"><span class="tag">Sample</span><span>Pages 3 and 4 are swapped and page 5 is upside down. Try fixing them, or add your own files.</span><button class="btn" data-act="clearSample">Remove sample</button></div>`;
  if (used.size > 1 || (used.size === 1 && !sampleActive)) for (const [sid, c] of used) {
    const s = sources.get(sid);
    h += `<span class="chip" title="${esc(s.name)}"><span class="dot" style="background:${s.color}"></span><span class="n">${esc(s.name)}</span><span>(${c})</span></span>`;
  }
  $("strip").innerHTML = h;
}

/* ---------- thumbnails ---------- */
const queue = []; let pumping = false;
const getJs = s => s.js || (s.js = pdfjsLib.getDocument({ data: s.bytes.slice(), ...PDFJS_EXTRA }).promise);
function queueThumbs() {
  for (const p of pages) if (p.kind === "pdf") { const k = keyOf(p); if (!thumbs.has(k) && !queue.includes(k)) queue.push(k); }
  pump();
}
async function pump() {
  if (pumping) return; pumping = true;
  while (queue.length) {
    const k = queue.shift(); if (thumbs.has(k)) continue;
    const cut = k.lastIndexOf(":"), s = sources.get(k.slice(0, cut)), idx = +k.slice(cut + 1);
    let url = "";
    try {
      const js = await getJs(s), pg = await js.getPage(idx + 1);
      const v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: 440 / Math.max(v1.width, v1.height) });
      const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await pg.render({ canvas: cv, canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .86));
      url = URL.createObjectURL(blob);
      const d = dims.get(k);
      const changed = !d || Math.abs(d.w / d.h - v1.width / v1.height) > .01;
      dims.set(k, { w: v1.width, h: v1.height });
      thumbs.set(k, url);
      if (changed) { render(); continue; }
    } catch (e) { console.warn("thumbnail failed", k, e); thumbs.set(k, ""); }
    if (url) for (const img of document.querySelectorAll(`img[data-key="${k}"]`)) img.src = url;
  }
  pumping = false;
}

/* ---------- import ---------- */
function kindOf(f) {
  const n = f.name.toLowerCase();
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return "image";
  if (/\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/.test(n)) return "office";
  return "other";
}
async function registerSource(name, bytes, extra = {}) {
  const doc = repairStreams(await PDFDocument.load(bytes));
  const sid = "s" + (++seq);
  sources.set(sid, { name, bytes, doc, js: null, color: COLORS[(sources.size) % COLORS.length], ...extra });
  return doc.getPages().map((pg, i) => {
    const { width, height } = pg.getSize();
    const odd = (((pg.getRotation().angle % 360) + 360) % 360) % 180 !== 0;
    dims.set(sid + ":" + i, { w: odd ? height : width, h: odd ? width : height });
    return { id: pid(), kind: "pdf", src: sid, index: i, rot: 0 };
  });
}
async function addFiles(files, at) {
  files = [...files]; if (!files.length) return;
  const fresh = []; document.body.style.cursor = "progress";
  for (const f of files) {
    const kind = kindOf(f);
    try {
      if (kind === "office") { toast(`${f.name}: Word, Excel and PowerPoint files need saving as PDF first.`); continue; }
      if (kind === "other") { toast(`${f.name}: only PDFs and images can be added.`); continue; }
      const bytes = kind === "pdf" ? new Uint8Array(await f.arrayBuffer()) : await imageToPdf(f);
      fresh.push(...await registerSource(f.name, bytes));
    } catch (e) {
      console.warn(e);
      toast(/encrypt/i.test(String(e?.message)) ? `${f.name} is password-protected. Remove the password and add it again.` : `${f.name} could not be read. The file may be damaged.`);
    }
  }
  document.body.style.cursor = "";
  if (!fresh.length) return;
  mutate(() => {
    if (sampleActive && at == null) { pages = []; selection.clear(); }
    sampleActive = false;
    const i = at == null ? pages.length : Math.min(at, pages.length);
    pages.splice(i, 0, ...fresh);
  });
  if (at == null) grid.querySelector(`.card[data-id="${fresh[0].id}"]`)?.scrollIntoView({ block: "nearest" });
}
let pendingAt = null;
function chooseFiles(at) { pendingAt = at ?? null; $("file").value = ""; $("file").click(); }
$("file").addEventListener("change", e => addFiles(e.target.files, pendingAt));
const afterSelection = () => { let last = -1; pages.forEach((p, i) => { if (selection.has(p.id)) last = i; }); return last < 0 ? null : last + 1; };
function addBlank(at) {
  const i = at == null ? pages.length : at;
  const near = pages[i - 1] || pages[i];
  const g = near ? pageDims(near) : { dw: 595.28, dh: 841.89 };
  mutate(() => { sampleActive = sampleActive && pages.length > 0; pages.splice(i, 0, { id: pid(), kind: "blank", rot: 0, w: g.dw, h: g.dh }); });
}

/* ---------- page operations ---------- */
const idsOrSel = id => (id ? [id] : [...selection]);
function rotate(ids, by) { if (!ids.length) return; const set = new Set(ids); mutate(() => { for (const p of pages) if (set.has(p.id)) p.rot = (p.rot + by + 360) % 360; }); }
function duplicate(ids) {
  if (!ids.length) return; const set = new Set(ids);
  mutate(() => { pages = pages.flatMap(p => set.has(p.id) ? [p, { ...p, id: pid() }] : [p]); });
}
function remove(ids) {
  if (!ids.length) return; const set = new Set(ids);
  mutate(() => { pages = pages.filter(p => !set.has(p.id)); for (const id of set) selection.delete(id); if (!pages.length) sampleActive = false; });
}
function reverse() {
  mutate(() => {
    if (selection.size > 1) {
      const slots = [], picked = [];
      pages.forEach((p, i) => { if (selection.has(p.id)) { slots.push(i); picked.push(p); } });
      picked.reverse(); slots.forEach((s, k) => pages[s] = picked[k]);
    } else pages.reverse();
  });
}
function moveTo(ids, index) {
  const set = new Set(ids);
  const moving = pages.filter(p => set.has(p.id));
  const target = pages.slice(0, index).filter(p => !set.has(p.id)).length;
  const rest = pages.filter(p => !set.has(p.id));
  rest.splice(target, 0, ...moving);
  if (rest.every((p, i) => p === pages[i])) return;
  mutate(() => { pages = rest; });
}
function nudge(id, dir) {
  const ids = selection.has(id) ? [...selection] : [id];
  const set = new Set(ids), idx = pages.map((p, i) => set.has(p.id) ? i : -1).filter(i => i >= 0);
  if (dir < 0) { if (idx[0] === 0) return; moveTo(ids, idx[0] - 1); }
  else { if (idx[idx.length - 1] === pages.length - 1) return; moveTo(ids, idx[idx.length - 1] + 2); }
  grid.querySelector(`.card[data-id="${id}"]`)?.focus();
}

/* ---------- selection ---------- */
function toggle(id, shift) {
  if (shift && anchor && pages.some(p => p.id === anchor)) {
    const a = pages.findIndex(p => p.id === anchor), b = pages.findIndex(p => p.id === id);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selection.add(pages[i].id);
  } else { selection.has(id) ? selection.delete(id) : selection.add(id); anchor = id; }
  syncSelection();
}

/* ---------- click actions ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const card = b.closest(".card"), id = card?.dataset.id, i = pages.findIndex(p => p.id === id);
  switch (b.dataset.act) {
    case "rot": rotate([id], 90); break;
    case "dup": duplicate([id]); break;
    case "del": remove([id]); break;
    case "view": openPreview(i); break;
    case "ins": openInsMenu(b, i + 1); break;
    case "add": chooseFiles(); break;
    case "blank": addBlank(); break;
    case "clearSample": remove(pages.filter(p => p.kind === "pdf" && sources.get(p.src).sample).map(p => p.id)); break;
  }
});
$("addBtn").onclick = () => chooseFiles(sampleActive ? null : afterSelection());
$("blankBtn").onclick = () => addBlank(afterSelection());
$("selAllBtn").onclick = () => { selection = selection.size === pages.length ? new Set() : new Set(pages.map(p => p.id)); syncSelection(); };
$("rotLBtn").onclick = () => rotate([...selection], -90);
$("rotRBtn").onclick = () => rotate([...selection], 90);
$("dupBtn").onclick = () => duplicate([...selection]);
$("delBtn").onclick = () => remove([...selection]);
$("revBtn").onclick = reverse;
$("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
$("zoom").oninput = e => { document.documentElement.style.setProperty("--thumb", e.target.value + "px"); };

/* insert menu */
let insAt = 0, insBtn = null;
function openInsMenu(btn, at) {
  closeInsMenu(); insAt = at; insBtn = btn; btn.classList.add("open");
  const m = $("insMenu"), r = btn.getBoundingClientRect(); m.classList.add("open");
  m.style.left = Math.max(8, Math.min(r.left - 10, innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + "px";
  $("insFiles").focus();
}
function closeInsMenu() { $("insMenu").classList.remove("open"); insBtn?.classList.remove("open"); insBtn = null; }
$("insFiles").onclick = () => { const at = insAt; closeInsMenu(); chooseFiles(at); };
$("insBlank").onclick = () => { const at = insAt; closeInsMenu(); addBlank(at); };
document.addEventListener("pointerdown", e => { if (!e.target.closest("#insMenu, .ins")) closeInsMenu(); }, true);
desk.addEventListener("scroll", closeInsMenu);

/* ---------- drag to reorder (mouse, pen, long-press touch) ---------- */
let drag = null; const marker = $("marker");
function dropSpot(x, y) {
  let best = null, bd = Infinity;
  const cards = grid.querySelectorAll(".card");
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const d = dy * 1000 + dx; if (d < bd) { bd = d; best = { i, r }; }
  });
  if (!best) return null;
  const after = x > best.r.left + best.r.width / 2;
  return { index: best.i + (after ? 1 : 0), r: best.r, after };
}
function showMarker(spot) {
  if (!spot) { marker.style.display = "none"; return; }
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 24;
  marker.style.display = "block";
  marker.style.left = (spot.after ? spot.r.right + gap / 2 : spot.r.left - gap / 2) - 2 + "px";
  marker.style.top = spot.r.top + "px"; marker.style.height = spot.r.height + "px";
}
function startDrag(x, y) {
  drag.active = true;
  if (!selection.has(drag.id)) { selection = new Set([drag.id]); anchor = drag.id; syncSelection(); }
  for (const c of grid.querySelectorAll(".card.sel")) c.classList.add("dragging");
  const g = document.createElement("div"); g.className = "ghost";
  g.innerHTML = sheetHTML(pages.find(p => p.id === drag.id)) + (selection.size > 1 ? `<span class="badge">${selection.size}</span>` : "");
  document.body.append(g); drag.ghost = g; document.body.style.cursor = "grabbing";
  moveDrag(x, y); autoScroll();
}
function moveDrag(x, y) {
  drag.x2 = x; drag.y2 = y;
  drag.ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  drag.spot = dropSpot(x, y); showMarker(drag.spot);
}
function autoScroll() {
  if (!drag?.active) return;
  const r = desk.getBoundingClientRect(), y = drag.y2, edge = 70;
  const v = y < r.top + edge ? -(r.top + edge - y) : y > r.bottom - edge ? y - (r.bottom - edge) : 0;
  if (v) { desk.scrollTop += Math.max(-22, Math.min(22, v / 3)); drag.spot = dropSpot(drag.x2, drag.y2); showMarker(drag.spot); }
  requestAnimationFrame(autoScroll);
}
function endDrag(commit) {
  const d = drag; drag = null; if (!d) return;
  clearTimeout(d.timer);
  if (!d.active) return;
  d.ghost.remove(); marker.style.display = "none"; document.body.style.cursor = "";
  for (const c of grid.querySelectorAll(".dragging")) c.classList.remove("dragging");
  if (commit && d.spot) moveTo([...selection], d.spot.index);
}
grid.addEventListener("pointerdown", e => {
  const card = e.target.closest(".card");
  if (!card || e.button !== 0 || e.target.closest("button")) return;
  const touch = e.pointerType === "touch";
  drag = { id: card.dataset.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch, active: false, shift: e.shiftKey };
  if (touch) drag.timer = setTimeout(() => { if (drag && !drag.active) { navigator.vibrate?.(12); startDrag(drag.x, drag.y); } }, 380);
});
window.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  if (!drag.active) {
    if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); drag = null; } return; }
    if (dist < 6) return;
    startDrag(e.clientX, e.clientY);
  }
  moveDrag(e.clientX, e.clientY);
});
window.addEventListener("pointerup", e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.active) endDrag(true);
  else { const { id, shift } = drag; clearTimeout(drag.timer); drag = null; toggle(id, shift); }
});
window.addEventListener("pointercancel", () => endDrag(false));
document.addEventListener("touchmove", e => { if (drag?.active) e.preventDefault(); }, { passive: false });
grid.addEventListener("contextmenu", e => { if (drag) e.preventDefault(); });
desk.addEventListener("pointerdown", e => { if (!e.target.closest(".card, button, .addtile, .empty") && selection.size) { selection.clear(); syncSelection(); } });

/* ---------- file drop ---------- */
const orgOn = () => $("v-organize").classList.contains("on");
const hasFiles = e => orgOn() && [...(e.dataTransfer?.types || [])].includes("Files");
let dragDepth = 0;
addEventListener("dragenter", e => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; document.body.classList.add("filedrag"); } });
addEventListener("dragover", e => {
  if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  const precise = pages.length && !sampleActive;
  desk.querySelector(".dropveil").classList.toggle("on", !precise);
  showMarker(precise ? dropSpot(e.clientX, e.clientY) : null);
});
addEventListener("dragleave", e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("filedrag"); showMarker(null); } });
addEventListener("drop", e => {
  if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; document.body.classList.remove("filedrag"); showMarker(null);
  const spot = pages.length && !sampleActive ? dropSpot(e.clientX, e.clientY) : null;
  addFiles(e.dataTransfer.files, spot ? spot.index : null);
});

/* ---------- keyboard ---------- */
addEventListener("keydown", e => {
  if (!orgOn()) return;
  const typing = e.target.matches?.("input[type=text]");
  if (e.key === "Escape") {
    if ($("pvVeil").classList.contains("open")) return closePreview();
    if ($("exportVeil").classList.contains("open")) return closeExport();
    if ($("insMenu").classList.contains("open")) return closeInsMenu();
    if (drag?.active) return endDrag(false);
    if (selection.size) { selection.clear(); syncSelection(); } return;
  }
  if ($("pvVeil").classList.contains("open")) {
    if (e.key === "ArrowLeft") pvStep(-1); else if (e.key === "ArrowRight") pvStep(1); else if (e.key.toLowerCase() === "r") pvRotate();
    return;
  }
  if (typing || $("exportVeil").classList.contains("open")) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && k === "y") { e.preventDefault(); return redo(); }
  if (mod && k === "a") { e.preventDefault(); selection = new Set(pages.map(p => p.id)); return syncSelection(); }
  if (mod) return;
  const card = e.target.closest?.(".card"), id = card?.dataset.id;
  const ids = selection.size ? [...selection] : id ? [id] : [];
  if (card && !e.target.closest("button")) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); const dir = e.key === "ArrowLeft" ? -1 : 1;
      if (e.altKey) return nudge(id, dir);
      const sib = dir < 0 ? card.previousElementSibling : card.nextElementSibling;
      if (sib?.classList.contains("card")) sib.focus(); return;
    }
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); return toggle(id, e.shiftKey); }
  }
  if (e.target.closest?.("button")) return;
  if (k === "delete" || k === "backspace") { if (ids.length) { e.preventDefault(); remove(ids); } }
  else if (k === "r") rotate(ids, e.shiftKey ? -90 : 90);
  else if (k === "d") duplicate(ids);
});

/* ---------- preview ---------- */
let pv = -1, pvToken = 0;
function openPreview(i) { pv = i; $("pvVeil").classList.add("open"); drawPreview(); $("pvClose").focus(); }
function closePreview() { $("pvVeil").classList.remove("open"); pv = -1; $("pvStage").innerHTML = ""; }
function pvStep(d) { const n = pv + d; if (n < 0 || n >= pages.length) return; pv = n; drawPreview(); }
function pvRotate() { const p = pages[pv]; if (!p) return; rotate([p.id], 90); drawPreview(); }
async function drawPreview() {
  const p = pages[pv]; if (!p) return closePreview();
  const token = ++pvToken, stage = $("pvStage");
  $("pvTitle").textContent = `Page ${pv + 1} of ${pages.length} · ${srcLabel(p)}`;
  $("pvPrev").disabled = pv === 0; $("pvNext").disabled = pv === pages.length - 1;
  const box = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const cv = document.createElement("canvas");
  try {
    if (p.kind === "blank") {
      const g = pageDims(p), f = Math.min(box.width / g.dw, box.height / g.dh);
      cv.width = g.dw * f; cv.height = g.dh * f;
    } else {
      const pg = await (await getJs(sources.get(p.src))).getPage(p.index + 1);
      const rotation = (pg.rotate + p.rot) % 360, base = pg.getViewport({ scale: 1, rotation });
      const f = Math.min(box.width / base.width, box.height / base.height);
      const vp = pg.getViewport({ scale: f * dpr, rotation });
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      cv.style.width = vp.width / dpr + "px"; cv.style.height = vp.height / dpr + "px";
      await pg.render({ canvas: cv, canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    }
    if (token === pvToken) stage.replaceChildren(cv);
  } catch (e) { console.warn(e); if (token === pvToken) stage.innerHTML = `<p style="color:#fff">This page could not be drawn, but it will still be included in the download.</p>`; }
}
$("pvPrev").onclick = () => pvStep(-1); $("pvNext").onclick = () => pvStep(1);
$("pvRot").onclick = pvRotate; $("pvClose").onclick = closePreview;
$("pvVeil").addEventListener("click", e => { if (e.target.id === "pvVeil" || e.target.id === "pvStage") closePreview(); });

/* ---------- export ---------- */
async function buildPdf(list) {
  const out = await PDFDocument.create();
  const bySrc = new Map();
  list.forEach((p, i) => { if (p.kind === "pdf") { if (!bySrc.has(p.src)) bySrc.set(p.src, []); bySrc.get(p.src).push(i); } });
  const copied = new Array(list.length);
  for (const [sid, idxs] of bySrc) {
    const cp = await out.copyPages(sources.get(sid).doc, idxs.map(i => list[i].index));
    idxs.forEach((i, k) => copied[i] = cp[k]);
  }
  list.forEach((p, i) => {
    if (p.kind === "blank") { const g = pageDims(p); out.addPage([g.dw, g.dh]); return; }
    const pg = copied[i];
    if (p.rot) pg.setRotation(degrees((((pg.getRotation().angle + p.rot) % 360) + 360) % 360));
    out.addPage(pg);
  });
  out.setProducer("Screenside"); out.setModificationDate(new Date());
  return await out.save();
}
function openExport() {
  if (!pages.length) return;
  const first = pages.find(p => p.kind === "pdf" && !sources.get(p.src).sample);
  if (!$("fname").dataset.touched) $("fname").value = (first ? sources.get(first.src).name.replace(/\.[^.]+$/, "") + "-organized" : "organized") + ".pdf";
  $("scopeAllText").textContent = `All ${pages.length} page${pages.length === 1 ? "" : "s"}, in the order shown`;
  const s = selection.size, partial = s > 0 && s < pages.length;
  $("scopeSel").disabled = !partial; $("scopeSel").parentElement.style.display = partial ? "" : "none";
  $("scopeSelText").textContent = `Only the ${s} selected page${s === 1 ? "" : "s"} (extract)`;
  $("scopeAll").checked = true;
  setNote(""); $("exGo").disabled = false;
  $("exportVeil").classList.add("open"); $("fname").focus(); $("fname").setSelectionRange(0, Math.max(0, $("fname").value.length - 4));
}
function closeExport() { $("exportVeil").classList.remove("open"); }
function setNote(t, err) { $("exNote").textContent = t; $("exNote").classList.toggle("err", !!err); }
$("fname").addEventListener("input", e => e.target.dataset.touched = "1");
$("finishBtn").onclick = openExport; $("exCancel").onclick = closeExport;
$("exportVeil").addEventListener("click", e => { if (e.target.id === "exportVeil") closeExport(); });
$("exGo").onclick = async () => {
  let name = $("fname").value.trim().replace(/[\\/:*?"<>|]+/g, "-") || "organized";
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  const list = $("scopeSel").checked ? pages.filter(p => selection.has(p.id)) : pages;
  $("exGo").disabled = true; setNote("Building your PDF…");
  try {
    const bytes = await buildPdf(list);
    const blob = new Blob([bytes], { type: "application/pdf" });
    setNote(`Ready: ${list.length} page${list.length === 1 ? "" : "s"}, ${fmtSize(bytes.length)}. Confirm the download when asked.`);
    const dl = await downloadsReady;
    if (dl) await dl.save({ filename: name, data: blob });
    else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    setNote(`Saved ${name} (${list.length} page${list.length === 1 ? "" : "s"}, ${fmtSize(bytes.length)}).`);
  } catch (e) {
    console.warn(e);
    if (e?.code === "declined") setNote("Download cancelled. Your pages are unchanged.");
    else if (e?.code === "rate_limited") setNote("A download prompt is already open. Answer it, then try again.", true);
    else if (e?.code) setNote("Downloads are not available in this view. Open the page on claude.ai and try again.", true);
    else setNote("The PDF could not be built: " + (e?.message || "unknown error"), true);
  }
  $("exGo").disabled = false;
};

/* ---------- sample document ---------- */
async function makeSample() {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const tints = [[.15, .27, .83], [.05, .54, .42], [.85, .28, .06], [.65, .15, .64], [.72, .47, .12], [.05, .45, .56]];
  const spec = [
    { n: 1, t: "Quarterly report", s: "Cover" },
    { n: 2, t: "Contents", s: "What is inside" },
    { n: 4, t: "Findings", s: "This page belongs after page 3" },
    { n: 3, t: "Method", s: "This page belongs before page 4" },
    { n: 5, t: "Scanned letter", s: "Scanned upside down", flip: true },
    { n: 6, t: "Revenue chart", s: "Landscape page", land: true },
  ];
  for (const sp of spec) {
    const size = sp.land ? [841.89, 595.28] : [595.28, 841.89];
    const pg = doc.addPage(size), [W, H] = size, c = rgb(...tints[sp.n - 1]);
    pg.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: c });
    pg.drawText(String(sp.n), { x: 44, y: H - 122, size: 96, font: bold, color: rgb(1, 1, 1) });
    pg.drawText(sp.t, { x: 130, y: H - 84, size: 34, font: bold, color: rgb(1, 1, 1) });
    pg.drawText(sp.s, { x: 132, y: H - 116, size: 16, font: reg, color: rgb(1, 1, 1) });
    if (sp.land) {
      const bars = [90, 150, 120, 210, 180, 260, 240];
      bars.forEach((b, i) => pg.drawRectangle({ x: 90 + i * 100, y: 70, width: 60, height: b, color: c, opacity: .35 + i * .09 }));
      pg.drawLine({ start: { x: 70, y: 70 }, end: { x: W - 70, y: 70 }, thickness: 1.5, color: rgb(.3, .33, .42) });
    } else {
      for (let i = 0; i < 16; i++) {
        const y = H - 210 - i * 34; const w = (W - 88) * (i % 5 === 4 ? .55 : .86 + ((i * 37) % 14) / 100);
        pg.drawRectangle({ x: 44, y, width: w, height: 10, color: rgb(.8, .82, .87) });
      }
    }
    pg.drawText(`Sample page ${sp.n} of 6`, { x: 44, y: 30, size: 11, font: reg, color: rgb(.45, .48, .58) });
    if (sp.flip) pg.setRotation(degrees(180));
  }
  return await doc.save();
}
async function boot() {
  render();
  try {
    pages = await registerSource("Sample report.pdf", await makeSample(), { sample: true });
    sampleActive = true;
  } catch (e) { console.warn("sample failed", e); }
  render();
}
let booted = false;
App.organize = { enter(files) { if (!booted) { booted = true; if (files?.length) { render(); addFiles(files); } else boot(); } else if (files?.length) addFiles(files); } };

}
