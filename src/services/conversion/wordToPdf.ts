import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';
import {
  appendCanvasAsSinglePage,
  appendCanvasSlicesToPdf,
} from './domToPdfPipeline';

export interface WordToPdfOptions {
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Renders a DOCX file into a target DOM container for previewing.
 */
export async function renderDocxPreview(file: File, container: HTMLElement): Promise<void> {
  const buffer = await file.arrayBuffer();
  container.innerHTML = '';
  await renderAsync(buffer, container, undefined, {
    className: 'docx-content',
    inWrapper: false,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
    renderHeaders: true,
    renderFooters: true,
  });
}

/**
 * Converts a DOCX file into a multi-page PDF document completely client-side.
 */
export async function convertWordToPdf(
  file: File,
  options: WordToPdfOptions = {}
): Promise<Blob> {
  const orientation = options.orientation ?? 'portrait';
  const margin = options.margin ?? 20;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = orientation === 'portrait' ? '794px' : '1123px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.padding = '0';
  container.style.boxSizing = 'border-box';

  document.body.appendChild(container);

  try {
    options.onProgress?.(1, 4);
    const buffer = await file.arrayBuffer();

    await renderAsync(buffer, container, undefined, {
      className: 'docx-render',
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    });

    options.onProgress?.(2, 4);

    const baseWidth = PageSizes.A4[0];
    const baseHeight = PageSizes.A4[1];
    const pageWidth = orientation === 'portrait' ? baseWidth : baseHeight;
    const pageHeight = orientation === 'portrait' ? baseHeight : baseWidth;

    const pdfDoc = await PDFDocument.create();
    const sections = container.querySelectorAll<HTMLElement>('section.docx-render, section');

    if (sections.length > 1) {
      const sectionList = Array.from(sections);
      for (let i = 0; i < sectionList.length; i++) {
        if (options.signal?.aborted) throw new Error('Conversion cancelled by user.');
        options.onProgress?.(i + 1, sectionList.length);
        const canvas = await html2canvas(sectionList[i]!, {
          scale: 1.8,
          useCORS: false,
          logging: false,
          backgroundColor: '#ffffff',
        });
        await appendCanvasAsSinglePage(pdfDoc, canvas, pageWidth, pageHeight, margin, 0.95);
      }
    } else {
      const canvas = await html2canvas(container, {
        scale: 1.8,
        useCORS: false,
        logging: false,
        backgroundColor: '#ffffff',
      });
      await appendCanvasSlicesToPdf(pdfDoc, canvas, {
        pageWidth,
        pageHeight,
        margin,
        jpegQuality: 0.95,
        onProgress: options.onProgress,
        signal: options.signal,
      });
    }

    const pdfBytes = await pdfDoc.save();
    return toBlob(pdfBytes, 'application/pdf');
  } finally {
    document.body.removeChild(container);
  }
}
