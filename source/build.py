#!/usr/bin/env python3
"""Builds the single-file site.

    python3 source/build.py

Reads source/src, source/vendor and source/site.json; writes index.html and SHA256SUMS
in the repository root. Needs Python 3.8+ and nothing else. The output is deterministic:
the same inputs always give the same index.html and the same fingerprint.
"""
import base64, hashlib, json, pathlib, re

here = pathlib.Path(__file__).resolve().parent
root, src, vendor = here.parent, here / "src", here / "vendor"

site = json.loads((here / "site.json").read_text(encoding="utf-8"))
for key in ("kofi", "source"):
    assert site[key] == "" or site[key].startswith("https://"), f"site.json: {key} must be empty or an https:// link"

PARTS = ["core.js", "toolview.js", "convert.js", "crypto.js", "tools.js", "editor.js", "organize.js", "boot.js"]
js = "\n".join(f"/* ===== {p} ===== */\n" + (src / p).read_text(encoding="utf-8") for p in PARTS)
js = re.sub(r"/\*SITE\*/.*?/\*ENDSITE\*/", lambda m: json.dumps(site), js, flags=re.S)

# Libraries are stored inside the page as inert base64 blocks and started from memory,
# so the page never has to fetch anything.
LIBS = {
    "pdf-lib.min.js": "lib:pdflib", "jszip.min.js": "lib:jszip", "pdf.min.js": "lib:pdfjs", "pdf.worker.min.js": "lib:worker",
    "pptxgen.bundle.js": "lib:./vendor/pptxgen.bundle.js",
    "wasm/jbig2.wasm": "lib:wasm/jbig2.wasm", "wasm/openjpeg.wasm": "lib:wasm/openjpeg.wasm", "wasm/qcms_bg.wasm": "lib:wasm/qcms_bg.wasm",
}
embeds = "\n".join(
    f'<script type="application/octet-stream" id="{i}">{base64.b64encode((vendor / f).read_bytes()).decode()}</script>' for f, i in LIBS.items())

PROLOGUE = '''if (window.top !== window.self) { document.body.textContent = "Screenside does not run inside another site's frame. Open it directly."; throw new Error("framed"); }
const PUBLIC_BUILD = true;
const embeddedBytes = id => { const el = document.getElementById("lib:" + id); if (!el) return null; const bin = atob(el.textContent), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const embeddedLib = id => { const u = embeddedBytes(id.replace(/^lib:/, "")); return u && URL.createObjectURL(new Blob([u], { type: "text/javascript" })); };
const addLib = id => new Promise((res, rej) => { const el = document.createElement("script"); el.src = embeddedLib(id); el.onload = res; el.onerror = rej; document.head.append(el); });
await addLib("pdflib"); await addLib("jszip");
const pdfjsLib = await import(embeddedLib("pdfjs"));
pdfjsLib.GlobalWorkerOptions.workerSrc = embeddedLib("worker");
const PDFJS_EXTRA = { wasmUrl: "embedded/", useWorkerFetch: false, BinaryDataFactory: class { async fetch({ filename }) { const u = embeddedBytes("wasm/" + filename); if (!u) throw new Error("not bundled: " + filename); return u; } } };
'''
js = re.sub(r"/\*PROLOGUE\*/.*?/\*END\*/", lambda m: PROLOGUE, js, flags=re.S)

html = (src / "head.html").read_text(encoding="utf-8")
html = re.sub(r"<link[^>]*fonts\.g[^>]*>\n", "", html)   # no web fonts: the page loads nothing from outside
html = html.replace('<script src="./vendor/pdf-lib.min.js"></script>\n<script src="./vendor/jszip.min.js"></script>', embeds)
assert "vendor/pdf-lib" not in html and "fonts.googleapis" not in html

# The policy names the exact script by its hash, so nothing else inline can run, and forbids every outgoing connection.
script_hash = base64.b64encode(hashlib.sha256(("\n" + js + "\n").encode()).digest()).decode()
csp = ("default-src 'none'; script-src 'sha256-%s' 'wasm-unsafe-eval' blob:; worker-src blob:; child-src blob:; style-src 'unsafe-inline'; img-src blob: data:; "
       "connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'") % script_hash
html = html.replace("<!--CSP-->", f'<meta http-equiv="Content-Security-Policy" content="{csp}">')
before, after = html.split("/*__SCRIPT__*/")
assert before.endswith('<script type="module">\n') and after.startswith("\n</script>")
html = before + js + after

data = html.encode("utf-8")
(root / "index.html").write_bytes(data)
fingerprint = hashlib.sha256(data).hexdigest()
(root / "SHA256SUMS").write_text(f"{fingerprint}  index.html\n", encoding="utf-8")
print(f"index.html written: {len(data) // 1024} KB")
print(f"SHA-256 fingerprint: {fingerprint}")
