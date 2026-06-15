# Link2Media Third-Party Licenses

This document lists all third-party dependencies used by Link2Media, their licenses, and compatibility notes.

---

## Node.js Dependencies

### Production Dependencies

| Package | Version | License | Description |
|---|---|---|---|
| `@base-ui/react` | 1.5.0 | MIT | Unstyled React UI primitives |
| `better-sqlite3` | 12.10.1 | MIT | SQLite3 binding for Node.js |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | CSS class variant utilities |
| `clsx` | 2.1.1 | MIT | Conditional className utility |
| `csv-parse` | 7.0.0 | MIT | CSV parsing library |
| `csv-stringify` | 6.8.0 | MIT | CSV stringification library |
| `fast-xml-parser` | 5.8.0 | MIT | XML parsing and building |
| `file-type` | 22.0.1 | MIT | File type detection by magic bytes |
| `lucide-react` | 1.18.0 | ISC | Icon library for React |
| `next` | 16.2.9 | MIT | React framework (App Router) |
| `next-themes` | 0.4.6 | MIT | Dark/light mode for Next.js |
| `react` | 19.2.4 | MIT | React UI library |
| `react-dom` | 19.2.4 | MIT | React DOM rendering |
| `shadcn` | 4.11.0 | MIT | UI component scaffolding CLI |
| `sharp` | 0.35.1 | Apache-2.0 | Image processing (libvips) |
| `smol-toml` | 1.6.1 | BSD-3-Clause | TOML parser/stringifier |
| `sonner` | 2.0.7 | MIT | Toast notification library |
| `tailwind-merge` | 3.6.0 | MIT | Tailwind class merging utility |
| `tw-animate-css` | 1.4.0 | MIT | Tailwind CSS animation utilities |
| `yaml` | 2.9.0 | ISC | YAML parser/stringifier |
| `zod` | 4.4.3 | MIT | TypeScript schema validation |

### Development Dependencies

| Package | Version | License | Description |
|---|---|---|---|
| `@playwright/test` | 1.60.0 | Apache-2.0 | E2E testing framework |
| `@tailwindcss/postcss` | 4.3.1 | MIT | Tailwind CSS PostCSS plugin |
| `@testing-library/dom` | 10.4.1 | MIT | DOM testing utilities |
| `@testing-library/jest-dom` | 6.9.1 | MIT | Jest DOM matchers |
| `@testing-library/react` | 16.3.2 | MIT | React testing utilities |
| `@types/better-sqlite3` | 7.6.13 | MIT | TypeScript types for better-sqlite3 |
| `@types/csv-parse` | 1.2.5 | MIT | TypeScript types for csv-parse |
| `@types/node` | 20.x | MIT | TypeScript types for Node.js |
| `@types/react` | 19.x | MIT | TypeScript types for React |
| `@types/react-dom` | 19.x | MIT | TypeScript types for React DOM |
| `@types/sharp` | 0.32.0 | MIT | TypeScript types for sharp |
| `@vitejs/plugin-react` | 6.0.2 | MIT | Vite React plugin |
| `eslint` | 9.x | MIT | JavaScript linter |
| `eslint-config-next` | 16.2.9 | MIT | ESLint config for Next.js |
| `jsdom` | 29.1.1 | MIT | DOM implementation for Node.js |
| `tailwindcss` | 4.x | MIT | CSS utility framework |
| `typescript` | 5.x | Apache-2.0 | TypeScript compiler |
| `vitest` | 4.1.8 | MIT | Vite-native test framework |

---

## External Tools

These are system-level tools that Link2Media optionally uses for conversion. They are **not bundled** with Link2Media (except in the Windows portable distribution where noted).

| Tool | License | Categories | Bundled in Portable |
|---|---|---|---|
| **FFmpeg** | LGPL-2.1+ (with optional GPL components) | Audio, Video | Yes |
| **FFprobe** | LGPL-2.1+ | Audio/Video analysis | Yes |
| **yt-dlp** | Unlicense | YouTube downloads | Yes |
| **Pandoc** | GPL-2.0+ | Documents, Plain text | No |
| **LibreOffice** | MPL-2.0 | Office formats | No |
| **QPDF** | Apache-2.0 | PDF | No |
| **7-Zip** | LGPL-2.1+ (unRAR code is restricted) | Archives | No |
| **Calibre** (ebook-convert) | GPL-3.0 | Ebooks | No |
| **Tesseract** | Apache-2.0 | OCR | No |
| **Poppler** (pdftoppm) | GPL-2.0 | PDF → image for OCR | No |
| **Node.js** | MIT (with OpenSSL, ICU, etc.) | Runtime | Yes |

### FFmpeg License Notes

FFmpeg can be compiled with different configurations affecting its license:
- **LGPL-2.1+ build**: Default; supports most codecs
- **GPL build**: Includes GPL-licensed codecs (e.g., x264, x265)
- The Windows portable distribution uses a pre-built LGPL-2.1+ build
- Verify with `ffmpeg -L` to see your build's license

### 7-Zip License Notes

7-Zip is distributed under the GNU LGPL + unRAR restriction. The unRAR code cannot be used to reverse-engineer the RAR compression algorithm. Using 7-Zip to extract RAR files is permitted.

---

## License Compatibility

Link2Media is distributed under the **MIT License**, which is permissive and compatible with most other licenses. Here are the key compatibility considerations:

### Permissive Licenses (Compatible with MIT)

- **MIT**: All MIT-licensed packages can be freely used
- **Apache-2.0**: Compatible with MIT; includes patent grant
- **ISC**: Functionally equivalent to MIT
- **BSD-3-Clause**: Compatible with MIT

### Copyleft Licenses (Not Bundled, Used as External Tools)

- **GPL-2.0+** (Pandoc, Poppler): Copyleft; Link2Media invokes these as separate processes via `child_process.spawn`. No GPL code is linked or bundled.
- **GPL-3.0** (Calibre): Same as above — invoked as external process.
- **MPL-2.0** (LibreOffice): Weak copyleft; invoked as external process.

### Key Distinction

Link2Media **does not link against or bundle** GPL-licensed code. All GPL-licensed tools (Pandoc, LibreOffice, Calibre, Poppler) are invoked as separate processes via `child_process.spawn` with `shell: false`. This means:

1. Link2Media's MIT license is not affected by the GPL licenses of external tools
2. Users must separately install and agree to the licenses of external tools
3. The Windows portable distribution includes FFmpeg (LGPL-2.1+) and yt-dlp (Unlicense), which are compatible

### Sharp / libvips

Sharp includes a pre-built binary of libvips, which is licensed under the **LGPL-2.1+**. Sharp itself is Apache-2.0. The libvips binary is dynamically linked, maintaining LGPL compliance.

### better-sqlite3

better-sqlite3 includes SQLite source code, which is in the **public domain**. The Node.js binding itself is MIT-licensed.

---

## Attribution

This project uses open-source software. We gratefully acknowledge the contributors of all the packages and tools listed above.
