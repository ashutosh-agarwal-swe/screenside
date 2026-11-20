/* ---------- page editor: edit, annotate, sign, redact, crop, read ---------- */
{
  const SVGNS = "http://www.w3.org/2000/svg";
  const MODES = {
    edit: { tools: ["select", "text", "draw", "highlight", "rect", "ellipse", "white", "image", "sign"], start: "select", finish: "Apply changes", suffix: "-edited", tip: "Pick a tool, then click or drag on a page. Double-click text to change it. Whiteout covers what is underneath." },
    annotate: { tools: ["select", "highlight", "draw", "text", "rect", "ellipse"], start: "highlight", finish: "Save annotations", suffix: "-annotated", tip: "Drag across text to highlight it, or pick the pen to draw. Double-click a note to change it." },
    sign: { tools: ["select", "sign", "text"], start: "sign", finish: "Finish signing", suffix: "-signed", tip: "Click where your signature goes, then drag it into place. Drag the corner square to resize." },
    redact: { tools: ["select", "redact"], start: "redact", finish: "Redact for good", suffix: "-redacted", tip: "Drag a box over everything that must disappear. Marked pages are rebuilt as pictures, so the hidden content is removed from the file." },
    crop: { tools: ["crop"], start: "crop", finish: "Crop pages", suffix: "-cropped", tip: "Drag a box around the part to keep. Drag again to redraw it." },
    read: { tools: [], start: "pan", finish: null, tip: "Scroll to read. Use the zoom buttons to change size." },
  };
  const TOOLS_UI = { select: ["cursor", "Select and move"], text: ["text", "Add text"], draw: ["pen", "Draw freehand"], highlight: ["mark", "Highlight"], rect: ["rect", "Rectangle"], ellipse: ["circle", "Ellipse"],
    white: ["white", "Whiteout"], image: ["image", "Add a picture"], sign: ["sign", "Place signature"], redact: ["bar", "Redaction box"], crop: ["crop", "Crop box"] };
  const BOX = new Set(["rect", "ellipse", "highlight", "white", "redact", "crop"]);
  const COLORS = ["#101b3f", "#16296b", "#c8102e", "#4b5320", "#f5c518"];
  let ED = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => "o" + (++ED.seq);
  const snapshot = () => { ED.undo.push(JSON.stringify(ED.objs)); if (ED.undo.length > 100) ED.undo.shift(); };
  const setTip = t => { $("edTip").textContent = t; };

  async function makeAsset(blob) {
    let bmp; try { bmp = await createImageBitmap(blob); } catch { throw new Error("That picture could not be read."); }
    let type = blob.type === "image/jpeg" ? "jpg" : "png";
    if (blob.type !== "image/jpeg" && blob.type !== "image/png") { const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; cv.getContext("2d").drawImage(bmp, 0, 0); blob = await canvasBlob(cv); type = "png"; }
    const a = { id: "a" + (++ED.seq), type, bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), ratio: bmp.height / bmp.width };
    ED.assets.set(a.id, a); return a;
  }
  async function open(t, entry) {
    ED = { t, mode: t.editor, m: MODES[t.editor], entry, js: null, pages: [], zoom: 1, objs: [], sel: null, cur: MODES[t.editor].start, color: COLORS[0], width: 2, fsz: 14, assets: new Map(), undo: [], cropAll: true, sig: null, img: null, seq: 0, act: null, edit: null };
    App.show("editor"); $("edBar").replaceChildren(); $("edPages").replaceChildren(h("p", { class: "status" }, "Opening…")); setTip("");
    try {
      ED.js = await openJs(entry.bytes);
      for (let i = 1; i <= ED.js.numPages; i++) { const vp = (await ED.js.getPage(i)).getViewport({ scale: 1 }); ED.pages.push({ w: vp.width, h: vp.height }); }
    } catch (e) { TV.err = e.message; App.show("tool"); drawBench(); return; }
    ED.zoom = clamp(Math.round(($("edPages").clientWidth - 48) / ED.pages[0].w * 20) / 20, 0.4, 1.5);
    buildBar(); buildPages(); setTip(ED.m.tip);
    if (ED.mode === "sign" && !ED.sig) openSig();
  }

  /* toolbar */
  function buildBar() {
    const m = ED.m, bar = [];
    bar.push(h("button", { class: "btn", html: ic("back") + "Close", onclick: () => { commitText(); App.show("tool"); drawBench(); } }), h("span", { class: "ttl", title: ED.entry.name }, ED.entry.name));
    if (m.tools.length) bar.push(h("span", { class: "sep" }), ...m.tools.map(k => h("button", { class: "btn icon" + (ED.cur === k ? " on" : ""), title: TOOLS_UI[k][1], "aria-label": TOOLS_UI[k][1], "aria-pressed": String(ED.cur === k), html: ic(TOOLS_UI[k][0]), onclick: () => pickTool(k) })));
    if (m.tools.includes("text") || m.tools.includes("draw")) {
      bar.push(h("span", { class: "sep" }), ...COLORS.map(c => h("button", { class: "sw" + (ED.color === c ? " on" : ""), style: { background: c }, title: "Colour", "aria-label": "Colour " + c, onclick: () => setProp("color", c) })));
      if (m.tools.includes("text")) bar.push(h("select", { "aria-label": "Text size", title: "Text size", onchange: e => setProp("fsz", +e.target.value) }, [10, 12, 14, 18, 24, 36].map(s => h("option", { value: s, selected: ED.fsz === s }, s + " pt"))));
      if (m.tools.includes("draw")) bar.push(h("select", { "aria-label": "Line thickness", title: "Line thickness", onchange: e => setProp("width", +e.target.value) }, [[1, "Thin"], [2, "Medium"], [4, "Thick"], [8, "Marker"]].map(([v, l]) => h("option", { value: v, selected: ED.width === v }, l))));
    }
    if (ED.mode === "sign") bar.push(h("button", { class: "btn", onclick: openSig }, ED.sig ? "Change signature" : "Create signature"), h("button", { class: "btn", onclick: addDate }, "Add date"));
    if (ED.mode === "crop") bar.push(h("label", { class: "ck", style: { display: "flex", gap: "6px", alignItems: "center" } }, h("input", { type: "checkbox", id: "cropAll", checked: ED.cropAll, onchange: e => { ED.cropAll = e.target.checked; ED.objs = ED.objs.slice(-1); redrawAll(); } }), "Same crop on every page"));
    if (m.finish) bar.push(h("span", { class: "sep" }), h("button", { class: "btn icon", title: "Undo (Ctrl+Z)", "aria-label": "Undo", disabled: !ED.undo.length, html: ic("undo"), onclick: undo }),
      h("button", { class: "btn icon danger", title: "Delete selected (Del)", "aria-label": "Delete selected", disabled: !ED.sel, html: ic("trash"), onclick: delSel }));
    bar.push(h("span", { class: "grow" }), h("button", { class: "btn icon", title: "Zoom out", "aria-label": "Zoom out", html: ic("minus"), onclick: () => setZoom(ED.zoom - 0.15) }),
      h("span", { class: "status", style: { minWidth: "44px", textAlign: "center" } }, Math.round(ED.zoom * 100) + "%"), h("button", { class: "btn icon", title: "Zoom in", "aria-label": "Zoom in", html: ic("plus"), onclick: () => setZoom(ED.zoom + 0.15) }));
    if (m.finish) bar.push(h("button", { class: "btn primary", id: "edFinish", html: ic("check") + m.finish, onclick: finish }));
    $("edBar").replaceChildren(...bar);
  }
  function pickTool(k) {
    commitText();
    if (k === "image") { $("imgFile").value = ""; $("imgFile").click(); return; }
    if (k === "sign" && !ED.sig) return openSig();
    ED.cur = k; if (k !== "select") ED.sel = null; buildBar(); redrawAll();
  }
  $("imgFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f || !ED.t) return;
    try { ED.img = await makeAsset(f); ED.cur = "image"; ED.sel = null; buildBar(); setTip("Click on a page to place the picture."); } catch (err) { toast(err.message); }
  });
  function setProp(k, v) {
    ED[k] = v; const o = ED.objs.find(x => x.id === ED.sel);
    if (o) { snapshot(); if (k === "color" && o.type !== "image" && o.type !== "white" && o.type !== "redact") o.color = v; if (k === "fsz" && o.type === "text") { o.size = v; measure(o); } if (k === "width" && "width" in o) o.width = v; drawObjs(o.page); }
    buildBar();
  }
  function setZoom(z) { commitText(); ED.zoom = clamp(Math.round(z * 20) / 20, 0.25, 3); buildBar(); buildPages(); }
  function undo() { if (!ED.undo.length) return; commitText(); ED.objs = JSON.parse(ED.undo.pop()); ED.sel = null; buildBar(); redrawAll(); }
  function delSel() { if (!ED.sel) return; snapshot(); ED.objs = ED.objs.filter(o => o.id !== ED.sel); ED.sel = null; buildBar(); redrawAll(); }
  function addDate() {
    const root = $("edPages"), mid = root.getBoundingClientRect().top + root.clientHeight / 2;
    let i = ED.pages.findIndex(p => { const r = p.el.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }); if (i < 0) i = 0;
    snapshot(); const o = { id: uid(), type: "text", page: i, x: ED.pages[i].w / 2 - 40, y: ED.pages[i].h / 2, text: new Date().toLocaleDateString(), size: ED.fsz, color: ED.color };
    measure(o); ED.objs.push(o); ED.sel = o.id; ED.cur = "select"; buildBar(); redrawAll();
  }

  /* pages */
  function buildPages() {
    const root = $("edPages"); ED.io?.disconnect();
    ED.io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) paintPage(+e.target.dataset.i); }, { root, rootMargin: "600px 0px" });
    root.replaceChildren(...ED.pages.map((p, i) => {
      const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "ov" + (ED.mode === "read" ? " pan" : "")); svg.setAttribute("viewBox", `0 0 ${p.w} ${p.h}`); svg.dataset.i = i;
      p.svg = svg; p.canvas = h("canvas"); p.painted = 0; p.painting = 0;
      p.el = h("div", { class: "pg", "data-i": i, style: { width: p.w * ED.zoom + "px", height: p.h * ED.zoom + "px" } }, p.canvas, svg, h("span", { class: "pn" }, `${i + 1} / ${ED.pages.length}`));
      ED.io.observe(p.el); return p.el;
    }));
    redrawAll();
  }
  async function paintPage(i) {
    const p = ED.pages[i], key = ED.zoom, js = ED.js; if (!p || p.painted === key || p.painting === key) return;
    p.painting = key;
    try {
      const { cv } = await renderPage(js, i + 1, { scale: key * Math.min(devicePixelRatio || 1, 2) });
      if (ED.js === js && ED.zoom === key) { p.canvas.width = cv.width; p.canvas.height = cv.height; p.canvas.getContext("2d").drawImage(cv, 0, 0); p.painted = key; }
    } catch (e) { console.warn(e); }
    p.painting = 0;
  }
  const inkPath = o => o.pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  function bbox(o) {
    if (o.type !== "ink") return o;
    const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function measure(o) {
    const lines = o.text.split("\n"); measureCtx.font = `${o.size}px Helvetica, Arial, sans-serif`;
    o.w = Math.max(10, ...lines.map(l => measureCtx.measureText(l).width)); o.h = lines.length * o.size * 1.2;
  }
  function objSvg(o, P) {
    const b = bbox(o), sel = o.id === ED.sel, box = `x="${b.x}" y="${b.y}" width="${Math.max(0, b.w)}" height="${Math.max(0, b.h)}"`; let s = "";
    if (o.type === "text") s = `<text font-size="${o.size}" fill="${o.color}" font-family="Helvetica, Arial, sans-serif" style="white-space:pre">${o.text.split("\n").map((l, k) => `<tspan x="${o.x}" y="${o.y + o.size * 0.95 + k * o.size * 1.2}">${esc(l) || " "}</tspan>`).join("")}</text>`;
    else if (o.type === "ink") s = `<path d="${inkPath(o)}${o.pts.length === 1 ? " l0.01 0" : ""}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (o.type === "rect") s = `<rect ${box} fill="none" stroke="${o.color}" stroke-width="${o.width}"/>`;
    else if (o.type === "ellipse") s = `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="none" stroke="${o.color}" stroke-width="${o.width}"/>`;
    else if (o.type === "highlight") s = `<rect ${box} fill="${o.color}" fill-opacity=".38" style="mix-blend-mode:multiply"/>`;
    else if (o.type === "white") s = `<rect ${box} fill="#fff" stroke="#b9c0cf" stroke-width=".6" stroke-dasharray="3 2"/>`;
    else if (o.type === "redact") s = `<rect ${box} fill="#000"/>`;
    else if (o.type === "crop") s = `<path d="M0 0H${P.w}V${P.h}H0Z M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z" fill="rgba(10,14,30,.55)" fill-rule="evenodd" pointer-events="none"/><rect ${box} fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    else if (o.type === "image") s = `<image href="${ED.assets.get(o.asset)?.url || ""}" ${box} preserveAspectRatio="none"/>`;
    const hit = o.type === "crop" ? "" : `<rect x="${b.x - 3}" y="${b.y - 3}" width="${b.w + 6}" height="${b.h + 6}" fill="none" pointer-events="all"/>`;
    const mark = sel ? `<rect x="${b.x - 3}" y="${b.y - 3}" width="${b.w + 6}" height="${b.h + 6}" fill="none" stroke="#16296b" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/>${o.type === "ink" ? "" : `<rect data-h="1" x="${b.x + b.w - 3}" y="${b.y + b.h - 3}" width="10" height="10" rx="2" fill="#16296b" stroke="#fff" stroke-width="1" style="cursor:nwse-resize"/>`}` : "";
    return `<g data-id="${o.id}" style="cursor:${ED.cur === "select" || sel ? "move" : "inherit"};touch-action:none">${hit}${s}${mark}</g>`;
  }
  function drawObjs(i) {
    const P = ED.pages[i]; if (!P?.svg) return;
    P.svg.style.cursor = ED.mode === "read" ? "" : ED.cur === "select" ? "default" : ED.cur === "text" ? "text" : "crosshair";
    P.svg.innerHTML = ED.objs.filter(o => (o.page === i || (o.type === "crop" && ED.cropAll)) && ED.edit?.o !== o).map(o => objSvg(o, P)).join("");
  }
  const redrawAll = () => ED.pages.forEach((_, i) => drawObjs(i));

  /* text editing */
  function editText(o) {
    const z = ED.zoom, P = ED.pages[o.page];
    const ta = h("textarea", { class: "te", value: o.text, "aria-label": "Text", style: { left: o.x * z + "px", top: o.y * z + "px", fontSize: o.size * z + "px", color: o.color } });
    const fit = () => { const lines = ta.value.split("\n"); measureCtx.font = `${o.size}px Helvetica, Arial, sans-serif`; ta.style.width = (Math.max(40, ...lines.map(l => measureCtx.measureText(l).width)) + o.size) * z + "px"; ta.style.height = lines.length * o.size * 1.2 * z + 4 + "px"; };
    ta.addEventListener("input", fit); ta.addEventListener("blur", () => setTimeout(commitText)); ta.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") commitText(); });
    ta.addEventListener("pointerdown", e => e.stopPropagation());
    ED.edit = { o, ta }; P.el.append(ta); fit(); drawObjs(o.page); ta.focus({ preventScroll: true }); setTimeout(() => ta.focus({ preventScroll: true }));
  }
  function commitText() {
    if (!ED.edit) return; const { o, ta } = ED.edit; ED.edit = null;
    o.text = ta.value.replace(/\s+$/, ""); ta.remove();
    if (!o.text) { ED.objs = ED.objs.filter(x => x !== o); if (ED.sel === o.id) ED.sel = null; } else measure(o);
    drawObjs(o.page); buildBar();
  }

  /* pointer work */
  function pt(e, svg) { const r = svg.getBoundingClientRect(), P = ED.pages[+svg.dataset.i]; return { x: clamp((e.clientX - r.left) / r.width * P.w, 0, P.w), y: clamp((e.clientY - r.top) / r.height * P.h, 0, P.h) }; }
  $("edPages").addEventListener("pointerdown", e => {
    const svg = e.target.closest("svg.ov"); if (!svg || ED.mode === "read" || e.button) return;
    if (ED.edit) { commitText(); return; }
    const i = +svg.dataset.i, p = pt(e, svg), g = e.target.closest("g[data-id]"), hit = g && ED.objs.find(o => o.id === g.dataset.id), cur = ED.cur;
    if (hit && (cur === "select" || hit.id === ED.sel)) { snapshot(); ED.sel = hit.id; ED.act = { kind: e.target.dataset.h ? "resize" : "move", o: hit, p0: p, s: JSON.parse(JSON.stringify(hit)), i: hit.type === "crop" ? i : hit.page, svg, moved: false }; }
    else if (cur === "select") ED.sel = null;
    else if (cur === "text") { snapshot(); const o = { id: uid(), type: "text", page: i, x: p.x, y: p.y - ED.fsz * 0.6, text: "", size: ED.fsz, color: ED.color, w: 40, h: ED.fsz * 1.2 }; ED.objs.push(o); ED.sel = null; e.preventDefault(); editText(o); return; }
    else if (cur === "draw") { snapshot(); const o = { id: uid(), type: "ink", page: i, pts: [[p.x, p.y]], color: ED.color, width: ED.width }; ED.objs.push(o); ED.act = { kind: "ink", o, i, svg }; }
    else if (BOX.has(cur)) {
      snapshot(); if (cur === "crop") ED.objs = ED.objs.filter(o => !(o.type === "crop" && (ED.cropAll || o.page === i)));
      const o = { id: uid(), type: cur, page: i, x: p.x, y: p.y, w: 0, h: 0, color: cur === "highlight" ? (ED.color === COLORS[0] ? "#f5c518" : ED.color) : ED.color, width: ED.width };
      ED.objs.push(o); ED.act = { kind: "box", o, p0: p, i, svg };
    }
    else if (cur === "image" || cur === "sign") {
      const a = cur === "sign" ? ED.sig : ED.img; if (!a) return;
      snapshot(); const P = ED.pages[i], w = Math.min(cur === "sign" ? 170 : 240, P.w * 0.6), hh = w * a.ratio;
      const o = { id: uid(), type: "image", page: i, asset: a.id, x: clamp(p.x - w / 2, 0, P.w - w), y: clamp(p.y - hh / 2, 0, Math.max(0, P.h - hh)), w, h: hh };
      ED.objs.push(o); ED.sel = o.id; ED.cur = "select";
    }
    try { svg.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault(); buildBar(); redrawAll();
  });
  $("edPages").addEventListener("pointermove", e => {
    const a = ED.act; if (!a) return; const p = pt(e, a.svg), o = a.o;
    if (a.kind === "move") {
      const dx = p.x - a.p0.x, dy = p.y - a.p0.y; if (Math.hypot(dx, dy) > 1) a.moved = true;
      if (o.type === "ink") o.pts = a.s.pts.map(q => [q[0] + dx, q[1] + dy]); else { o.x = a.s.x + dx; o.y = a.s.y + dy; }
    } else if (a.kind === "resize") {
      a.moved = true;
      if (o.type === "image") { o.w = Math.max(14, p.x - o.x); o.h = o.w * (a.s.h / a.s.w); }
      else if (o.type === "text") { o.size = clamp((p.y - o.y) / (o.text.split("\n").length * 1.2), 6, 144); measure(o); }
      else { o.w = Math.max(6, p.x - o.x); o.h = Math.max(6, p.y - o.y); }
    } else if (a.kind === "ink") { const l = o.pts[o.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 0.8) o.pts.push([p.x, p.y]); }
    else if (a.kind === "box") { o.x = Math.min(a.p0.x, p.x); o.y = Math.min(a.p0.y, p.y); o.w = Math.abs(p.x - a.p0.x); o.h = Math.abs(p.y - a.p0.y); }
    o.type === "crop" ? redrawAll() : drawObjs(a.i);
  });
  const endAct = () => {
    const a = ED.act; if (!a) return; ED.act = null;
    if (a.kind === "box" && (a.o.w < 4 || a.o.h < 4)) { ED.objs = ED.objs.filter(o => o !== a.o); ED.undo.pop(); }
    if ((a.kind === "move" || a.kind === "resize") && !a.moved) ED.undo.pop();
    buildBar(); redrawAll();
  };
  $("edPages").addEventListener("pointerup", endAct); $("edPages").addEventListener("pointercancel", endAct);
  $("edPages").addEventListener("dblclick", e => { const g = e.target.closest("g[data-id]"), o = g && ED.objs.find(x => x.id === g.dataset.id); if (o?.type === "text") { snapshot(); editText(o); } });
  addEventListener("keydown", e => {
    if (!$("v-editor").classList.contains("on") || $("sigVeil").classList.contains("open") || e.target.matches?.("input, textarea, select")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && ED.sel) { e.preventDefault(); delSel(); }
    else if (e.key === "Escape") { ED.sel = null; if (ED.m?.tools.includes("select")) ED.cur = "select"; buildBar(); redrawAll(); }
  });

  /* signature dialog */
  const SG = { tab: "draw", font: "Caveat", text: "", ink: false, cv: null, file: null };
  const SIGFONTS = [["Caveat", '"Caveat", cursive'], ["Dancing Script", '"Dancing Script", cursive'], ["Classic", '"Brush Script MT", "Snell Roundhand", cursive']];
  function openSig() { SG.ink = false; SG.file = null; $("sigVeil").classList.add("open"); drawSig(); }
  const closeSig = () => $("sigVeil").classList.remove("open");
  function drawSig() {
    $("sigTabs").replaceChildren(...[["draw", "Draw"], ["type", "Type"], ["upload", "Upload"]].map(([k, l]) => h("button", { class: "btn" + (SG.tab === k ? " on" : ""), onclick: () => { SG.tab = k; drawSig(); } }, l)));
    const body = $("sigBody"); $("sigNote").textContent = "Your signature is used for this document only and is not saved."; $("sigNote").className = "note";
    if (SG.tab === "draw") {
      const cv = SG.cv = h("canvas", { class: "sigpad", "aria-label": "Draw your signature here" }); body.replaceChildren(cv, h("div", { style: { marginTop: "8px" } }, h("button", { class: "btn", onclick: () => { cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); SG.ink = false; } }, "Clear")));
      cv.width = cv.clientWidth * 2; cv.height = cv.clientHeight * 2; const c = cv.getContext("2d"); c.lineWidth = 5; c.lineCap = c.lineJoin = "round"; c.strokeStyle = "#141a2e"; let last = null;
      const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; };
      cv.onpointerdown = e => { last = at(e); cv.setPointerCapture(e.pointerId); c.beginPath(); c.arc(last[0], last[1], 2.5, 0, 7); c.fillStyle = "#141a2e"; c.fill(); SG.ink = true; };
      cv.onpointermove = e => { if (!last) return; const p = at(e); c.beginPath(); c.moveTo(...last); c.lineTo(...p); c.stroke(); last = p; };
      cv.onpointerup = cv.onpointercancel = () => { last = null; };
    } else if (SG.tab === "type") {
      const fonts = h("div", { class: "sigfonts" });
      const paint = () => fonts.replaceChildren(...SIGFONTS.map(([n, css]) => h("button", { class: SG.font === n ? "on" : "", style: { fontFamily: css }, onclick: () => { SG.font = n; paint(); } }, SG.text || "Your name")));
      body.replaceChildren(h("label", { class: "f", for: "sigText" }, "Your name", h("input", { type: "text", id: "sigText", value: SG.text, autocomplete: "name", oninput: e => { SG.text = e.target.value; paint(); } })), h("div", { style: { height: "10px" } }), fonts); paint();
    } else {
      const info = h("p", { class: "note" }, SG.file ? SG.file.name : "A photo or scan of your signature on white paper works best.");
      const inp = h("input", { type: "file", class: "sr", id: "sigFile", accept: "image/*", onchange: e => { SG.file = e.target.files[0]; info.textContent = SG.file?.name || ""; } });
      body.replaceChildren(h("button", { class: "btn", html: ic("plus") + "Choose a picture", onclick: () => inp.click() }), inp, info);
    }
  }
  function trimCanvas(cv) {
    const c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const out = document.createElement("canvas"); out.width = x1 - x0 + 9; out.height = y1 - y0 + 9; out.getContext("2d").drawImage(cv, x0 - 4, y0 - 4, out.width, out.height, 0, 0, out.width, out.height); return out;
  }
  $("sigCancel").onclick = closeSig;
  $("sigVeil").addEventListener("click", e => { if (e.target.id === "sigVeil") closeSig(); });
  $("sigUse").onclick = async () => {
    const fail = m => { $("sigNote").textContent = m; $("sigNote").className = "note err"; }; let blob;
    try {
      if (SG.tab === "draw") { const t = SG.ink && trimCanvas(SG.cv); if (!t) return fail("Draw your signature in the box first."); blob = await canvasBlob(t); }
      else if (SG.tab === "type") {
        if (!SG.text.trim()) return fail("Type your name first.");
        const css = SIGFONTS.find(f => f[0] === SG.font)[1], font = `500 110px ${css}`; try { await document.fonts.load(font, SG.text); } catch {}
        const cv = document.createElement("canvas"); let c = cv.getContext("2d"); c.font = font; cv.width = Math.ceil(c.measureText(SG.text).width) + 80; cv.height = 260;
        c = cv.getContext("2d"); c.font = font; c.fillStyle = "#141a2e"; c.textBaseline = "middle"; c.fillText(SG.text, 40, 130); blob = await canvasBlob(trimCanvas(cv) || cv);
      } else { if (!SG.file) return fail("Choose a picture of your signature first."); blob = SG.file; }
      ED.sig = await makeAsset(blob);
      closeSig(); ED.cur = "sign"; ED.sel = null; buildBar(); redrawAll(); setTip("Click on the page where your signature goes.");
    } catch (e) { fail(e.message); }
  };

  /* export */
  async function exportEdits() {
    const doc = await loadDoc(ED.entry.bytes), font = await doc.embedFont(StandardFonts.Helvetica), emb = new Map();
    for (const i of ED.pages.keys()) {
      const objs = ED.objs.filter(o => o.page === i); if (!objs.length) continue; const page = doc.getPage(i);
      await inView(page, async v => {
        const H = v.H;
        for (const o of objs) {
          const r = { x: o.x, y: H - o.y - o.h, width: o.w, height: o.h };
          if (o.type === "text") { for (const [k, line] of o.text.split("\n").entries()) await drawTextSmart(page, doc, font, line, { x: o.x, y: H - (o.y + o.size * 0.95 + k * o.size * 1.2), size: o.size, color: o.color }); }
          else if (o.type === "ink") { if (o.pts.length < 2) page.drawCircle({ x: o.pts[0][0], y: H - o.pts[0][1], size: o.width / 2, color: hexRgb(o.color) }); else page.drawSvgPath(inkPath(o), { x: 0, y: H, borderColor: hexRgb(o.color), borderWidth: o.width, borderLineCap: LineCapStyle.Round }); }
          else if (o.type === "rect") page.drawRectangle({ ...r, borderColor: hexRgb(o.color), borderWidth: o.width });
          else if (o.type === "ellipse") page.drawEllipse({ x: o.x + o.w / 2, y: H - o.y - o.h / 2, xScale: o.w / 2, yScale: o.h / 2, borderColor: hexRgb(o.color), borderWidth: o.width });
          else if (o.type === "highlight") page.drawRectangle({ ...r, color: hexRgb(o.color), opacity: 0.38, blendMode: BlendMode.Multiply });
          else if (o.type === "white") page.drawRectangle({ ...r, color: rgb(1, 1, 1) });
          else if (o.type === "image") { const a = ED.assets.get(o.asset); if (!emb.has(a.id)) emb.set(a.id, a.type === "jpg" ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes)); page.drawImage(emb.get(a.id), r); }
        }
      });
    }
    return await doc.save();
  }
  async function exportRedact() {
    const src = await loadDoc(ED.entry.bytes), out = await PDFDocument.create(); let n = 0;
    for (const [i, P] of ED.pages.entries()) {
      const boxes = ED.objs.filter(o => o.page === i && o.type === "redact");
      if (!boxes.length) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue; }
      setTip(`Rebuilding page ${i + 1}…`);
      const { cv, scale } = await renderPage(ED.js, i + 1, { scale: 2.2 }), c = cv.getContext("2d"); c.fillStyle = "#000";
      for (const b of boxes) c.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      const img = await out.embedJpg(await canvasBytes(cv, "image/jpeg", 0.9)); out.addPage([P.w, P.h]).drawImage(img, { x: 0, y: 0, width: P.w, height: P.h }); n++;
    }
    return { data: await out.save(), note: `Redacted ${n} page${n === 1 ? "" : "s"}. The hidden content is removed` };
  }
  async function exportCrop() {
    const doc = await loadDoc(ED.entry.bytes); let n = 0;
    doc.getPages().forEach((page, i) => {
      const o = ED.objs.find(x => x.type === "crop" && (ED.cropAll || x.page === i)); if (!o) return;
      const v = viewInfo(page), x = clamp(o.x, 0, v.W), y = clamp(o.y, 0, v.H), w = Math.min(o.w, v.W - x), hh = Math.min(o.h, v.H - y); if (w < 4 || hh < 4) return;
      const [ax, ay] = viewToPdf(v, x, v.H - y), [bx, by] = viewToPdf(v, x + w, v.H - y - hh), box = [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
      page.setMediaBox(...box); page.setCropBox(...box); n++;
    });
    return { data: await doc.save(), note: `Cropped ${n} page${n === 1 ? "" : "s"}` };
  }
  async function finish() {
    commitText(); const mode = ED.mode, need = mode === "redact" ? "redact" : mode === "crop" ? "crop" : null;
    if (need ? !ED.objs.some(o => o.type === need) : !ED.objs.length) return toast(mode === "crop" ? "Drag a box around the part to keep first." : mode === "redact" ? "Drag a box over what to hide first." : "Nothing has been added yet.");
    const btn = $("edFinish"); if (btn) btn.disabled = true; setTip("Building your PDF…");
    try {
      const r = mode === "redact" ? await exportRedact() : mode === "crop" ? await exportCrop() : { data: await exportEdits(), note: "Changes applied" };
      tvFinish({ files: [one(ED.entry, ED.m.suffix, r.data)], note: r.note });
    } catch (e) { console.warn(e); toast(e.message || "The PDF could not be built."); setTip(ED.m.tip); if (btn) btn.disabled = false; }
  }
  App.editor = { open, get state() { return ED; } };
}
