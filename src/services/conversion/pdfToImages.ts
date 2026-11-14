import JSZip from 'jszip';
import { loadPdfDocument, renderPageToCanvas } from '../pdf/render';

export interface PdfToImageOptions {
  format: 'png' | 'webp';
  scale?: number; // 1 (1x), 1.5 (1.5x), 2 (2x)
  quality?: number; // 0.7 to 1.0 (for webp)
  pageNumbers?: number[]; // Specific 1-based page numbers to convert (if undefined, converts all)
  onProgress?: (current: number, total: number) => void;
}

export interface ConvertedImageItem {
  pageNumber: number;
  blob: Blob;
  filename: string;
  url: string;
}

export interface PdfToImageResult {
  items: ConvertedImageItem[];
  zipBlob?: Blob;
  zipFilename?: string;
  isSinglePage: boolean;
  totalConverted: number;
}

export async function convertPdfToImages(
  file: File,
  options: PdfToImageOptions
): Promise<PdfToImageResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(arrayBuffer);
  const totalDocPages = pdfDoc.numPages;

  const targetPages = options.pageNumbers && options.pageNumbers.length > 0
    ? options.pageNumbers.filter((p) => p >= 1 && p <= totalDocPages)
    : Array.from({ length: totalDocPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('No valid pages selected for conversion.');
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const extension = options.format === 'png' ? 'png' : 'webp';
  const mimeType = options.format === 'png' ? 'image/png' : 'image/webp';
  const renderScale = options.scale ?? (options.format === 'png' ? 2 : 1.5);
  const imageQuality = options.quality ?? 0.85;

  const items: ConvertedImageItem[] = [];
  const zip = new JSZip();

  for (let i = 0; i < targetPages.length; i++) {
    const pageNum = targetPages[i]!;
    options.onProgress?.(i + 1, targetPages.length);

    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: renderScale });

    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          // Immediately free GPU memory
          canvas.width = 0;
          canvas.height = 0;
          if (blob) resolve(blob);
          else reject(new Error(`Failed to convert page ${pageNum} to ${extension.toUpperCase()}`));
        },
        mimeType,
        imageQuality
      );
    });

    const itemFilename = `${baseName}_page_${pageNum}.${extension}`;
    const itemUrl = URL.createObjectURL(imageBlob);

    items.push({
      pageNumber: pageNum,
      blob: imageBlob,
      filename: itemFilename,
      url: itemUrl,
    });

    const buffer = await imageBlob.arrayBuffer();
    zip.file(itemFilename, buffer);
  }

  if (items.length === 1) {
    const single = items[0]!;
    return {
      items,
      isSinglePage: true,
      totalConverted: 1,
      zipBlob: single.blob,
      zipFilename: single.filename,
    };
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return {
    items,
    zipBlob,
    zipFilename: `${baseName}_${extension}_images.zip`,
    isSinglePage: false,
    totalConverted: items.length,
  };
}
