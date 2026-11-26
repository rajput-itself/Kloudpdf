/**
 * KloudPDF — Browser-Based OCR Engine
 * 100% Client-Side Text Recognition & Searchable PDF Generator
 * Powered by Tesseract.js Web Workers & pdf-lib
 *
 * Capabilities:
 * - Scanned PDF and JPG/PNG/WebP image OCR.
 * - Language packs: English ('eng'), Hindi ('hin'), Spanish ('spa'), French ('fra'), German ('deu').
 * - Searchable PDF generation with original image + aligned invisible selectable text layer.
 * - Line & word bounding box extraction.
 * - Scanned text inpainting and visual replacement.
 * - Scanned page detection.
 * - Graceful cancellation and resource cleanup.
 */

import { createWorker } from 'tesseract.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';

export type OcrLanguage = 'eng' | 'hin' | 'spa' | 'fra' | 'deu';

export interface OcrBoundingBox {
  x0: number; // in canvas pixels
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLineItem {
  id: string;
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  pdfCoords?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrPageDetail {
  pageNumber: number;
  text: string;
  confidence: number;
  lines: OcrLineItem[];
  imageBlob?: Blob;
  pageWidth: number; // in PDF points
  pageHeight: number; // in PDF points
  rotation: number;
}

export interface OcrResult {
  pages: OcrPageDetail[];
  fullText: string;
  searchablePdfBlob?: Blob;
  totalPages: number;
  language: OcrLanguage;
}

export interface OcrOptions {
  language?: OcrLanguage;
  pageNumbers?: number[];
  generateSearchablePdf?: boolean;
  onProgress?: (status: string, progress: number, currentPage?: number, totalPages?: number) => void;
  signal?: AbortSignal;
}

/**
 * Checks if an active PDF page is a scanned document (lacks embedded text).
 */
export async function detectScannedPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<boolean> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const strCount = textContent.items.reduce((acc, item: any) => acc + (item.str ? item.str.trim().length : 0), 0);
    return strCount < 15;
  } catch {
    return false;
  }
}

/**
 * Preprocesses a canvas image to enhance OCR text recognition on low-quality scans.
 * Increases contrast and converts to high-clarity grayscale.
 */
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const len = d.length;

    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      // Dynamic contrast enhancement
      const contrastVal = gray > 140 ? Math.min(255, gray * 1.1) : Math.max(0, gray * 0.85);
      d[i] = contrastVal;
      d[i + 1] = contrastVal;
      d[i + 2] = contrastVal;
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Canvas security/taint fallback
  }
}

/**
 * Samples the dominant background color around an OCR bounding box for clean inpainting.
 */
export function sampleBackgroundColor(ctx: CanvasRenderingContext2D, bbox: OcrBoundingBox): string {
  try {
    const margin = 3;
    const sampleX = Math.max(0, bbox.x0 - margin);
    const sampleY = Math.max(0, bbox.y0 - margin);
    const sampleW = Math.min(ctx.canvas.width - sampleX, bbox.x1 - bbox.x0 + margin * 2);
    const sampleH = Math.min(ctx.canvas.height - sampleY, bbox.y1 - bbox.y0 + margin * 2);

    const data = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    // Sample pixels from the border edges of the bounding box
    for (let i = 0; i < data.length; i += 16) {
      rSum += data[i]!;
      gSum += data[i + 1]!;
      bSum += data[i + 2]!;
      count++;
    }

    if (count === 0) return '#ffffff';
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return '#ffffff';
  }
}

/**
 * Replaces scanned text visually on canvas:
 * 1. Fills the bounding box with the sampled paper background color (inpainting).
 * 2. Paints the corrected clean vector text on top.
 */
export function inpaintScannedTextOnCanvas(
  canvas: HTMLCanvasElement,
  bbox: OcrBoundingBox,
  replacementText: string,
  options: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
  } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bgColor = sampleBackgroundColor(ctx, bbox);
  const width = bbox.x1 - bbox.x0;
  const height = bbox.y1 - bbox.y0;

  // 1. Inpaint / patch the scanned background
  ctx.fillStyle = bgColor;
  ctx.fillRect(bbox.x0 - 1, bbox.y0 - 1, width + 2, height + 2);

  // 2. Paint replacement text
  if (replacementText.trim()) {
    const fontSize = options.fontSize || Math.max(12, Math.round(height * 0.75));
    const fontFamily = options.fontFamily || 'Helvetica, Arial, sans-serif';
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = options.color || '#000000';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(replacementText, bbox.x0, bbox.y1 - Math.round(height * 0.2));
  }
}

/**
 * Loads an image file onto an HTMLCanvasElement
 */
function loadImageToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      resolve({ canvas, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for OCR processing'));
    };
    img.src = url;
  });
}

/**
 * Compiles recognized pages into a PDF containing original images and invisible searchable text.
 */
export async function generateSearchablePdfFromPages(
  pages: OcrPageDetail[],
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Generating searchable PDF with transparent text layer...');
  const outPdfDoc = await PDFDocument.create();
  const font = await outPdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const pageDetail = pages[i]!;
    if (!pageDetail.imageBlob) continue;

    const imgBuffer = await pageDetail.imageBlob.arrayBuffer();
    let embeddedImg;
    try {
      embeddedImg = await outPdfDoc.embedJpg(imgBuffer);
    } catch {
      embeddedImg = await outPdfDoc.embedPng(imgBuffer);
    }

    const newPage = outPdfDoc.addPage([pageDetail.pageWidth, pageDetail.pageHeight]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: pageDetail.pageWidth,
      height: pageDetail.pageHeight,
    });

    if (pageDetail.rotation) {
      newPage.setRotation({ type: 'degrees' as any, angle: pageDetail.rotation });
    }

    // Overlay recognized lines as invisible selectable text
    for (const line of pageDetail.lines) {
      if (!line.text.trim()) continue;

      let x: number;
      let y: number;
      let fontSize: number;

      if (line.pdfCoords) {
        x = Math.max(0, line.pdfCoords.x);
        y = Math.max(0, pageDetail.pageHeight - line.pdfCoords.y - line.pdfCoords.height);
        fontSize = Math.max(8, Math.min(28, line.pdfCoords.height * 0.8));
      } else {
        const scaleX =
          embeddedImg.width > 0 && embeddedImg.width >= pageDetail.pageWidth
            ? pageDetail.pageWidth / embeddedImg.width
            : 1;
        const scaleY =
          embeddedImg.height > 0 && embeddedImg.height >= pageDetail.pageHeight
            ? pageDetail.pageHeight / embeddedImg.height
            : 1;
        x = line.bbox.x0 * scaleX;
        y = Math.max(0, pageDetail.pageHeight - line.bbox.y1 * scaleY);
        fontSize = Math.max(8, Math.min(28, (line.bbox.y1 - line.bbox.y0) * scaleY * 0.8));
      }

      try {
        newPage.drawText(line.text.trim(), {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0.001, // Invisible selectable text layer
        });
      } catch {
        // Skip unencodable characters
      }
    }
  }

  const pdfBytes = await outPdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}

/**
 * Backwards-compatible alias for runOcrOnImageOrPdf.
 */
export const runOcrOnPdf = runOcrOnImageOrPdf;

/**
 * Main OCR Runner:
 * Supports scanned PDFs and raster images (JPG, PNG, WebP) with Web Workers and cancellation.
 */
export async function runOcrOnImageOrPdf(
  file: File,
  options: OcrOptions = {}
): Promise<OcrResult> {
  const language = options.language ?? 'eng';
  const makeSearchable = options.generateSearchablePdf ?? true;
  const isImageFile = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);

  // Check cancellation before start
  if (options.signal?.aborted) {
    throw new DOMException('OCR processing was canceled.', 'AbortError');
  }

  options.onProgress?.(`Initializing Tesseract OCR worker (${language})...`, 0.05);

  // Initialize client-side Tesseract worker
  const worker = await createWorker(language, undefined, {
    logger: (m) => {
      if (options.signal?.aborted) return;
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        options.onProgress?.(`Recognizing text (${pct}%)...`, (m.progress || 0) * 0.8 + 0.1);
      } else if (m.status) {
        options.onProgress?.(`${m.status}...`, 0.08);
      }
    },
  });

  // Handle cancellation during execution
  const abortHandler = async () => {
    try {
      await worker.terminate();
    } catch {
      // Ignore
    }
  };

  if (options.signal) {
    options.signal.addEventListener('abort', abortHandler, { once: true });
  }

  const pageDetails: OcrPageDetail[] = [];
  const fullTextParts: string[] = [];

  try {
    if (isImageFile) {
      // 1. Single Image Mode
      options.onProgress?.('Preparing image canvas for recognition...', 0.15, 1, 1);
      const { canvas, width, height } = await loadImageToCanvas(file);

      if (options.signal?.aborted) {
        throw new DOMException('OCR processing was canceled.', 'AbortError');
      }

      preprocessCanvasForOcr(canvas);

      // Default PDF points for raster image (72 DPI normalization)
      const pdfW = Math.min(800, width);
      const pdfH = (height / width) * pdfW;
      const scaleX = pdfW / width;
      const scaleY = pdfH / height;

      const ocrResult = await worker.recognize(canvas);
      const recognizedText = ocrResult.data.text.trim();
      const confidence = Math.round(ocrResult.data.confidence || 0);

      // Extract line items
      const lines: OcrLineItem[] = [];
      let lineIdx = 0;
      if (ocrResult.data.blocks) {
        for (const block of ocrResult.data.blocks) {
          for (const para of block.paragraphs) {
            for (const l of para.lines) {
              if (l.text.trim()) {
                lines.push({
                  id: `img-line-${lineIdx++}`,
                  text: l.text.trim(),
                  confidence: Math.round(l.confidence || confidence),
                  bbox: l.bbox,
                  pdfCoords: {
                    x: l.bbox.x0 * scaleX,
                    y: l.bbox.y0 * scaleY,
                    width: (l.bbox.x1 - l.bbox.x0) * scaleX,
                    height: (l.bbox.y1 - l.bbox.y0) * scaleY,
                  },
                });
              }
            }
          }
        }
      }

      const imgBlob = await new Promise<Blob>((res) => {
        canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.94);
      });

      pageDetails.push({
        pageNumber: 1,
        text: recognizedText,
        confidence,
        lines,
        imageBlob: imgBlob,
        pageWidth: pdfW,
        pageHeight: pdfH,
        rotation: 0,
      });

      fullTextParts.push(`--- Recognized Text (OCR Confidence: ${confidence}%) ---\n${recognizedText}\n`);
    } else {
      // 2. PDF Document Mode
      const buffer = await file.arrayBuffer();
      const pdfDoc = await loadPdfDocument(buffer.slice(0));
      const totalPages = pdfDoc.numPages;

      const targetPages =
        options.pageNumbers && options.pageNumbers.length > 0
          ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
          : Array.from({ length: totalPages }, (_, i) => i + 1);

      for (let i = 0; i < targetPages.length; i++) {
        if (options.signal?.aborted) {
          throw new DOMException('OCR processing was canceled.', 'AbortError');
        }

        const pageNum = targetPages[i]!;
        options.onProgress?.(
          `Processing page ${pageNum} of ${totalPages}...`,
          i / targetPages.length,
          i + 1,
          targetPages.length
        );

        const pdfPage = await pdfDoc.getPage(pageNum);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        // Render at 2.0x scale for crisp OCR recognition without excessive memory consumption
        const canvas = document.createElement('canvas');
        await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 2.0 });

        if (options.signal?.aborted) {
          canvas.width = 0;
          canvas.height = 0;
          throw new DOMException('OCR processing was canceled.', 'AbortError');
        }

        preprocessCanvasForOcr(canvas);

        const scaleX = pageWidth / canvas.width;
        const scaleY = pageHeight / canvas.height;

        const ocrResult = await worker.recognize(canvas);
        const recognizedText = ocrResult.data.text.trim();
        const confidence = Math.round(ocrResult.data.confidence || 0);

        // Extract line items
        const lines: OcrLineItem[] = [];
        let lineIdx = 0;
        if (ocrResult.data.blocks) {
          for (const block of ocrResult.data.blocks) {
            for (const para of block.paragraphs) {
              for (const l of para.lines) {
                if (l.text.trim()) {
                  lines.push({
                    id: `p${pageNum}-line-${lineIdx++}`,
                    text: l.text.trim(),
                    confidence: Math.round(l.confidence || confidence),
                    bbox: l.bbox,
                    pdfCoords: {
                      x: l.bbox.x0 * scaleX,
                      y: l.bbox.y0 * scaleY,
                      width: (l.bbox.x1 - l.bbox.x0) * scaleX,
                      height: (l.bbox.y1 - l.bbox.y0) * scaleY,
                    },
                  });
                }
              }
            }
          }
        }

        const imgBlob = await new Promise<Blob>((res) => {
          canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.92);
        });

        // Release canvas memory immediately
        canvas.width = 0;
        canvas.height = 0;

        pageDetails.push({
          pageNumber: pageNum,
          text: recognizedText,
          confidence,
          lines,
          imageBlob: imgBlob,
          pageWidth,
          pageHeight,
          // Viewport & rendered canvas already bake pdfPage.rotate into upright dimensions
          rotation: 0,
        });

        fullTextParts.push(
          `--- Page ${pageNum} (OCR Confidence: ${confidence}%) ---\n${recognizedText}\n`
        );
      }
    }
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
    await worker.terminate();
  }

  // Generate Searchable PDF if requested
  let searchablePdfBlob: Blob | undefined;
  if (makeSearchable && pageDetails.length > 0) {
    options.onProgress?.('Assembling searchable PDF document...', 0.95);
    searchablePdfBlob = await generateSearchablePdfFromPages(pageDetails);
  }

  options.onProgress?.('OCR processing completed successfully.', 1.0);

  return {
    pages: pageDetails,
    fullText: fullTextParts.join('\n'),
    searchablePdfBlob,
    totalPages: pageDetails.length,
    language,
  };
}

/**
 * Runs OCR on a single PDF page for fast in-editor text recognition & correction.
 */
export async function runOcrOnSinglePdfPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  options: {
    language?: OcrLanguage;
    scale?: number;
    signal?: AbortSignal;
    onProgress?: (message: string, progress: number) => void;
  } = {}
): Promise<OcrPageDetail> {
  const language = options.language ?? 'eng';
  const scale = options.scale ?? 2.0;

  if (options.signal?.aborted) {
    throw new DOMException('OCR processing was canceled.', 'AbortError');
  }

  options.onProgress?.(`Starting OCR worker (${language})...`, 0.1);

  const worker = await createWorker(language, undefined, {
    logger: (m) => {
      if (options.signal?.aborted) return;
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        options.onProgress?.(`Recognizing text (${pct}%)...`, 0.2 + (m.progress || 0) * 0.7);
      }
    },
  });

  const abortHandler = async () => {
    try {
      await worker.terminate();
    } catch {
      // Ignore
    }
  };

  if (options.signal) {
    options.signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    options.onProgress?.('Rendering page canvas...', 0.15);
    const pdfPage = await pdfDoc.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const rotation = (pdfPage.rotate || 0) % 360;

    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, pageNumber, canvas, { scale });

    if (options.signal?.aborted) {
      canvas.width = 0;
      canvas.height = 0;
      throw new DOMException('OCR processing was canceled.', 'AbortError');
    }

    preprocessCanvasForOcr(canvas);

    const scaleX = pageWidth / canvas.width;
    const scaleY = pageHeight / canvas.height;

    options.onProgress?.('Recognizing text with Web Worker...', 0.3);
    const ocrResult = await worker.recognize(canvas);
    const recognizedText = ocrResult.data.text.trim();
    const confidence = Math.round(ocrResult.data.confidence || 0);

    const lines: OcrLineItem[] = [];
    let lineIdx = 0;
    if (ocrResult.data.blocks) {
      for (const block of ocrResult.data.blocks) {
        for (const para of block.paragraphs) {
          for (const l of para.lines) {
            if (l.text.trim()) {
              lines.push({
                id: `p${pageNumber}-line-${lineIdx++}`,
                text: l.text.trim(),
                confidence: Math.round(l.confidence || confidence),
                bbox: l.bbox,
                pdfCoords: {
                  x: l.bbox.x0 * scaleX,
                  y: l.bbox.y0 * scaleY,
                  width: (l.bbox.x1 - l.bbox.x0) * scaleX,
                  height: (l.bbox.y1 - l.bbox.y0) * scaleY,
                },
              });
            }
          }
        }
      }
    }

    const imgBlob = await new Promise<Blob>((res) => {
      canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.92);
    });

    canvas.width = 0;
    canvas.height = 0;

    options.onProgress?.('Recognition complete.', 1.0);

    return {
      pageNumber,
      text: recognizedText,
      confidence,
      lines,
      imageBlob: imgBlob,
      pageWidth,
      pageHeight,
      rotation,
    };
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
    await worker.terminate();
  }
}
