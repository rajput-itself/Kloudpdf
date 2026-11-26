/**
 * KloudPDF — Visual PDF Editor Export Engine
 * Applies user edits (text, images, shapes, drawings, highlights, signatures)
 * to original PDF documents using pdf-lib, preserving 100% vector content and quality.
 */

import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFFont,
  PDFPage,
} from 'pdf-lib';
import {
  EditorObject,
  TextEditorObject,
  ImageEditorObject,
  ShapeEditorObject,
  DrawingEditorObject,
  HighlightEditorObject,
  NoteEditorObject,
  SignatureEditorObject,
  RedactionEditorObject,
  StandardFontFamily,
  ContentEditState,
} from '../../types/editor';
import { hexToPdfRgb, toPdfLibCoordinates } from './editorCoordinates';
import { applyContentStreamEdits } from './contentEditorEngine';
import { applyPermanentRedaction, RedactionArea } from './redaction';
import { toBlob } from '../../utils/file';

/**
 * Font cache to prevent re-embedding the same standard fonts multiple times per document.
 */
class FontCache {
  private cache = new Map<string, PDFFont>();

  constructor(private pdfDoc: PDFDocument) {}

  async getFont(family: StandardFontFamily, isBold: boolean, isItalic: boolean): Promise<PDFFont> {
    const key = `${family}-${isBold ? 'B' : ''}-${isItalic ? 'I' : ''}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    let fontRef: StandardFonts;

    if (family === 'TimesRoman') {
      if (isBold && isItalic) fontRef = StandardFonts.TimesRomanBoldItalic;
      else if (isBold) fontRef = StandardFonts.TimesRomanBold;
      else if (isItalic) fontRef = StandardFonts.TimesRomanItalic;
      else fontRef = StandardFonts.TimesRoman;
    } else if (family === 'Courier') {
      if (isBold && isItalic) fontRef = StandardFonts.CourierBoldOblique;
      else if (isBold) fontRef = StandardFonts.CourierBold;
      else if (isItalic) fontRef = StandardFonts.CourierOblique;
      else fontRef = StandardFonts.Courier;
    } else {
      // Default Helvetica
      if (isBold && isItalic) fontRef = StandardFonts.HelveticaBoldOblique;
      else if (isBold) fontRef = StandardFonts.HelveticaBold;
      else if (isItalic) fontRef = StandardFonts.HelveticaOblique;
      else fontRef = StandardFonts.Helvetica;
    }

    const font = await this.pdfDoc.embedFont(fontRef);
    this.cache.set(key, font);
    return font;
  }
}

/**
 * Converts a base64 data URL to a Uint8Array byte buffer.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const base64Str = parts.length > 1 ? parts[1]! : parts[0]!;
  const binaryStr = atob(base64Str);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Draws text object on a PDF page with accurate multiline handling and font selection.
 */
async function drawTextOnPage(
  page: PDFPage,
  obj: TextEditorObject,
  fontCache: FontCache,
  pWidth: number,
  pHeight: number,
  rotation: number
): Promise<void> {
  const font = await fontCache.getFont(obj.fontFamily, obj.isBold, obj.isItalic);
  const { r, g, b } = hexToPdfRgb(obj.color);
  const color = rgb(r, g, b);
  const fontSize = obj.fontSize || 14;
  const lineHeightMultiplier = obj.lineHeight || 1.25;
  const lineSpacing = fontSize * lineHeightMultiplier;

  const lines = (obj.text || '').split('\n');
  const totalTextHeight = lines.length * lineSpacing;

  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width || 100,
    totalTextHeight,
    pWidth,
    pHeight,
    rotation
  );

  // In PDF coordinate space, each line is rendered from top of the box downward
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line && lines.length > 1) continue;

    let lineX = coords.x;
    if (obj.textAlign === 'center') {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      lineX += Math.max(0, (coords.width - textWidth) / 2);
    } else if (obj.textAlign === 'right') {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      lineX += Math.max(0, coords.width - textWidth);
    }

    // Baseline calculation: coords.y is bottom of the total bounding box.
    // The top line starts at coords.y + totalTextHeight - lineSpacing.
    const lineY = coords.y + (totalTextHeight - (i + 1) * lineSpacing) + (lineSpacing - fontSize);

    page.drawText(line, {
      x: lineX,
      y: lineY,
      size: fontSize,
      font,
      color,
      opacity: obj.opacity ?? 1,
    });
  }
}

/**
 * Draws image object on a PDF page with format embedding (PNG or JPEG).
 */
async function drawImageOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  obj: ImageEditorObject,
  pWidth: number,
  pHeight: number,
  rotation: number
): Promise<void> {
  const bytes = dataUrlToBytes(obj.dataUrl);
  let embeddedImage;

  try {
    if (obj.mimeType === 'image/png' || obj.dataUrl.startsWith('data:image/png')) {
      embeddedImage = await pdfDoc.embedPng(new Uint8Array(bytes.slice()));
    } else {
      embeddedImage = await pdfDoc.embedJpg(new Uint8Array(bytes.slice()));
    }
  } catch {
    // Graceful fallback: try alternate embed if header differed
    try {
      embeddedImage = await pdfDoc.embedPng(new Uint8Array(bytes.slice()));
    } catch {
      embeddedImage = await pdfDoc.embedJpg(new Uint8Array(bytes.slice()));
    }
  }

  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width,
    obj.height,
    pWidth,
    pHeight,
    rotation
  );

  page.drawImage(embeddedImage, {
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    opacity: obj.opacity ?? 1,
  });
}

/**
 * Draws shapes (rectangle, circle, line, arrow) on a PDF page.
 */
function drawShapeOnPage(
  page: PDFPage,
  obj: ShapeEditorObject,
  pWidth: number,
  pHeight: number,
  rotation: number
): void {
  const { r: sr, g: sg, b: sb } = hexToPdfRgb(obj.strokeColor);
  const strokeColor = rgb(sr, sg, sb);
  const strokeWidth = obj.strokeWidth || 2;
  const opacity = obj.opacity ?? 1;

  const hasFill = obj.fillColor && obj.fillColor !== 'transparent';
  let fillColor = undefined;
  if (hasFill) {
    const { r: fr, g: fg, b: fb } = hexToPdfRgb(obj.fillColor);
    fillColor = rgb(fr, fg, fb);
  }

  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width,
    obj.height,
    pWidth,
    pHeight,
    rotation
  );

  switch (obj.type) {
    case 'rectangle': {
      page.drawRectangle({
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
        borderColor: strokeColor,
        borderWidth: strokeWidth,
        color: fillColor,
        opacity,
      });
      break;
    }

    case 'circle': {
      const cx = coords.x + coords.width / 2;
      const cy = coords.y + coords.height / 2;
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: coords.width / 2,
        yScale: coords.height / 2,
        borderColor: strokeColor,
        borderWidth: strokeWidth,
        color: fillColor,
        opacity,
      });
      break;
    }

    case 'line': {
      const startX = coords.x;
      const startY = coords.y + coords.height;
      const endX = coords.x + coords.width;
      const endY = coords.y;

      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness: strokeWidth,
        color: strokeColor,
        opacity,
      });
      break;
    }

    case 'arrow': {
      const startX = coords.x;
      const startY = coords.y + coords.height;
      const endX = coords.x + coords.width;
      const endY = coords.y;

      // Shaft
      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness: strokeWidth,
        color: strokeColor,
        opacity,
      });

      // Arrow head calculations
      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = Math.max(10, strokeWidth * 4);
      const arrowAngle = Math.PI / 6; // 30 degrees

      const x1 = endX - headLength * Math.cos(angle - arrowAngle);
      const y1 = endY - headLength * Math.sin(angle - arrowAngle);
      const x2 = endX - headLength * Math.cos(angle + arrowAngle);
      const y2 = endY - headLength * Math.sin(angle + arrowAngle);

      page.drawLine({
        start: { x: endX, y: endY },
        end: { x: x1, y: y1 },
        thickness: strokeWidth,
        color: strokeColor,
        opacity,
      });

      page.drawLine({
        start: { x: endX, y: endY },
        end: { x: x2, y: y2 },
        thickness: strokeWidth,
        color: strokeColor,
        opacity,
      });
      break;
    }
  }
}

/**
 * Draws freehand drawings by connecting sequential sample points.
 */
function drawFreehandOnPage(
  page: PDFPage,
  obj: DrawingEditorObject,
  pWidth: number,
  pHeight: number,
  rotation: number
): void {
  if (!obj.points || obj.points.length < 2) return;

  const { r, g, b } = hexToPdfRgb(obj.strokeColor);
  const color = rgb(r, g, b);
  const strokeWidth = obj.strokeWidth || 2;
  const opacity = obj.opacity ?? 1;

  for (let i = 0; i < obj.points.length - 1; i++) {
    const pt1 = obj.points[i]!;
    const pt2 = obj.points[i + 1]!;

    const c1 = toPdfLibCoordinates(pt1.x, pt1.y, 1, 1, pWidth, pHeight, rotation);
    const c2 = toPdfLibCoordinates(pt2.x, pt2.y, 1, 1, pWidth, pHeight, rotation);

    page.drawLine({
      start: { x: c1.x, y: c1.y },
      end: { x: c2.x, y: c2.y },
      thickness: strokeWidth,
      color,
      opacity,
    });
  }
}

/**
 * Draws highlight box with semi-translucent color wash.
 */
function drawHighlightOnPage(
  page: PDFPage,
  obj: HighlightEditorObject,
  pWidth: number,
  pHeight: number,
  rotation: number
): void {
  const { r, g, b } = hexToPdfRgb(obj.color || '#ffeb3b');
  const color = rgb(r, g, b);
  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width,
    obj.height,
    pWidth,
    pHeight,
    rotation
  );

  page.drawRectangle({
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    color,
    opacity: obj.opacity ?? 0.35,
  });
}

/**
 * Draws styled text note / callout card on the page.
 */
async function drawNoteOnPage(
  page: PDFPage,
  obj: NoteEditorObject,
  fontCache: FontCache,
  pWidth: number,
  pHeight: number,
  rotation: number
): Promise<void> {
  const { r: br, g: bg, b: bb } = hexToPdfRgb(obj.bgColor || '#fef3c7');
  const bgColor = rgb(br, bg, bb);

  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width || 160,
    obj.height || 100,
    pWidth,
    pHeight,
    rotation
  );

  // Background note card
  page.drawRectangle({
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    color: bgColor,
    borderColor: rgb(0.85, 0.75, 0.3),
    borderWidth: 1,
    opacity: 0.95,
  });

  // Note header
  const headerHeight = 16;
  page.drawRectangle({
    x: coords.x,
    y: coords.y + coords.height - headerHeight,
    width: coords.width,
    height: headerHeight,
    color: rgb(0.95, 0.85, 0.4),
  });

  // Note text content
  const font = await fontCache.getFont('Helvetica', false, false);
  const lines = (obj.text || 'Note').split('\n').slice(0, 5);
  const fontSize = 10;
  const lineSpacing = 13;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineY = coords.y + coords.height - headerHeight - 12 - i * lineSpacing;
    if (lineY < coords.y + 4) break;

    page.drawText(line, {
      x: coords.x + 8,
      y: lineY,
      size: fontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }
}

/**
 * Draws signature onto PDF page by embedding transparent PNG.
 */
async function drawSignatureOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  obj: SignatureEditorObject,
  pWidth: number,
  pHeight: number,
  rotation: number
): Promise<void> {
  const bytes = dataUrlToBytes(obj.dataUrl);
  let embeddedImage;
  try {
    embeddedImage = await pdfDoc.embedPng(new Uint8Array(bytes.slice()));
  } catch {
    embeddedImage = await pdfDoc.embedJpg(new Uint8Array(bytes.slice()));
  }

  const coords = toPdfLibCoordinates(
    obj.x,
    obj.y,
    obj.width,
    obj.height,
    pWidth,
    pHeight,
    rotation
  );

  page.drawImage(embeddedImage, {
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    opacity: obj.opacity ?? 1,
  });
}

/**
 * Core Export Engine: Applies all editor objects onto the original PDF document.
 * Returns a downloadable PDF Blob.
 */
export async function exportEditedPdf(
  originalPdfData: ArrayBuffer | Uint8Array,
  objects: EditorObject[],
  onProgress?: (current: number, total: number, message: string) => void,
  contentEdits?: ContentEditState
): Promise<Blob> {
  onProgress?.(1, 10, 'Loading original PDF document...');

  // Ensure originalPdfData is safe and not detached
  let safeBytes: Uint8Array;
  try {
    if (originalPdfData instanceof Uint8Array) {
      safeBytes = new Uint8Array(originalPdfData.slice());
    } else {
      safeBytes = new Uint8Array(originalPdfData.slice(0));
    }
  } catch {
    throw new Error('PDF document buffer is invalid or detached. Please reload your document.');
  }

  // Phase 2: If there are genuine content stream edits (text edits/deletions, image replacements),
  // rewrite content streams and XObjects first, preserving 100% vector document integrity.
  if (
    contentEdits &&
    (Object.keys(contentEdits.modifiedTexts).length > 0 ||
      Object.keys(contentEdits.modifiedImages).length > 0)
  ) {
    onProgress?.(2, 10, 'Rewriting PDF content streams...');
    safeBytes = await applyContentStreamEdits(safeBytes, contentEdits, (msg) =>
      onProgress?.(2, 10, msg)
    );
  }

  const pdfDoc = await PDFDocument.load(safeBytes, { ignoreEncryption: true });
  const fontCache = new FontCache(pdfDoc);

  const totalPages = pdfDoc.getPageCount();
  const pendingRedactions: RedactionArea[] = [];

  // Group non-redaction objects by 1-based page number; defer redactions to permanent rasterization
  const pageObjectsMap = new Map<number, EditorObject[]>();
  for (const obj of objects) {
    if (obj.type === 'redaction') {
      const rObj = obj as RedactionEditorObject;
      pendingRedactions.push({
        id: rObj.id,
        pageNumber: rObj.pageNumber,
        x: rObj.x,
        y: rObj.y,
        width: rObj.width,
        height: rObj.height,
      });
      continue;
    }
    const list = pageObjectsMap.get(obj.pageNumber) || [];
    list.push(obj);
    pageObjectsMap.set(obj.pageNumber, list);
  }

  onProgress?.(3, 10, 'Applying edits across pages...');

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageItems = pageObjectsMap.get(pageNum);
    if (!pageItems || pageItems.length === 0) continue;

    const page = pdfDoc.getPage(pageNum - 1);
    const { width: pWidth, height: pHeight } = page.getSize();
    const rotation = page.getRotation().angle;

    for (const item of pageItems) {
      switch (item.type) {
        case 'text':
          await drawTextOnPage(page, item as TextEditorObject, fontCache, pWidth, pHeight, rotation);
          break;
        case 'image':
          await drawImageOnPage(pdfDoc, page, item as ImageEditorObject, pWidth, pHeight, rotation);
          break;
        case 'rectangle':
        case 'circle':
        case 'line':
        case 'arrow':
          drawShapeOnPage(page, item as ShapeEditorObject, pWidth, pHeight, rotation);
          break;
        case 'drawing':
          drawFreehandOnPage(page, item as DrawingEditorObject, pWidth, pHeight, rotation);
          break;
        case 'highlight':
          drawHighlightOnPage(page, item as HighlightEditorObject, pWidth, pHeight, rotation);
          break;
        case 'note':
          await drawNoteOnPage(page, item as NoteEditorObject, fontCache, pWidth, pHeight, rotation);
          break;
        case 'signature':
          await drawSignatureOnPage(pdfDoc, page, item as SignatureEditorObject, pWidth, pHeight, rotation);
          break;
      }
    }
  }

  onProgress?.(8, 10, 'Compiling and optimizing PDF output...');
  const pdfBytes = await pdfDoc.save();

  if (pendingRedactions.length > 0) {
    onProgress?.(9, 10, 'Permanently burning redactions...');
    const redacted = await applyPermanentRedaction(new Uint8Array(pdfBytes), pendingRedactions, {
      mode: 'raster-guaranteed',
    });
    if (!redacted.securityVerified) {
      throw new Error('Redaction verification detected unremoved underlying text.');
    }
    onProgress?.(10, 10, 'Document ready for download.');
    return redacted.blob;
  }

  onProgress?.(10, 10, 'Document ready for download.');
  return toBlob(pdfBytes, 'application/pdf');
}
