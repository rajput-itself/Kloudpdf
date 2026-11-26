import JSZip from 'jszip';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';
import { ResourceScope } from '../../utils/disposableScope';
import { yieldToBrowser } from '../../utils/taskPool';

export interface JpgToPdfOptions {
  orientation?: 'portrait' | 'landscape' | 'fit';
  margin?: number; // 0, 20, 40
  onProgress?: (current: number, total: number) => void;
}

export async function convertJpgToPdf(
  files: File[],
  options: JpgToPdfOptions = {}
): Promise<Blob> {
  if (files.length === 0) {
    throw new Error('Please select at least one image file.');
  }

  const pdfDoc = await PDFDocument.create();
  const margin = options.margin ?? 20;
  const orientation = options.orientation ?? 'portrait';

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    options.onProgress?.(i + 1, files.length);

    let buffer = await file.arrayBuffer();
    const lowerName = file.name.toLowerCase();
    const isWebp = file.type === 'image/webp' || lowerName.endsWith('.webp');
    let isPng = file.type === 'image/png' || lowerName.endsWith('.png');

    if (isWebp && typeof document !== 'undefined') {
      const bitmap = await createImageBitmap(file);
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          c.toBlob((b) => {
            c.width = 0;
            c.height = 0;
            resolve(b);
          }, 'image/png')
        );
        if (pngBlob) {
          buffer = await pngBlob.arrayBuffer();
          isPng = true;
        }
      }
      bitmap.close();
    }

    let image;
    try {
      if (isPng) {
        image = await pdfDoc.embedPng(buffer);
      } else {
        image = await pdfDoc.embedJpg(buffer);
      }
    } catch {
      // Fallback: try png if jpg failed, or jpg if png failed
      try {
        image = isPng ? await pdfDoc.embedJpg(buffer) : await pdfDoc.embedPng(buffer);
      } catch {
        throw new Error(`Failed to decode image "${file.name}". Please ensure it is a valid JPG, PNG, or WebP.`);
      }
    }

    const imgDims = image.scale(1);

    let pageWidth: number;
    let pageHeight: number;

    if (orientation === 'fit') {
      pageWidth = imgDims.width + margin * 2;
      pageHeight = imgDims.height + margin * 2;
    } else if (orientation === 'landscape') {
      pageWidth = PageSizes.A4[1]; // 841.89
      pageHeight = PageSizes.A4[0]; // 595.28
    } else {
      // Portrait
      pageWidth = PageSizes.A4[0]; // 595.28
      pageHeight = PageSizes.A4[1]; // 841.89
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Scale image to fit within available area with margins
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;

    const widthScale = availableWidth / imgDims.width;
    const heightScale = availableHeight / imgDims.height;
    const scale = Math.min(widthScale, heightScale, orientation === 'fit' ? 1 : 2);

    const drawWidth = imgDims.width * scale;
    const drawHeight = imgDims.height * scale;

    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    page.drawImage(image, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}

export interface PdfToJpgResult {
  blob: Blob;
  filename: string;
  isZip: boolean;
  pageCount: number;
}

export async function convertPdfToJpg(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfToJpgResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);
  const totalPages = pdfDoc.numPages;

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const zip = new JSZip();
  let singlePageBlob: Blob | null = null;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);

    const scope = new ResourceScope();
    let jpegBlob: Blob;
    try {
      const canvas = scope.trackCanvas(document.createElement('canvas'));
      await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 1.5 });

      jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to convert page ${pageNum} to JPEG`))),
          'image/jpeg',
          0.92
        );
      });
    } finally {
      scope.dispose();
    }

    if (totalPages === 1) {
      singlePageBlob = jpegBlob;
    } else {
      const pageBuffer = await jpegBlob.arrayBuffer();
      zip.file(`${baseName}_page_${pageNum}.jpg`, new Uint8Array(pageBuffer));
    }
    await yieldToBrowser();
  }

  if (totalPages === 1 && singlePageBlob) {
    return {
      blob: singlePageBlob,
      filename: `${baseName}_page_1.jpg`,
      isZip: false,
      pageCount: 1,
    };
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return {
    blob: zipBlob,
    filename: `${baseName}_images.zip`,
    isZip: true,
    pageCount: totalPages,
  };
}
