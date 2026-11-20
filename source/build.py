#!/usr/bin/env python3
"""Builds the Screenside site.

    python3 source/build.py

Reads source/src, source/vendor and source/site.json. Writes, in the repository root:

    index.html   the whole site in one file, including the text-recognition engine and its English and French data
    SHA256SUMS   the fingerprint of that file

Needs Python 3.8+ and nothing else. The output is deterministic: the same inputs always
give the same page and the same fingerprint.
"""
import base64, gzip, hashlib, json, pathlib, re

here = pathlib.Path(__file__).resolve().parent
root, src, vendor = here.parent, here / "src", here / "vendor"

site = json.loads((here / "site.json").read_text(encoding="utf-8"))
for key in ("kofi", "source"):
    assert site[key] == "" or site[key].startswith("https://"), f"site.json: {key} must be empty or an https:// link"

PARTS = ["core.js", "toolview.js", "convert.js", "crypto.js", "tools.js", "tools2.js", "tools3.js", "ocr.js", "editor.js", "organize.js", "boot.js"]
APP = "\n".join(f"/* ===== {p} ===== */\n" + (src / p).read_text(encoding="utf-8") for p in PARTS)
APP = re.sub(r"/\*SITE\*/.*?/\*ENDSITE\*/", lambda m: json.dumps(site), APP, flags=re.S)
HEAD = (src / "head.html").read_text(encoding="utf-8")

# Libraries are stored inside the page as inert base64 blocks and started from memory,
# so the page never has to fetch anything. Everything that is not already compressed is
# gzip-packed first, which nearly halves the page; the script below inflates it on load.
LIBS = {
    "pdf-lib.min.js": "lib:pdflib", "jszip.min.js": "lib:jszip", "pdf.min.js": "lib:pdfjs", "pdf.worker.min.js": "lib:worker",
    "pptxgen.bundle.js": "lib:./vendor/pptxgen.bundle.js",
    "wasm/jbig2.wasm": "lib:wasm/jbig2.wasm", "wasm/openjpeg.wasm": "lib:wasm/openjpeg.wasm", "wasm/qcms_bg.wasm": "lib:wasm/qcms_bg.wasm",
}
OCR_LIBS = {
    "ocr/tesseract.min.js": "lib:./vendor/ocr/tesseract.min.js", "ocr/worker.min.js": "lib:./vendor/ocr/worker.min.js",
    "ocr/tesseract-core-simd-lstm.wasm.js": "lib:./vendor/ocr/tesseract-core-simd-lstm.wasm.js",
    "ocr/eng.traineddata.gz": "lib:ocr/eng.traineddata.gz", "ocr/fra.traineddata.gz": "lib:ocr/fra.traineddata.gz",
}

def lib_bytes(name):
    data = (vendor / name).read_bytes()
    if name == "ocr/worker.min.js":
        # One-token fix to Tesseract.js 7.0.0. When language data is handed over directly instead of being
        # downloaded, start-up reads the language code from the wrong field ("data" instead of "code") and fails.
        # Handing the data over directly is what lets this page run with every outgoing connection blocked.
        bad, good = b'"string"==typeof t?t:t.data})).join("+")', b'"string"==typeof t?t:t.code})).join("+")'
        assert data.count(bad) == 1, "worker.min.js is not the expected Tesseract.js 7.0.0 build"
        data = data.replace(bad, good)
    return data

def embed(libs):
    tags = []
    for f, i in libs.items():
        data = lib_bytes(f)
        if f.endswith(".gz"):   # already compressed: packing it again would only grow it
            tags.append(f'<script type="application/octet-stream" id="{i}">{base64.b64encode(data).decode()}</script>')
        else:   # mtime=0 keeps the output identical on every machine
            tags.append(f'<script type="application/octet-stream" id="{i}" data-gz>{base64.b64encode(gzip.compress(data, 9, mtime=0)).decode()}</script>')
    return "\n".join(tags)

PROLOGUE = '''if (window.top !== window.self) { document.body.textContent = "Screenside does not run inside another site's frame. Open it directly."; throw new Error("framed"); }
const PUBLIC_BUILD = true, OCR_EMBEDDED = %s;
const libRaw = new Map();
const b64bytes = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const embeddedBytes = id => libRaw.get(id) ?? (el => { if (!el) return null; const u = b64bytes(el.textContent); libRaw.set(id, u); el.textContent = ""; return u; })(document.getElementById("lib:" + id));
const embeddedLib = id => { const u = embeddedBytes(id.replace(/^lib:/, "")); return u && URL.createObjectURL(new Blob([u], { type: "text/javascript" })); };
const addLib = id => new Promise((res, rej) => { const el = document.createElement("script"); el.src = embeddedLib(id); el.onload = res; el.onerror = rej; document.head.append(el); });
const packed = [...document.querySelectorAll("script[data-gz]")];
if (packed.length) {
  if (typeof DecompressionStream !== "function") { document.body.textContent = "This browser is too old to run this page. Update it and try again."; throw new Error("no DecompressionStream"); }
  await Promise.all(packed.map(async el => {
    const stream = new Blob([b64bytes(el.textContent)]).stream().pipeThrough(new DecompressionStream("gzip"));
    libRaw.set(el.id.slice(4), new Uint8Array(await new Response(stream).arrayBuffer()));
    el.textContent = "";
  }));
}
await addLib("pdflib"); await addLib("jszip");
const pdfjsLib = await import(embeddedLib("pdfjs"));
pdfjsLib.GlobalWorkerOptions.workerSrc = embeddedLib("worker");
const PDFJS_EXTRA = { wasmUrl: "embedded/", useWorkerFetch: false, BinaryDataFactory: class { async fetch({ filename }) { const u = embeddedBytes("wasm/" + filename); if (!u) throw new Error("not bundled: " + filename); return u; } } };
'''

def build(name, with_ocr):
    js = re.sub(r"/\*PROLOGUE\*/.*?/\*END\*/", lambda m: PROLOGUE % ("true" if with_ocr else "false"), APP, flags=re.S)
    html = re.sub(r"<link[^>]*fonts\.g[^>]*>\n", "", HEAD)   # no web fonts: the page loads nothing from outside
    libs = dict(LIBS, **OCR_LIBS) if with_ocr else LIBS
    html = html.replace('<script src="./vendor/pdf-lib.min.js"></script>\n<script src="./vendor/jszip.min.js"></script>', "<!--LIBS-->")
    assert "vendor/pdf-lib" not in html and "fonts.googleapis" not in html
    # The policy names the exact script by its hash, so nothing else inline can run, and forbids every outgoing connection.
    script_hash = base64.b64encode(hashlib.sha256(("\n" + js + "\n").encode()).digest()).decode()
    csp = ("default-src 'none'; script-src 'sha256-%s' 'wasm-unsafe-eval' blob:; worker-src blob:; child-src blob:; style-src 'unsafe-inline'; img-src blob: data:; "
           "connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'") % script_hash
    html = html.replace("<!--CSP-->", f'<meta http-equiv="Content-Security-Policy" content="{csp}">')
    before, after = html.split("/*__SCRIPT__*/")
    assert before.endswith('<script type="module">\n') and after.startswith("\n</script>")
    head_part, tail_part = before.split("<!--LIBS-->")
    data = (head_part + embed(libs) + tail_part + js + after).encode("utf-8")
    # every embedded block must decode back to the vendor file it was built from
    text = data.decode("utf-8")
    for f, i in libs.items():
        m = re.search(r'<script type="application/octet-stream" id="' + re.escape(i) + r'"( data-gz)?>([^<]*)</script>', text)
        assert m, f"{name}: embedded block {i} is missing"
        raw = base64.b64decode(m.group(2))
        assert (gzip.decompress(raw) if m.group(1) else raw) == lib_bytes(f), f"{name}: embedded block {i} does not round-trip"
    (root / name).write_bytes(data)
    fingerprint = hashlib.sha256(data).hexdigest()
    print(f"{name}: {len(data) / 1e6:.1f} MB  SHA-256 {fingerprint}")
    return f"{fingerprint}  {name}\n"

sums = build("index.html", True)
(root / "SHA256SUMS").write_text(sums, encoding="utf-8")
