import { PDFDocument, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface BookletOptions {
  paperSize?: 'a4' | 'a3';
  margin?: number; // Outer margins in points
  gutter?: number; // Center folding gutter in points
  onProgress?: (current: number, total: number) => void;
}

export interface BookletPageSlot {
  sheetIndex: number;
  side: 'front' | 'back';
  leftPageNum: number | null; // null represents blank padding page
  rightPageNum: number | null;
}

/**
 * Calculates saddle-stitch booklet imposition layout for a given page count.
 */
export function calculateBookletLayout(pageCount: number): BookletPageSlot[] {
  // Total pages must be multiple of 4 for a folded booklet
  const totalSheetsPages = Math.ceil(pageCount / 4) * 4;
  const numSheets = totalSheetsPages / 4;

  const slots: BookletPageSlot[] = [];

  for (let s = 0; s < numSheets; s++) {
    // Sheet s Front
    const frontLeft = totalSheetsPages - 2 * s;
    const frontRight = 2 * s + 1;
    slots.push({
      sheetIndex: s + 1,
      side: 'front',
      leftPageNum: frontLeft <= pageCount ? frontLeft : null,
      rightPageNum: frontRight <= pageCount ? frontRight : null,
    });

    // Sheet s Back
    const backLeft = 2 * s + 2;
    const backRight = totalSheetsPages - 2 * s - 1;
    slots.push({
      sheetIndex: s + 1,
      side: 'back',
      leftPageNum: backLeft <= pageCount ? backLeft : null,
      rightPageNum: backRight <= pageCount ? backRight : null,
    });
  }

  return slots;
}

/**
 * Creates a print-ready 2-up saddle-stitch booklet PDF.
 * Uses native vector embedding so original text and graphics remain pin-sharp.
 */
export async function createBookletPdf(
  file: File,
  options: BookletOptions = {}
): Promise<Blob> {
  const paper = options.paperSize ?? 'a4';
  const margin = options.margin ?? 15;
  const gutter = options.gutter ?? 10;

  const buffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buffer);
  const srcPageCount = srcDoc.getPageCount();

  if (srcPageCount === 0) {
    throw new Error('PDF document has no pages.');
  }

  const pdfDoc = await PDFDocument.create();
  const embeddedPages = await pdfDoc.embedPdf(srcDoc);

  // Landscape paper dimensions
  const dims = paper === 'a3' ? PageSizes.A3 : PageSizes.A4;
  const sheetWidth = dims[1]; // Landscape width
  const sheetHeight = dims[0]; // Landscape height

  const slots = calculateBookletLayout(srcPageCount);
  const totalSlots = slots.length;

  // Available half-sheet dimensions for each page
  const halfWidth = sheetWidth / 2;
  const maxPageWidth = halfWidth - margin - gutter / 2;
  const maxPageHeight = sheetHeight - margin * 2;

  for (let i = 0; i < totalSlots; i++) {
    const slot = slots[i]!;
    options.onProgress?.(i + 1, totalSlots);

    const sheet = pdfDoc.addPage([sheetWidth, sheetHeight]);

    // Draw fold line indicator at center top and bottom
    sheet.drawLine({
      start: { x: halfWidth, y: sheetHeight },
      end: { x: halfWidth, y: sheetHeight - 8 },
      thickness: 0.5,
      color: undefined,
    });
    sheet.drawLine({
      start: { x: halfWidth, y: 0 },
      end: { x: halfWidth, y: 8 },
      thickness: 0.5,
      color: undefined,
    });

    // 1. Draw Left Page (if not blank padding)
    if (slot.leftPageNum !== null && slot.leftPageNum <= embeddedPages.length) {
      const pageEmbed = embeddedPages[slot.leftPageNum - 1]!;
      const scale = Math.min(
        maxPageWidth / pageEmbed.width,
        maxPageHeight / pageEmbed.height
      );
      const drawW = pageEmbed.width * scale;
      const drawH = pageEmbed.height * scale;

      const posX = margin + (maxPageWidth - drawW) / 2;
      const posY = (sheetHeight - drawH) / 2;

      sheet.drawPage(pageEmbed, {
        x: posX,
        y: posY,
        xScale: scale,
        yScale: scale,
      });
    }

    // 2. Draw Right Page (if not blank padding)
    if (slot.rightPageNum !== null && slot.rightPageNum <= embeddedPages.length) {
      const pageEmbed = embeddedPages[slot.rightPageNum - 1]!;
      const scale = Math.min(
        maxPageWidth / pageEmbed.width,
        maxPageHeight / pageEmbed.height
      );
      const drawW = pageEmbed.width * scale;
      const drawH = pageEmbed.height * scale;

      const posX = halfWidth + gutter / 2 + (maxPageWidth - drawW) / 2;
      const posY = (sheetHeight - drawH) / 2;

      sheet.drawPage(pageEmbed, {
        x: posX,
        y: posY,
        xScale: scale,
        yScale: scale,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
