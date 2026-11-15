# Third-party notices

Screenside bundles the libraries below, unmodified, inside `index.html`. The same files are in `source/vendor/`. Each keeps its own licence; the full texts are in the `licenses/` folder.

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
