On-device text recognition, used by the import box to read screenshots, photos and
scanned PDFs. Nothing is uploaded: the picture is read in the browser.

  tesseract.min.js, worker.min.js      tesseract.js 7.0.0        Apache-2.0
  tesseract-core-*-lstm.wasm.js        tesseract.js-core 7.0.0   Apache-2.0
  eng.traineddata.gz                   @tesseract.js-data/eng 1.0.0 (4.0.0_best_int)

The browser picks ONE of the three core files to suit the device. These files are not in
the service worker's install list; they are cached the first time they are fetched and
kept across app updates (see OCR_CACHE in sw.js).
