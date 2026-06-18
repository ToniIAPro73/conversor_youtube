# Browser Support

## Supported

- Chromium-based browsers with `File`, `Blob`, `createImageBitmap`,
  `HTMLCanvasElement.toBlob`, object URLs, and module dynamic import support.
- Modern Firefox and Safari are expected for the same APIs, but should be
  validated before Production promotion.

## Required APIs

- File input and drag/drop.
- `File.arrayBuffer()` and `File.text()`.
- `createImageBitmap()`.
- Canvas 2D and `canvas.toBlob()`.
- `URL.createObjectURL()` and `URL.revokeObjectURL()`.
- Dynamic `import()` for `pdf-lib`, `exifr`, and `fflate`.

## Deferred

- `OffscreenCanvas` worker path.
- PDF.js thumbnails.
- AVIF encode UI.
- HEIC/HEIF, TIFF, RAW, PSD, SVG complex, and animated GIF.
