import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface MergePdfOptions {
  onProgress?: (processedFiles: number, totalFiles: number) => void;
}

export async function mergePdfFiles(
  files: File[],
  options?: MergePdfOptions
): Promise<Blob> {
  if (files.length < 2) {
    throw new Error('Please select at least two PDF files to merge.');
  }

  const mergedPdf = await PDFDocument.create();
  const totalFiles = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    options?.onProgress?.(i + 1, totalFiles);

    const arrayBuffer = await file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(
      sourcePdf,
      sourcePdf.getPageIndices()
    );

    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  const mergedPdfBytes = await mergedPdf.save();
  return toBlob(mergedPdfBytes, 'application/pdf');
}
