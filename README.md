# KloudPDF — PDF tools. Made simple.

A lightweight, privacy-focused, 100% browser-based PDF utility platform. Organize, convert, edit, and protect your PDF documents directly on your device.

---

## 🔒 Privacy & Architecture Guarantees

- **100% Client-Side:** All document processing runs entirely in your local browser using client-side JavaScript, WebAssembly, and Canvas.
- **Zero Server Uploads:** Documents are never uploaded to any backend or third-party service.
- **No Tracking or Storage:** Files are stored strictly in temporary browser memory. When you reset or close the browser tab, all memory references are garbage collected.
- **No Registration or Accounts:** Instant access to all tools.

---

## 🛠️ Supported Tools

### A. Organize PDF
1. **Merge PDF:** Combine multiple PDF documents into a single unified file.
2. **Split PDF:** Extract specific page ranges (e.g. `1-3, 5, 8-10`) or pages.
3. **Organize PDF:** Visual page grid to reorder, rotate individual pages, or delete pages.
4. **Rotate PDF:** Rotate all or selected pages (+90°, 180°, +270°).
5. **Remove PDF Pages:** Visually click or specify pages to remove from your document.
6. **Extract PDF Pages:** Visually choose and extract specific pages into a new PDF.

### B. Convert PDF
7. **JPG to PDF:** Convert JPG, JPEG, and PNG images into a PDF with configurable orientation (Portrait, Landscape, Fit Image) and margins.
8. **PDF to JPG:** Render all pages to high-resolution JPEG images. Downloads a single image or an automatic `.zip` archive for multiple pages.

### C. Edit PDF
9. **Add Watermark:** Apply customizable text watermarks with control over position (Center diagonal, Top, Bottom), color, font size, and opacity.
10. **Add Page Numbers:** Insert formatted page numbers with customizable position and format templates (`Page {n} of {total}`, `Page {n}`, `{n}`).

### D. Protect PDF
11. **Protect PDF:** Encrypt documents with real client-side AES password protection.

---

## 💻 Tech Stack

- **React 18 & TypeScript:** Strict-mode type safety and component architecture
- **Vite:** Fast modern build tooling with code-splitting
- **Vanilla CSS:** Design system with strict design guidelines (no purple, no gradients, no glowing effects, Apple/Microsoft inspired utility aesthetics)
- **PDF-lib:** Client-side PDF page manipulation, merging, splitting, watermarking, and numbering
- **PDF.js (`pdfjs-dist`):** High-fidelity canvas rendering and visual thumbnail generation
- **`@pdfsmaller/pdf-encrypt`:** Zero-dependency client-side AES PDF encryption
- **Lucide React:** Clean, consistent iconography

---

## 🚀 Getting Started

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

---

## 📄 License
MIT License. Built for speed, simplicity, and absolute document privacy.
