import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  rotation?: number; // in degrees
  color?: 'gray' | 'red' | 'blue' | 'black';
  position?: 'center' | 'top' | 'bottom';
  onProgress?: (current: number, total: number) => void;
}

const COLOR_MAP = {
  gray: rgb(0.5, 0.5, 0.5),
  red: rgb(0.85, 0.2, 0.2),
  blue: rgb(0.1, 0.45, 0.9),
  black: rgb(0.1, 0.1, 0.1),
};

export async function addWatermarkToPdf(
  file: File,
  options: WatermarkOptions
): Promise<Blob> {
  const text = options.text.trim();
  if (!text) {
    throw new Error('Watermark text cannot be empty.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const fontSize = options.fontSize ?? 48;
  const opacity = options.opacity ?? 0.25;
  const rotationAngle = options.rotation ?? 45;
  const textColor = COLOR_MAP[options.color ?? 'gray'] || COLOR_MAP.gray;
  const position = options.position ?? 'center';

  const pages = pdfDoc.getPages();
  const total = pages.length;

  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  for (let i = 0; i < total; i++) {
    options.onProgress?.(i + 1, total);
    const page = pages[i]!;
    const { width, height } = page.getSize();

    let x = (width - textWidth) / 2;
    let y = (height - textHeight) / 2;

    if (position === 'top') {
      y = height - textHeight - 60;
    } else if (position === 'bottom') {
      y = 60;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: textColor,
      opacity,
      rotate: degrees(rotationAngle),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
