import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right';

export interface PageNumberOptions {
  position?: PageNumberPosition;
  format?: '{n} of {total}' | 'Page {n}' | '{n}' | 'Page {n} of {total}';
  startNumber?: number;
  fontSize?: number;
  margin?: number;
  onProgress?: (current: number, total: number) => void;
}

export async function addPageNumbersToPdf(
  file: File,
  options: PageNumberOptions = {}
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const position = options.position ?? 'bottom-center';
  const format = options.format ?? 'Page {n} of {total}';
  const startNumber = options.startNumber ?? 1;
  const fontSize = options.fontSize ?? 10;
  const margin = options.margin ?? 30;

  const pages = pdfDoc.getPages();
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    options.onProgress?.(i + 1, total);
    const page = pages[i]!;
    const { width, height } = page.getSize();

    const currentPageNum = startNumber + i;
    const label = format
      .replace('{n}', currentPageNum.toString())
      .replace('{total}', total.toString());

    const textWidth = font.widthOfTextAtSize(label, fontSize);

    let x = (width - textWidth) / 2;
    let y = margin;

    if (position === 'bottom-left') {
      x = margin;
      y = margin;
    } else if (position === 'bottom-right') {
      x = width - textWidth - margin;
      y = margin;
    } else if (position === 'bottom-center') {
      x = (width - textWidth) / 2;
      y = margin;
    } else if (position === 'top-center') {
      x = (width - textWidth) / 2;
      y = height - margin - fontSize;
    } else if (position === 'top-right') {
      x = width - textWidth - margin;
      y = height - margin - fontSize;
    }

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
