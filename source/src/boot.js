/* ---------- routing ---------- */
const VIEWS = ["home", "tool", "organize", "editor"];
App.show = v => { for (const n of VIEWS) $("v-" + n).classList.toggle("on", n === v); $("allTools").hidden = v === "home"; };
App.go = () => {
  const id = decodeURIComponent(location.hash.slice(1)) || "home", t = TOOL[id], files = App.pending; App.pending = null; App.route = t ? id : "home";
  if (!t) { App.show("home"); return; }
  if (t.link) { location.href = t.link; return; }
  if (t.view === "organize") { App.show("organize"); App.organize.enter(files); return; }
  App.show("tool"); openTool(t, files); $("v-tool").firstElementChild.scrollTop = 0;
};
addEventListener("hashchange", App.go);
for (const ev of ["dragover", "drop"]) addEventListener(ev, e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
buildHome(); App.go();
