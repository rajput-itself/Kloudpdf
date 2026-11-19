import { createWorker } from 'tesseract.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrProcessingResult {
  pages: OcrPageResult[];
  fullText: string;
  searchablePdfBlob?: Blob;
  totalRecognizedPages: number;
}

export interface OcrOptions {
  language?: 'eng' | 'hin' | 'spa' | 'fra' | 'deu';
  generateSearchablePdf?: boolean;
  pageNumbers?: number[];
  onProgress?: (status: string, progress: number) => void;
}

/**
 * Preprocesses a canvas image to enhance OCR text recognition on low-quality scans.
 * Increases contrast and converts to high-clarity grayscale.
 */
function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const len = d.length;

  for (let i = 0; i < len; i += 4) {
    const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    // Dynamic contrast thresholding
    const contrastVal = gray > 140 ? Math.min(255, gray * 1.1) : Math.max(0, gray * 0.85);
    d[i] = contrastVal;
    d[i + 1] = contrastVal;
    d[i + 2] = contrastVal;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Genuinely recognizes text from scanned PDF documents using Tesseract.js Web Workers.
 * Generates both editable plain text and a searchable PDF with invisible text overlay.
 */
export async function runOcrOnPdf(
  file: File,
  options: OcrOptions = {}
): Promise<OcrProcessingResult> {
  const language = options.language ?? 'eng';
  const makeSearchable = options.generateSearchablePdf ?? true;

  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const targetPages =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('No valid pages selected for OCR recognition.');
  }

  options.onProgress?.('Initializing Tesseract OCR engine...', 0);

  // Initialize client-side Tesseract worker
  const worker = await createWorker(language, undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        options.onProgress?.(`Recognizing text (${Math.round((m.progress || 0) * 100)}%)...`, m.progress || 0);
      } else if (m.status) {
        options.onProgress?.(`${m.status}...`, m.progress || 0);
      }
    },
  });

  const pageResults: OcrPageResult[] = [];
  const fullTextParts: string[] = [];

  let outPdfDoc: PDFDocument | null = null;
  let font: any = null;

  if (makeSearchable) {
    outPdfDoc = await PDFDocument.create();
    font = await outPdfDoc.embedFont(StandardFonts.Helvetica);
  }

  try {
    for (let i = 0; i < targetPages.length; i++) {
      const pageNum = targetPages[i]!;
      options.onProgress?.(`Processing page ${pageNum} of ${totalPages}...`, i / targetPages.length);

      const pdfPage = await pdfDoc.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      // Render high resolution canvas for OCR recognition
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 2.0 });

      // Enhance scanned image
      preprocessCanvasForOcr(canvas);

      // Perform OCR
      const ocrResult = await worker.recognize(canvas);
      const recognizedText = ocrResult.data.text.trim();
      const confidence = Math.round(ocrResult.data.confidence || 0);

      pageResults.push({
        pageNumber: pageNum,
        text: recognizedText,
        confidence,
      });

      fullTextParts.push(`--- Page ${pageNum} (OCR Confidence: ${confidence}%) ---\n${recognizedText}\n`);

      // If searchable PDF requested, overlay text on page image
      if (outPdfDoc && font) {
        const imgBlob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas blob failed'))), 'image/jpeg', 0.92);
        });
        const imgBuffer = await imgBlob.arrayBuffer();
        const embeddedImg = await outPdfDoc.embedJpg(imgBuffer);

        const newPage = outPdfDoc.addPage([pageWidth, pageHeight]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });

        // Overlay recognized lines as invisible selectable text
        const lines: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = [];
        if (ocrResult.data.blocks) {
          for (const block of ocrResult.data.blocks) {
            for (const paragraph of block.paragraphs) {
              for (const line of paragraph.lines) {
                lines.push(line);
              }
            }
          }
        }

        const scaleX = pageWidth / canvas.width;
        const scaleY = pageHeight / canvas.height;

        for (const line of lines) {
          if (!line.text.trim()) continue;
          const bbox = line.bbox;
          const x = bbox.x0 * scaleX;
          const y = pageHeight - bbox.y1 * scaleY;
          const fontSize = Math.max(8, Math.min(24, (bbox.y1 - bbox.y0) * scaleY * 0.8));

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
            // Skip characters outside standard font encoding
          }
        }
      }

      // Free canvas memory
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }

  let searchablePdfBlob: Blob | undefined;
  if (outPdfDoc) {
    const pdfBytes = await outPdfDoc.save();
    searchablePdfBlob = toBlob(pdfBytes, 'application/pdf');
  }

  return {
    pages: pageResults,
    fullText: fullTextParts.join('\n'),
    searchablePdfBlob,
    totalRecognizedPages: pageResults.length,
  };
}
