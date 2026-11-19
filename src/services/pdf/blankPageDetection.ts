import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';

export interface PageBlankAnalysis {
  pageNumber: number;
  isBlank: boolean;
  inkPercentage: number;
  characterCount: number;
}

export interface BlankDetectionOptions {
  thresholdPercentage?: number; // Default 0.1% (0.001)
  onProgress?: (current: number, total: number) => void;
}

/**
 * Analyzes all pages of a PDF to detect blank or nearly blank pages.
 * Examines both pixel density (scanned marks) and digital text characters.
 */
export async function analyzePdfBlankPages(
  file: File,
  options: BlankDetectionOptions = {}
): Promise<PageBlankAnalysis[]> {
  const threshold = options.thresholdPercentage ?? 0.1; // 0.1% ink threshold
  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const results: PageBlankAnalysis[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    options.onProgress?.(pageNum, totalPages);

    const pdfPage = await pdfDoc.getPage(pageNum);
    const textContent = await pdfPage.getTextContent();
    let charCount = 0;
    for (const item of textContent.items) {
      if ('str' in item) {
        charCount += item.str.trim().length;
      }
    }

    // Render low-resolution canvas for fast pixel analysis
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 0.5 });

    const ctx = canvas.getContext('2d');
    let nonWhitePixels = 0;
    let totalSampled = 0;

    if (ctx) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const len = data.length;

      // Sample every 4th pixel for high speed
      for (let i = 0; i < len; i += 16) {
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        totalSampled++;

        // Pixel is non-white if significantly darker than 240
        if (r < 240 || g < 240 || b < 240) {
          nonWhitePixels++;
        }
      }
    }

    // Free canvas memory
    canvas.width = 0;
    canvas.height = 0;

    const inkPercentage = totalSampled > 0 ? (nonWhitePixels / totalSampled) * 100 : 0;
    const isBlank = charCount === 0 && inkPercentage <= threshold;

    results.push({
      pageNumber: pageNum,
      isBlank,
      inkPercentage: parseFloat(inkPercentage.toFixed(3)),
      characterCount: charCount,
    });
  }

  return results;
}

/**
 * Removes specified blank pages from the PDF document and returns the cleaned PDF.
 */
export async function removeBlankPagesFromPdf(
  file: File,
  pagesToRemove: number[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const totalPages = pdfDoc.getPageCount();

  if (pagesToRemove.length >= totalPages) {
    throw new Error('Cannot remove all pages from the document. At least one page must remain.');
  }

  // Sort descending so page indices don't shift during removal
  const sortedDesc = [...new Set(pagesToRemove)].sort((a, b) => b - a);

  for (let i = 0; i < sortedDesc.length; i++) {
    const pageNum = sortedDesc[i]!;
    onProgress?.(i + 1, sortedDesc.length);
    if (pageNum >= 1 && pageNum <= pdfDoc.getPageCount()) {
      pdfDoc.removePage(pageNum - 1);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
