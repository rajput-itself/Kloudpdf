import { PDFDocument } from 'pdf-lib';
import { loadPdfDocument, renderPageToCanvas } from './render';
import { toBlob } from '../../utils/file';

export interface DeskewAnalysisResult {
  detectedAngle: number; // In degrees, e.g. -2.5 or 1.0
  confidence: number;
}

/**
 * Detects the skew angle of a page using horizontal projection profile variance analysis.
 * Tests angles between -10° and +10° in 0.5° increments.
 */
export function detectCanvasSkewAngle(canvas: HTMLCanvasElement): DeskewAnalysisResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { detectedAngle: 0, confidence: 0 };

  const width = canvas.width;
  const height = canvas.height;

  // Downsample to small thumbnail for fast analysis
  const sampleW = 200;
  const sampleH = Math.round((height / width) * sampleW);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = sampleW;
  thumbCanvas.height = sampleH;
  const tCtx = thumbCanvas.getContext('2d');
  if (!tCtx) return { detectedAngle: 0, confidence: 0 };

  tCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const imgData = tCtx.getImageData(0, 0, sampleW, sampleH);
  const data = imgData.data;

  // Convert to binary ink (1 = ink/dark, 0 = background/light)
  const binary = new Uint8Array(sampleW * sampleH);
  for (let i = 0; i < sampleW * sampleH; i++) {
    const idx = i * 4;
    const gray = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
    binary[i] = gray < 180 ? 1 : 0;
  }

  let bestAngle = 0;
  let maxVariance = -1;

  // Test candidate angles from -8° to +8° in 0.5° increments
  for (let angle = -8.0; angle <= 8.0; angle += 0.5) {
    const rad = (angle * Math.PI) / 180;
    const tan = Math.tan(rad);

    // Compute projection onto vertical axis at angle
    const rowCounts = new Float64Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let count = 0;
      for (let x = 0; x < sampleW; x++) {
        const shiftedY = Math.round(y + (x - sampleW / 2) * tan);
        if (shiftedY >= 0 && shiftedY < sampleH) {
          count += binary[shiftedY * sampleW + x]!;
        }
      }
      rowCounts[y] = count;
    }

    // Calculate variance of row counts
    let sum = 0;
    for (let y = 0; y < sampleH; y++) sum += rowCounts[y]!;
    const mean = sum / sampleH;

    let variance = 0;
    for (let y = 0; y < sampleH; y++) {
      const diff = rowCounts[y]! - mean;
      variance += diff * diff;
    }

    if (variance > maxVariance) {
      maxVariance = variance;
      bestAngle = angle;
    }
  }

  // Cleanup
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;

  return {
    detectedAngle: -bestAngle, // Invert to correct clockwise/counterclockwise
    confidence: maxVariance > 0 ? 0.85 : 0,
  };
}

/**
 * Rotates a canvas by a specified angle in degrees around its center with white fill.
 */
export function rotateCanvas(canvas: HTMLCanvasElement, angleDegrees: number): HTMLCanvasElement {
  const rad = (angleDegrees * Math.PI) / 180;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;

  const ctx = outCanvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

  ctx.translate(outCanvas.width / 2, outCanvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return outCanvas;
}

export interface DeskewPdfOptions {
  manualAngle?: number; // In degrees (-15 to 15)
  pageNumbers?: number[];
  onProgress?: (current: number, total: number) => void;
}

/**
 * Automatically or manually corrects page tilt/skew and exports a straightened PDF.
 */
export async function deskewPdfDocument(
  file: File,
  options: DeskewPdfOptions = {}
): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const outDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    options.onProgress?.(pageNum, totalPages);

    const pdfPage = await pdfDoc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, pageNum, canvas, { scale: 1.8 });

    // Determine angle (manual override or auto-detected)
    let angleToApply = options.manualAngle ?? 0;
    if (options.manualAngle === undefined) {
      const detected = detectCanvasSkewAngle(canvas);
      angleToApply = detected.detectedAngle;
    }

    let finalCanvas = canvas;
    if (Math.abs(angleToApply) > 0.1) {
      finalCanvas = rotateCanvas(canvas, angleToApply);
    }

    const imgBlob = await new Promise<Blob>((res, rej) => {
      finalCanvas.toBlob((b) => (b ? res(b) : rej(new Error('Failed to encode image'))), 'image/jpeg', 0.94);
    });

    const imgBuffer = await imgBlob.arrayBuffer();
    const embeddedImg = await outDoc.embedJpg(imgBuffer);

    const page = outDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
    if (finalCanvas !== canvas) {
      finalCanvas.width = 0;
      finalCanvas.height = 0;
    }
  }

  const pdfBytes = await outDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
