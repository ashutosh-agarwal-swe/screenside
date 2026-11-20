# Third-party notices

Screenside bundles the libraries below inside `index.html`. All are unmodified except for one documented change to Tesseract.js, described further down. The same files are in `source/vendor/`. Each keeps its own licence; the full texts are in the `licenses/` folder.

| Library | Version | Used for | Licence | Licence text |
|---|---|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`), Mozilla Foundation | 6.2.108 | Reading and drawing PDF pages | Apache-2.0 | `licenses/pdfjs-LICENSE.txt` |
| [pdf-lib](https://github.com/Hopding/pdf-lib), Andrew Dillon | 1.17.1 | Writing and changing PDFs | MIT | `licenses/pdf-lib-LICENSE.md` |
| [JSZip](https://github.com/Stuk/jszip), Stuart Knightley and contributors | 3.10.1 | Reading and writing ZIP-based files | MIT (dual-licensed MIT or GPLv3; used here under MIT) | `licenses/jszip-LICENSE.md` |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS), Brent Ely | 4.0.1 | Writing PowerPoint files | MIT | `licenses/pptxgenjs-LICENSE.txt` |

PDF.js ships three image and colour decoders, which are bundled as well:

| Decoder | Used for | Licence text |
|---|---|---|
| JBIG2 decoder (from PDFium) | Scanned black-and-white pages | `licenses/pdfjs-wasm-LICENSE_JBIG2.txt`, `licenses/pdfjs-wasm-LICENSE_PDFJS_JBIG2.txt` |
| OpenJPEG | JPEG 2000 pictures | `licenses/pdfjs-wasm-LICENSE_OPENJPEG.txt`, `licenses/pdfjs-wasm-LICENSE_PDFJS_OPENJPEG.txt` |
| qcms | Colour profiles | `licenses/pdfjs-wasm-LICENSE_QCMS.txt`, `licenses/pdfjs-wasm-LICENSE_PDFJS_QCMS.txt` |

The PptxGenJS bundle contains its own copy of JSZip 3.10.1, under the same licence as above.

To get the original, unminified source of any library, install the listed version from npm or follow the link in the table.

## Text recognition

| Component | Version | Used for | Licence | Licence text |
|---|---|---|---|---|
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | Runs text recognition in the browser | Apache-2.0 | `licenses/tesseract.js-LICENSE.md` |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 7.0.0 | The Tesseract engine compiled for browsers (the `simd-lstm` build) | Apache-2.0 | `licenses/tesseract.js-core-LICENSE.txt` |
| [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) English and French models | converted, see below | The language data the engine reads with | Apache-2.0 | same text as the Tesseract.js licence |

The Tesseract.js worker file also contains small libraries under MIT and BSD licences. Their notices are in `licenses/tesseract.js-worker-bundled-notices.txt`.

### The change made to the language models

The English and French models in `source/vendor/ocr/` started as the `tessdata_best` files. They were converted to Tesseract's compact integer form with its own tool, `combine_tessdata -c`, then compressed with gzip. This shrinks them to about a fifth of their size so the whole site fits in one file. On eight deliberately difficult test pages, the converted models reproduced the same share of words as the originals, to within one percentage point.

### The one change made to Tesseract.js

`source/vendor/ocr/worker.min.js` is the original, unmodified file. When the pages are built, `source/build.py` changes one token in the copy it embeds:

- **What:** in the start-up routine, `t.data` becomes `t.code`.
- **Why:** when language data is handed to the engine directly, instead of being downloaded, Tesseract.js 7.0.0 reads the language code from the wrong field and fails to start. Handing the data over directly is what lets Screenside run with every outgoing connection blocked.
- **Where:** the `lib_bytes` function in `source/build.py`, which refuses to build if the file is not the expected one.
