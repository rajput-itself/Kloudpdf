import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface SplitPdfOptions {
  pageIndices?: number[]; // 0-indexed
  pageRangeString?: string; // e.g. "1-3, 5, 8-10"
  onProgress?: (current: number, total: number) => void;
}

export function parsePageRangeString(rangeStr: string, totalPages: number): number[] {
  const resultIndices = new Set<number>();
  const parts = rangeStr.split(',').map((p) => p.trim());

  for (const part of parts) {
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr || '', 10);
      const end = parseInt(endStr || '', 10);
      if (!isNaN(start) && !isNaN(end)) {
        const lower = Math.max(1, Math.min(start, end));
        const upper = Math.min(totalPages, Math.max(start, end));
        for (let p = lower; p <= upper; p++) {
          resultIndices.add(p - 1);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        resultIndices.add(pageNum - 1);
      }
    }
  }

  return Array.from(resultIndices).sort((a, b) => a - b);
}

export async function splitPdfFile(
  file: File,
  options: SplitPdfOptions
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const totalPages = sourcePdf.getPageCount();

  let targetIndices: number[] = [];

  if (options.pageIndices && options.pageIndices.length > 0) {
    targetIndices = options.pageIndices.filter((idx) => idx >= 0 && idx < totalPages);
  } else if (options.pageRangeString) {
    targetIndices = parsePageRangeString(options.pageRangeString, totalPages);
  }

  if (targetIndices.length === 0) {
    throw new Error('Please select at least one valid page to split or extract.');
  }

  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(sourcePdf, targetIndices);

  for (let i = 0; i < copiedPages.length; i++) {
    options.onProgress?.(i + 1, copiedPages.length);
    newPdf.addPage(copiedPages[i]!);
  }

  const newPdfBytes = await newPdf.save();
  return toBlob(newPdfBytes, 'application/pdf');
}
