/**
 * KloudPDF — Coordinate Transformation Engine
 * Precise conversions between Screen Viewport, Zoom Scale, and PDF Point Units.
 */

import { Point2D } from '../../types/editor';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a screen pixel coordinate (relative to the page element) to unscaled PDF points.
 */
export function screenToPdf(pixelVal: number, zoom: number): number {
  if (zoom <= 0) return pixelVal;
  return pixelVal / zoom;
}

/**
 * Converts unscaled PDF points to screen pixel dimensions at the given zoom level.
 */
export function pdfToScreen(ptVal: number, zoom: number): number {
  return ptVal * zoom;
}

/**
 * Converts a complete rectangle from PDF points to screen pixels.
 */
export function pdfRectToScreenRect(rect: PdfRect, zoom: number): ScreenRect {
  return {
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

/**
 * Converts mouse/touch event coordinates inside a page container into PDF points.
 */
export function getPdfPointFromEvent(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  zoom: number
): Point2D {
  const pixelX = Math.max(0, clientX - containerRect.left);
  const pixelY = Math.max(0, clientY - containerRect.top);
  return {
    x: pixelX / zoom,
    y: pixelY / zoom,
  };
}

/**
 * Converts hex color string (#rrggbb or #rgb) to pdf-lib normalized RGB (0 to 1).
 */
export function hexToPdfRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: Math.max(0, Math.min(1, ((num >> 16) & 255) / 255)),
    g: Math.max(0, Math.min(1, ((num >> 8) & 255) / 255)),
    b: Math.max(0, Math.min(1, (num & 255) / 255)),
  };
}

/**
 * Calculates bounding box of a list of points.
 */
export function calculatePointsBoundingBox(points: Point2D[]): PdfRect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i]!;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Transforms top-left-based PDF points to pdf-lib bottom-left coordinate space,
 * properly taking page rotation into account.
 *
 * @param x Top-left X in PDF points
 * @param y Top-left Y in PDF points
 * @param width Element width
 * @param height Element height
 * @param pageWidth Unrotated page width
 * @param pageHeight Unrotated page height
 * @param pageRotation Page rotation in degrees (0, 90, 180, 270)
 */
export function toPdfLibCoordinates(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number = 0
): { x: number; y: number; width: number; height: number; rotateDegrees: number } {
  const normRot = ((pageRotation % 360) + 360) % 360;

  switch (normRot) {
    case 90:
      // Rotated 90° clockwise in viewer
      return {
        x: y,
        y: x,
        width: height,
        height: width,
        rotateDegrees: 270,
      };
    case 180:
      // Rotated 180° in viewer
      return {
        x: pageWidth - (x + width),
        y: y,
        width,
        height,
        rotateDegrees: 180,
      };
    case 270:
      // Rotated 270° clockwise in viewer
      return {
        x: pageWidth - (y + height),
        y: pageHeight - (x + width),
        width: height,
        height: width,
        rotateDegrees: 90,
      };
    case 0:
    default:
      // Standard unrotated page: PDF (0, 0) is at bottom-left
      return {
        x,
        y: pageHeight - (y + height),
        width,
        height,
        rotateDegrees: 0,
      };
  }
}
