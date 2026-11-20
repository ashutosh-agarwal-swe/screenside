# Screenside

Free PDF tools that run entirely in your browser. Nothing is uploaded.

Merge, split, organize, rotate, compress, convert, edit, annotate, sign, redact, crop, number, watermark, stamp Bates numbers, fill forms, protect and unlock PDFs, inspect or wipe the personal details stored inside a file, pull embedded pictures out, arrange pages for print or a booklet, fit every page to one paper size, convert to greyscale, repair damaged files, fit a file under an upload limit, straighten crooked scans, and make scans searchable in English or French. 41 tools.

**Site:** https://screenside.ca

## How your files are handled

- Files are opened and changed on your device only. There is no server, no account and no tracking.
- The page carries a security policy that blocks every outgoing connection. Even a faulty tool could not send a file anywhere.
- Nothing is saved in the browser. Close the tab and everything is gone.
- The whole site is one file, `index.html`, of about 9 MB. Most of that is the text-recognition engine and its English and French data. It loads nothing from anywhere else.

### What Screenside cannot protect against

- Malware or browser extensions already on your device. Those can read anything you open in any page.
- A weak password on a protected PDF. The encryption is AES-256, but a short password can still be guessed.
- A copy of this site hosted by someone else. Check the fingerprint below before trusting a copy.

Screenside has not been independently audited.

## Verify your copy

The fingerprint (SHA-256) of the official `index.html` is in [`SHA256SUMS`](SHA256SUMS).

To check a copy, compute its fingerprint and compare it with that file:

| System | Command |
|---|---|
| Windows (PowerShell) | `Get-FileHash index.html -Algorithm SHA256` |
| macOS | `shasum -a 256 index.html` |
| Linux | `sha256sum index.html` |

If the two values differ, the copy is not the official one.

## Use it offline

Download `index.html` and open it in a browser. It holds every tool, including text recognition, and works without an internet connection.

## Build it yourself

The site is built from the files in `source/`. You need Python 3.8 or newer and nothing else.

```
python3 source/build.py
```

This rewrites `index.html` and `SHA256SUMS`. The build is deterministic: the same source gives the same fingerprint.

- `source/src/` is the application code.
- `source/vendor/` holds the bundled libraries, unmodified.
- `source/site.json` holds the support link, the contact address and the link to this repository.
- `source/package.json` only lists the bundled library versions so that GitHub can raise security alerts for them.

## Request a feature or report a problem

Email founder@joinscreenside.com. Please do not attach private documents.

## Support

Screenside is free and stays free. If it saved you time, you can leave a tip at https://ko-fi.com/screenside. This is entirely optional and unlocks nothing.

## Licence

Screenside is published under the GNU Affero General Public License v3.0. See `LICENSE`.

It bundles third-party libraries under their own licences. See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Screenside is an independent project and is not affiliated with Smallpdf or any other PDF service. It is provided as is, without warranty.
