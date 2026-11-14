import { PDFDocument, degrees } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface RotatePdfOptions {
  angle: number; // 90, 180, 270
  targetPages?: number[]; // 0-indexed. If omitted or empty, all pages are rotated
  onProgress?: (current: number, total: number) => void;
}

export async function rotatePdfFile(
  file: File,
  options: RotatePdfOptions
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  const targetSet = options.targetPages && options.targetPages.length > 0
    ? new Set(options.targetPages)
    : null;

  for (let i = 0; i < total; i++) {
    options.onProgress?.(i + 1, total);
    if (!targetSet || targetSet.has(i)) {
      const page = pages[i]!;
      const currentAngle = page.getRotation().angle;
      const newAngle = (currentAngle + options.angle) % 360;
      page.setRotation(degrees(newAngle));
    }
  }

  const resultBytes = await pdfDoc.save();
  return toBlob(resultBytes, 'application/pdf');
}
