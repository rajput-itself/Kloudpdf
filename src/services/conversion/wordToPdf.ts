import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface WordToPdfOptions {
  orientation?: 'portrait' | 'landscape';
  margin?: number;
  onProgress?: (current: number, total: number) => void;
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

  // 1. Create off-screen rendering container
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

    // Determine target page dimensions (A4 standard)
    const baseWidth = PageSizes.A4[0]; // 595.28
    const baseHeight = PageSizes.A4[1]; // 841.89
    const pageWidth = orientation === 'portrait' ? baseWidth : baseHeight;
    const pageHeight = orientation === 'portrait' ? baseHeight : baseWidth;

    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;

    const pdfDoc = await PDFDocument.create();

    // Check if docx-preview rendered distinct page sections
    const sections = container.querySelectorAll<HTMLElement>('section.docx-render, section');
    const hasMultipleSections = sections.length > 1;

    if (hasMultipleSections) {
      const sectionList = Array.from(sections);
      for (let i = 0; i < sectionList.length; i++) {
        const section = sectionList[i]!;
        options.onProgress?.(i + 1, sectionList.length);

        const canvas = await html2canvas(section, {
          scale: 1.8,
          useCORS: false,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imageBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              canvas.width = 0;
              canvas.height = 0;
              if (b) resolve(b);
              else reject(new Error(`Failed to render Word section ${i + 1}`));
            },
            'image/jpeg',
            0.95
          );
        });

        const imageBuffer = await imageBlob.arrayBuffer();
        const image = await pdfDoc.embedJpg(imageBuffer);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin,
          y: margin,
          width: availableWidth,
          height: availableHeight,
        });
      }
    } else {
      // Single continuous element or unified document
      const canvas = await html2canvas(container, {
        scale: 1.8,
        useCORS: false,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pageAspectRatio = availableHeight / availableWidth;
      const sliceHeightPx = Math.floor(canvas.width * pageAspectRatio);
      const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

      for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex++) {
        options.onProgress?.(sliceIndex + 1, totalSlices);

        const sourceY = sliceIndex * sliceHeightPx;
        const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - sourceY);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;

        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            currentSliceHeight,
            0,
            0,
            canvas.width,
            currentSliceHeight
          );
        }

        const sliceBlob = await new Promise<Blob>((resolve, reject) => {
          sliceCanvas.toBlob(
            (b) => {
              sliceCanvas.width = 0;
              sliceCanvas.height = 0;
              if (b) resolve(b);
              else reject(new Error(`Failed to render page slice ${sliceIndex + 1}`));
            },
            'image/jpeg',
            0.95
          );
        });

        const sliceBuffer = await sliceBlob.arrayBuffer();
        const image = await pdfDoc.embedJpg(sliceBuffer);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin,
          y: margin,
          width: availableWidth,
          height: availableHeight,
        });
      }

      canvas.width = 0;
      canvas.height = 0;
    }

    const pdfBytes = await pdfDoc.save();
    return toBlob(pdfBytes, 'application/pdf');
  } finally {
    document.body.removeChild(container);
  }
}
