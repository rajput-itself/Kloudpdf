import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';
import { sanitizeHtmlStrict } from '../../utils/fileSecurity';
import { appendCanvasSlicesToPdf, captureOffscreenDom } from './domToPdfPipeline';

export type HtmlPageSize = 'a4' | 'a3' | 'letter' | 'legal';
export type HtmlOrientation = 'portrait' | 'landscape';

export interface HtmlToPdfOptions {
  pageSize?: HtmlPageSize;
  orientation?: HtmlOrientation;
  margin?: number; // 0, 20, 40 (in points)
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

const PAGE_DIMENSIONS: Record<HtmlPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612.0, 792.0],
  legal: [612.0, 1008.0],
};

/**
 * Sanitizes user-provided HTML string using strict DOMPurify policy.
 * Strips dangerous scripts, objects, event handlers, and blocks external network resources.
 */
export function sanitizeHtml(rawHtml: string): string {
  return sanitizeHtmlStrict(rawHtml);
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

  // 3. Render & slice through unified Template Method pipeline
  options.onProgress?.(1, 4);
  const canvas = await captureOffscreenDom(
    {
      widthPx: orientation === 'portrait' ? 794 : 1123,
      padding: '32px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      lineHeight: '1.6',
      color: '#111827',
      scale: 2,
    },
    (container) => {
      container.innerHTML = cleanHtml;
    }
  );

  options.onProgress?.(2, 4);

  const pdfDoc = await PDFDocument.create();
  await appendCanvasSlicesToPdf(pdfDoc, canvas, {
    pageWidth,
    pageHeight,
    margin,
    jpegQuality: 0.95,
    onProgress: options.onProgress,
    signal: options.signal,
  });

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
