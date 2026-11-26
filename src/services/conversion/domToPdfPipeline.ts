import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { ResourceScope } from '../../utils/disposableScope';

export interface OffscreenCaptureOptions {
  widthPx: number;
  heightPx?: number;
  padding?: string;
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  color?: string;
  scale?: number;
  overflow?: string;
}

export interface PageSlicePlacement {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  jpegQuality?: number;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Shared Template Method helper for off-screen DOM capture with deterministic DOM cleanup.
 */
export async function captureOffscreenDom(
  options: OffscreenCaptureOptions,
  populate: (container: HTMLElement) => Promise<void> | void
): Promise<HTMLCanvasElement> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${options.widthPx}px`;
  if (options.heightPx) container.style.height = `${options.heightPx}px`;
  container.style.backgroundColor = '#ffffff';
  container.style.boxSizing = 'border-box';
  if (options.padding) container.style.padding = options.padding;
  if (options.fontFamily) container.style.fontFamily = options.fontFamily;
  if (options.fontSize) container.style.fontSize = options.fontSize;
  if (options.lineHeight) container.style.lineHeight = options.lineHeight;
  if (options.color) container.style.color = options.color;
  if (options.overflow) container.style.overflow = options.overflow;

  document.body.appendChild(container);
  try {
    await populate(container);
    return await html2canvas(container, {
      scale: options.scale ?? 1.8,
      useCORS: false,
      logging: false,
      backgroundColor: '#ffffff',
    });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Slices a tall captured canvas into proportional PDF pages and cleans up every temporary canvas.
 */
export async function appendCanvasSlicesToPdf(
  pdfDoc: PDFDocument,
  sourceCanvas: HTMLCanvasElement,
  placement: PageSlicePlacement
): Promise<void> {
  const scope = new ResourceScope();
  scope.trackCanvas(sourceCanvas);

  try {
    const availableWidth = placement.pageWidth - placement.margin * 2;
    const availableHeight = placement.pageHeight - placement.margin * 2;
    const pageAspectRatio = availableHeight / availableWidth;
    const sliceHeightPx = Math.max(1, Math.floor(sourceCanvas.width * pageAspectRatio));
    const totalSlices = Math.max(1, Math.ceil(sourceCanvas.height / sliceHeightPx));
    const quality = placement.jpegQuality ?? 0.95;

    for (let sliceIdx = 0; sliceIdx < totalSlices; sliceIdx++) {
      if (placement.signal?.aborted) {
        throw new Error('Conversion cancelled by user.');
      }
      placement.onProgress?.(sliceIdx + 1, totalSlices);

      const sourceY = sliceIdx * sliceHeightPx;
      const currentSliceHeight = Math.min(sliceHeightPx, sourceCanvas.height - sourceY);

      const sliceCanvas = scope.trackCanvas(document.createElement('canvas'));
      sliceCanvas.width = sourceCanvas.width;
      sliceCanvas.height = sliceHeightPx;

      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          sourceCanvas,
          0,
          sourceY,
          sourceCanvas.width,
          currentSliceHeight,
          0,
          0,
          sourceCanvas.width,
          currentSliceHeight
        );
      }

      const sliceBlob = await new Promise<Blob>((resolve, reject) => {
        sliceCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Failed to render page slice ${sliceIdx + 1}`))),
          'image/jpeg',
          quality
        );
      });

      // Release slice canvas backing memory immediately after encoding
      sliceCanvas.width = 0;
      sliceCanvas.height = 0;

      const sliceBuffer = await sliceBlob.arrayBuffer();
      const image = await pdfDoc.embedJpg(sliceBuffer);
      const page = pdfDoc.addPage([placement.pageWidth, placement.pageHeight]);
      page.drawImage(image, {
        x: placement.margin,
        y: placement.margin,
        width: availableWidth,
        height: availableHeight,
      });
    }
  } finally {
    scope.dispose();
  }
}

/**
 * Encodes a single rendered page/section canvas directly onto one proportional PDF page.
 */
export async function appendCanvasAsSinglePage(
  pdfDoc: PDFDocument,
  sourceCanvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  jpegQuality: number = 0.95
): Promise<void> {
  const scope = new ResourceScope();
  scope.trackCanvas(sourceCanvas);
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode rendered canvas'))),
        'image/jpeg',
        jpegQuality
      );
    });
    const img = await pdfDoc.embedJpg(await blob.arrayBuffer());
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;
    const scale = Math.min(availableWidth / img.width, availableHeight / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(img, {
      x: margin + (availableWidth - drawW) / 2,
      y: margin + (availableHeight - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  } finally {
    scope.dispose();
  }
}
