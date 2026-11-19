import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker with .js extension for universal MIME type support across all hosts & devices
const configureWorkerSrc = () => {
  if (typeof window !== 'undefined') {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      return new URL(`${normalizedBase}pdf.worker.min.js`, window.location.href).href;
    } catch {
      return '/pdf.worker.min.js';
    }
  }
  return 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
};

pdfjsLib.GlobalWorkerOptions.workerSrc = configureWorkerSrc();

export interface RenderPageOptions {
  scale?: number;
  rotation?: number;
}

/**
 * Loads a PDF document from an ArrayBuffer or Uint8Array with automatic worker retry
 * and defensive buffer cloning to prevent Web Worker transfer from detaching user buffers.
 */
export async function loadPdfDocument(data: ArrayBuffer | Uint8Array) {
  try {
    // PDF.js worker transfers the underlying ArrayBuffer across the thread boundary,
    // which detaches it on the main thread in modern browser engines.
    // Cloning the incoming data guarantees the caller's buffer or typed array is never detached.
    let transferSafeData: Uint8Array;
    try {
      if (data instanceof Uint8Array) {
        transferSafeData = new Uint8Array(data.slice());
      } else {
        transferSafeData = new Uint8Array(data.slice(0));
      }
    } catch {
      transferSafeData = data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: transferSafeData,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });
    return await loadingTask.promise;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // If worker fails due to browser worker restrictions or MIME issues, retry with CDN fallback
    if (errorMsg.toLowerCase().includes('worker')) {
      console.warn('PDF.js worker fallback activated:', errorMsg);
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

      let retryData: Uint8Array;
      try {
        if (data instanceof Uint8Array) {
          retryData = new Uint8Array(data.slice());
        } else {
          retryData = new Uint8Array(data.slice(0));
        }
      } catch {
        retryData = data instanceof Uint8Array ? data : new Uint8Array(data);
      }

      const retryTask = pdfjsLib.getDocument({
        data: retryData,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
      });
      return await retryTask.promise;
    }
    throw err;
  }
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

  // Adjust for devicePixelRatio for sharp rendering, capped at 2 for performance
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
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
