import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type HtmlPageSize = 'a4' | 'a3' | 'letter' | 'legal';
export type HtmlOrientation = 'portrait' | 'landscape';

export interface HtmlToPdfOptions {
  pageSize?: HtmlPageSize;
  orientation?: HtmlOrientation;
  margin?: number; // 0, 20, 40 (in points)
  onProgress?: (current: number, total: number) => void;
}

const PAGE_DIMENSIONS: Record<HtmlPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612.0, 792.0],
  legal: [612.0, 1008.0],
};

/**
 * Sanitizes user-provided HTML string using DOMPurify.
 * Strictly strips dangerous scripts, objects, and event handlers.
 */
export function sanitizeHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Converts sanitized HTML string to a multi-page PDF client-side.
 */
export async function convertHtmlToPdf(
  rawHtml: string,
  options: HtmlToPdfOptions = {}
): Promise<Blob> {
  const pageSize = options.pageSize ?? 'a4';
  const orientation = options.orientation ?? 'portrait';
  const margin = options.margin ?? 20;

  // 1. Sanitize HTML
  const cleanHtml = sanitizeHtml(rawHtml);
  if (!cleanHtml.trim()) {
    throw new Error('HTML content is empty or contains only disallowed scripts.');
  }

  // 2. Determine target PDF page dimensions
  const [baseW, baseH] = PAGE_DIMENSIONS[pageSize];
  const pageWidth = orientation === 'portrait' ? baseW : baseH;
  const pageHeight = orientation === 'portrait' ? baseH : baseW;

  // 3. Create off-screen rendering container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // Standard 96 DPI A4 width for crisp DOM rendering
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';
  container.style.padding = '32px';
  container.style.boxSizing = 'border-box';
  container.innerHTML = cleanHtml;

  document.body.appendChild(container);

  let canvas: HTMLCanvasElement;
  try {
    options.onProgress?.(1, 4);
    canvas = await html2canvas(container, {
      scale: 2, // High resolution for crisp print output
      useCORS: false,
      logging: false,
      backgroundColor: '#ffffff',
    });
  } finally {
    document.body.removeChild(container);
  }

  options.onProgress?.(2, 4);

  // 4. Calculate page slicing for multi-page document
  const pdfDoc = await PDFDocument.create();
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const pageAspectRatio = availableHeight / availableWidth;

  const sliceHeightPx = Math.floor(canvas.width * pageAspectRatio);
  const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

  for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex++) {
    options.onProgress?.(sliceIndex + 1, totalSlices);

    const sourceY = sliceIndex * sliceHeightPx;
    const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - sourceY);

    // Create sub-canvas for this page slice
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;

    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        currentSliceHeight,
        0,
        0,
        canvas.width,
        currentSliceHeight
      );
    }

    const sliceBlob = await new Promise<Blob>((resolve, reject) => {
      sliceCanvas.toBlob(
        (blob) => {
          sliceCanvas.width = 0;
          sliceCanvas.height = 0;
          if (blob) resolve(blob);
          else reject(new Error(`Failed to render page slice ${sliceIndex + 1}`));
        },
        'image/jpeg',
        0.95
      );
    });

    const sliceBuffer = await sliceBlob.arrayBuffer();
    const embeddedImage = await pdfDoc.embedJpg(sliceBuffer);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImage, {
      x: margin,
      y: margin,
      width: availableWidth,
      height: availableHeight,
    });
  }

  // Free main canvas memory
  canvas.width = 0;
  canvas.height = 0;

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
