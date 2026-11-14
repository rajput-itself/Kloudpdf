import { PDFDocument, degrees } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface PageReorderItem {
  originalIndex: number; // 0-indexed in source document
  rotation: number; // 0, 90, 180, 270 degrees to add
}

export interface OrganizePdfOptions {
  pages: PageReorderItem[];
  onProgress?: (current: number, total: number) => void;
}

export async function organizePdfFile(
  file: File,
  options: OrganizePdfOptions
): Promise<Blob> {
  if (options.pages.length === 0) {
    throw new Error('Cannot create an empty PDF. Keep at least one page.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const newPdf = await PDFDocument.create();

  const originalIndices = options.pages.map((p) => p.originalIndex);
  const copiedPages = await newPdf.copyPages(sourcePdf, originalIndices);

  for (let i = 0; i < copiedPages.length; i++) {
    options.onProgress?.(i + 1, copiedPages.length);
    const copiedPage = copiedPages[i]!;
    const itemConfig = options.pages[i];

    if (itemConfig && itemConfig.rotation !== 0) {
      const currentRotation = copiedPage.getRotation().angle;
      const newRotation = (currentRotation + itemConfig.rotation) % 360;
      copiedPage.setRotation(degrees(newRotation));
    }

    newPdf.addPage(copiedPage);
  }

  const resultBytes = await newPdf.save();
  return toBlob(resultBytes, 'application/pdf');
}
