import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'freehand'
  | 'text'
  | 'arrow'
  | 'rectangle'
  | 'circle';

export interface BaseAnnotation {
  id: string;
  pageNumber: number; // 1-indexed
  type: AnnotationType;
  color: string; // hex e.g. '#fbbc04'
  strokeWidth: number;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'highlight' | 'rectangle';
  x: number; // Normalized (0 to 1) relative to page width
  y: number; // Normalized (0 to 1) relative to page height (top is 0)
  width: number; // Normalized
  height: number; // Normalized
  opacity?: number;
}

export interface LineAnnotation extends BaseAnnotation {
  type: 'underline' | 'strikethrough' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  points: { x: number; y: number }[]; // Normalized points
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface CircleAnnotation extends BaseAnnotation {
  type: 'circle';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export type AnnotationItem =
  | RectAnnotation
  | LineAnnotation
  | FreehandAnnotation
  | TextAnnotation
  | CircleAnnotation;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

/**
 * Saves annotations into the PDF document using native vector drawing operations.
 * Preserves all original vector text and existing document content.
 */
export async function applyAnnotationsToPdf(
  file: File,
  annotations: AnnotationItem[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const totalPages = pdfDoc.getPageCount();

  // Group annotations by page
  const pageMap = new Map<number, AnnotationItem[]>();
  annotations.forEach((ann) => {
    const list = pageMap.get(ann.pageNumber) || [];
    list.push(ann);
    pageMap.set(ann.pageNumber, list);
  });

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const items = pageMap.get(pageNum);
    if (!items || items.length === 0) continue;

    const page = pdfDoc.getPage(pageNum - 1);
    const { width: pWidth, height: pHeight } = page.getSize();

    for (const item of items) {
      const { r, g, b } = hexToRgb(item.color);
      const color = rgb(r, g, b);

      switch (item.type) {
        case 'highlight': {
          const x = item.x * pWidth;
          const y = pHeight - (item.y + item.height) * pHeight; // Invert Y for PDF coords
          const w = item.width * pWidth;
          const h = item.height * pHeight;
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            color,
            opacity: item.opacity ?? 0.35,
          });
          break;
        }

        case 'rectangle': {
          const x = item.x * pWidth;
          const y = pHeight - (item.y + item.height) * pHeight;
          const w = item.width * pWidth;
          const h = item.height * pHeight;
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: color,
            borderWidth: item.strokeWidth || 2,
            opacity: 1,
          });
          break;
        }

        case 'underline':
        case 'strikethrough': {
          const startX = item.x1 * pWidth;
          const startY = pHeight - item.y1 * pHeight;
          const endX = item.x2 * pWidth;
          const endY = pHeight - item.y2 * pHeight;
          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: item.strokeWidth || 2,
            color,
          });
          break;
        }

        case 'arrow': {
          const startX = item.x1 * pWidth;
          const startY = pHeight - item.y1 * pHeight;
          const endX = item.x2 * pWidth;
          const endY = pHeight - item.y2 * pHeight;

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: item.strokeWidth || 2,
            color,
          });

          // Draw arrowhead
          const angle = Math.atan2(endY - startY, endX - startX);
          const headLength = 12;
          const arrowAngle = Math.PI / 6; // 30 degrees

          page.drawLine({
            start: { x: endX, y: endY },
            end: {
              x: endX - headLength * Math.cos(angle - arrowAngle),
              y: endY - headLength * Math.sin(angle - arrowAngle),
            },
            thickness: item.strokeWidth || 2,
            color,
          });

          page.drawLine({
            start: { x: endX, y: endY },
            end: {
              x: endX - headLength * Math.cos(angle + arrowAngle),
              y: endY - headLength * Math.sin(angle + arrowAngle),
            },
            thickness: item.strokeWidth || 2,
            color,
          });
          break;
        }

        case 'circle': {
          const cx = item.cx * pWidth;
          const cy = pHeight - item.cy * pHeight;
          const rx = item.rx * pWidth;
          const ry = item.ry * pHeight;
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: rx,
            yScale: ry,
            borderColor: color,
            borderWidth: item.strokeWidth || 2,
          });
          break;
        }

        case 'text': {
          const x = item.x * pWidth;
          const y = pHeight - item.y * pHeight - item.fontSize;
          page.drawText(item.text, {
            x,
            y,
            size: item.fontSize || 14,
            font,
            color,
          });
          break;
        }

        case 'freehand': {
          if (item.points.length > 1) {
            for (let pIdx = 0; pIdx < item.points.length - 1; pIdx++) {
              const p1 = item.points[pIdx]!;
              const p2 = item.points[pIdx + 1]!;
              page.drawLine({
                start: { x: p1.x * pWidth, y: pHeight - p1.y * pHeight },
                end: { x: p2.x * pWidth, y: pHeight - p2.y * pHeight },
                thickness: item.strokeWidth || 2,
                color,
              });
            }
          }
          break;
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
