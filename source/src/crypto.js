/* ---------- PDF password protection: standard security handler, V5 / R6, AES-256 ---------- */
const catBytes = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const hexOf = b => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
async function encryptPdf(bytes, userPw, ownerPw = userPw) {
  const te = new TextEncoder(), pwb = p => te.encode(p.normalize("NFKC")).slice(0, 127), rnd = n => crypto.getRandomValues(new Uint8Array(n)), Z = new Uint8Array(16);
  const sha = async (alg, d) => new Uint8Array(await crypto.subtle.digest(alg, d));
  const cbc = async (key, iv, data, pad) => {
    const ck = await crypto.subtle.importKey("raw", key.slice(), "AES-CBC", false, ["encrypt"]), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, ck, data));
    return pad ? ct : ct.slice(0, data.length);
  };
  /* ISO 32000-2, algorithm 2.B: the hardened password hash */
  async function hash(pw, salt, u = new Uint8Array(0)) {
    let k = await sha("SHA-256", catBytes(pw, salt, u));
    for (let i = 0; ;) {
      const block = catBytes(pw, k, u), k1 = new Uint8Array(block.length * 64); for (let j = 0; j < 64; j++) k1.set(block, j * block.length);
      const e = await cbc(k.subarray(0, 16), k.subarray(16, 32), k1, false); let m = 0; for (let j = 0; j < 16; j++) m += e[j];
      k = await sha(["SHA-256", "SHA-384", "SHA-512"][m % 3], e); i++;
      if (i >= 64 && e[e.length - 1] <= i - 32) break;
    }
    return k.slice(0, 32);
  }
  const doc = await PDFDocument.load(bytes, { updateMetadata: false }), ctx = doc.context;
  const id = rnd(16), P = -4, fk = rnd(32), up = pwb(userPw), op = pwb(ownerPw), uvs = rnd(8), uks = rnd(8), ovs = rnd(8), oks = rnd(8);
  const U = catBytes(await hash(up, uvs), uvs, uks), UE = await cbc(await hash(up, uks), Z, fk, false);
  const O = catBytes(await hash(op, ovs, U), ovs, oks), OE = await cbc(await hash(op, oks, U), Z, fk, false);
  const pm = new Uint8Array(16); new DataView(pm.buffer).setInt32(0, P, true); pm.set([255, 255, 255, 255, 84, 97, 100, 98], 4); pm.set(rnd(4), 12);
  const Perms = await cbc(fk, Z, pm, false);
  /* V5/R6 (AESV3): every string and stream is encrypted with the file key itself, no per-object derivation */
  const aes = async data => { const iv = rnd(16); return catBytes(iv, await cbc(fk, iv, data, true)); };
  const isStr = v => v instanceof PDFString || v instanceof PDFHexString;
  const encStr = async v => PDFHexString.of(hexOf(await aes(v.asBytes())));
  async function walk(obj) {
    if (obj instanceof PDFDict) { for (const [name, v] of obj.entries()) { if (isStr(v)) obj.set(name, await encStr(v)); else if (v instanceof PDFDict || v instanceof PDFArray) await walk(v); } }
    else if (obj instanceof PDFArray) { for (let i = 0; i < obj.size(); i++) { const v = obj.get(i); if (isStr(v)) obj.set(i, await encStr(v)); else if (v instanceof PDFDict || v instanceof PDFArray) await walk(v); } }
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PL.PDFStream) { await walk(obj.dict); ctx.assign(ref, PDFRawStream.of(obj.dict, await aes(obj instanceof PDFRawStream ? obj.contents : obj.getContents()))); }
    else if (isStr(obj)) ctx.assign(ref, await encStr(obj));
    else await walk(obj);
  }
  const enc = ctx.obj({ Filter: "Standard", V: 5, R: 6, Length: 256, P, EncryptMetadata: true, StmF: "StdCF", StrF: "StdCF", CF: { StdCF: { Type: "CryptFilter", CFM: "AESV3", AuthEvent: "DocOpen", Length: 32 } } });
  for (const [k, v] of Object.entries({ O, U, OE, UE, Perms })) enc.set(PDFName.of(k), PDFHexString.of(hexOf(v)));
  ctx.trailerInfo.Encrypt = ctx.register(enc);
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(hexOf(id)), PDFHexString.of(hexOf(id))]);
  return await PL.PDFWriter.forContext(ctx, 50).serializeToBuffer();
}
