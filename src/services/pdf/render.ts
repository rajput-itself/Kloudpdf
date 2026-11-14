import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Initialize PDF.js worker using Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface RenderPageOptions {
  scale?: number;
  rotation?: number;
}

/**
 * Loads a PDF document from an ArrayBuffer or File
 */
export async function loadPdfDocument(data: ArrayBuffer | Uint8Array) {
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true,
  });
  return await loadingTask.promise;
}

/**
 * Renders a specific page of a PDF onto an HTML Canvas element
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: RenderPageOptions = {}
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const scale = options.scale ?? 0.8;
  const rotation = options.rotation ?? 0;

  // Compute viewport with any extra rotation
  const viewport = page.getViewport({
    scale,
    rotation: (page.rotate + rotation) % 360,
  });

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not retrieve 2D rendering context for preview');
  }

  // Adjust for devicePixelRatio for sharp rendering
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  context.save();
  context.scale(outputScale, outputScale);

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  context.restore();

  return {
    width: viewport.width,
    height: viewport.height,
  };
}

/**
 * Renders a PDF page directly to a data URL for fast thumbnail display
 */
export async function renderPageToDataUrl(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number = 0.5,
  rotation: number = 0
): Promise<string> {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(pdfDoc, pageNumber, canvas, { scale, rotation });
  return canvas.toDataURL('image/jpeg', 0.85);
}
