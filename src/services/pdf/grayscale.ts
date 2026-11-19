import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';

export interface GrayscalePdfOptions {
  mode?: 'standard' | 'high-contrast';
  scale?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Converts all pages of a PDF document into monochrome/grayscale client-side.
 * Preserves original page dimensions and layout.
 */
export async function convertPdfToGrayscale(
  file: File,
  options: GrayscalePdfOptions = {}
): Promise<Blob> {
  const mode = options.mode ?? 'standard';
  const renderScale = options.scale ?? 1.8;

  const buffer = await file.arrayBuffer();
  const srcDoc = await loadPdfDocument(buffer);
  const totalPages = srcDoc.numPages;

  const pdfDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    options.onProgress?.(pageNum, totalPages);

    const pdfPage = await srcDoc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const canvas = document.createElement('canvas');
    await renderPageToCanvas(srcDoc, pageNum, canvas, { scale: renderScale });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Failed to initialize 2D context for page ${pageNum}`);
    }

    // Convert pixel data to grayscale using Rec. 709 luminance weights
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (mode === 'high-contrast') {
        // Enhance text contrast (darken text, whiten background)
        if (gray < 160) {
          gray = Math.max(0, gray * 0.85);
        } else {
          gray = Math.min(255, gray * 1.08);
        }
      }

      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imgData, 0, 0);

    const grayBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          // Immediately release GPU memory
          canvas.width = 0;
          canvas.height = 0;
          if (b) resolve(b);
          else reject(new Error(`Failed to encode grayscale page ${pageNum}`));
        },
        'image/jpeg',
        0.92
      );
    });

    const grayBuffer = await grayBlob.arrayBuffer();
    const embeddedImage = await pdfDoc.embedJpg(grayBuffer);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
