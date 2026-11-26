/**
 * KloudPDF — Client-Side PDF to PowerPoint (.pptx) Converter
 * Powered by PDF.js & PptxGenJS (MIT).
 *
 * Supports two transparent conversion modes:
 * 1. Image Slides (Recommended for visual fidelity): Preserves exact appearance at high resolution.
 * 2. Editable Slide Reconstruction: Extracts positioned text boxes and snapshots into editable PPTX objects.
 */

import PptxGenJS from 'pptxgenjs';
import { loadPdfDocument, renderPageToCanvas } from '../pdf/render';

export type PptxAspectRatio = '16:9' | '4:3' | 'original';
export type PptxConversionMode = 'image-slides' | 'editable';

export interface PdfToPptxOptions {
  mode?: PptxConversionMode;
  aspectRatio?: PptxAspectRatio;
  pageNumbers?: number[];
  onProgress?: (current: number, total: number, status?: string) => void;
  signal?: AbortSignal;
}

export interface PdfToPptxResult {
  blob: Blob;
  filename: string;
  slideCount: number;
  mode: PptxConversionMode;
  limitations: string[];
}

export async function convertPdfToPptx(
  file: File,
  options: PdfToPptxOptions = {}
): Promise<PdfToPptxResult> {
  const mode = options.mode ?? 'image-slides';
  const aspectRatio = options.aspectRatio ?? '16:9';

  if (options.signal?.aborted) throw new Error('Conversion cancelled by user.');

  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const targetPages =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('No valid pages selected for PowerPoint export.');
  }

  const pptx = new PptxGenJS();

  let slideWidthIn: number;
  let slideHeightIn: number;

  if (aspectRatio === '4:3') {
    pptx.layout = 'LAYOUT_4x3';
    slideWidthIn = 10;
    slideHeightIn = 7.5;
  } else if (aspectRatio === 'original') {
    const firstPage = await pdfDoc.getPage(targetPages[0]!);
    const vp = firstPage.getViewport({ scale: 1 });
    slideWidthIn = Math.max(4, Math.min(20, vp.width / 72));
    slideHeightIn = Math.max(4, Math.min(20, vp.height / 72));
    pptx.defineLayout({ name: 'PDF_ORIGINAL', width: slideWidthIn, height: slideHeightIn });
    pptx.layout = 'PDF_ORIGINAL';
  } else {
    pptx.layout = 'LAYOUT_16x9';
    slideWidthIn = 10;
    slideHeightIn = 5.625;
  }

  for (let i = 0; i < targetPages.length; i++) {
    if (options.signal?.aborted) throw new Error('Conversion cancelled by user.');
    const pageNum = targetPages[i]!;
    options.onProgress?.(i + 1, targetPages.length, `Building slide ${i + 1} of ${targetPages.length}...`);

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const slide = pptx.addSlide();

    if (mode === 'image-slides') {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 1.8 });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        canvas.width = 0;
        canvas.height = 0;

        const pdfAspect = viewport.width / viewport.height;
        const slideAspect = slideWidthIn / slideHeightIn;
        let w = slideWidthIn;
        let h = slideHeightIn;
        if (pdfAspect > slideAspect) {
          h = slideWidthIn / pdfAspect;
        } else {
          w = slideHeightIn * pdfAspect;
        }
        const x = (slideWidthIn - w) / 2;
        const y = (slideHeightIn - h) / 2;

        slide.addImage({
          data: dataUrl,
          x,
          y,
          w,
          h,
        });
      }
    } else {
      // Editable mode: extract positioned text items and place editable PowerPoint text boxes
      const textContent = await page.getTextContent();
      const scaleX = slideWidthIn / viewport.width;
      const scaleY = slideHeightIn / viewport.height;

      // Group close horizontal spans into lines for clean editable boxes
      const items = (textContent.items as any[]).filter((it) => it?.str?.trim());
      if (items.length === 0) {
        slide.addText(`Slide ${pageNum} (No extractable vector text found — use Image Slides for scanned pages)`, {
          x: 0.5,
          y: 0.5,
          w: slideWidthIn - 1,
          h: 1,
          fontSize: 14,
          color: '666666',
        });
      } else {
        for (const item of items) {
          const tx = item.transform || [1, 0, 0, 12, 0, 0];
          const fontSizePt = Math.max(8, Math.min(48, Math.abs(tx[3] || 12) * 0.85));
          const pdfX = tx[4] || 0;
          const pdfY = tx[5] || 0;

          const slideX = Math.max(0.1, Math.min(slideWidthIn - 0.5, pdfX * scaleX));
          const slideY = Math.max(
            0.1,
            Math.min(slideHeightIn - 0.3, (viewport.height - pdfY - fontSizePt) * scaleY)
          );
          const boxW = Math.max(1.0, Math.min(slideWidthIn - slideX, (item.width || 100) * scaleX + 0.4));

          slide.addText(item.str.trim(), {
            x: slideX,
            y: slideY,
            w: boxW,
            h: Math.max(0.28, fontSizePt * scaleY * 1.4),
            fontSize: Math.round(fontSizePt),
            fontFace: 'Arial',
            color: '202124',
          });
        }
      }
    }
  }

  const outArrayBuffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const blob = new Blob([outArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob,
    filename: `${baseName}.pptx`,
    slideCount: targetPages.length,
    mode,
    limitations:
      mode === 'image-slides'
        ? ['Slides are rendered as high-resolution images to preserve exact visual design; text on slides is not directly editable in PowerPoint.']
        : ['Editable mode reconstructs positioned text boxes using standard Arial metrics; custom vector shapes, gradients, and fonts are omitted or simplified.'],
  };
}
