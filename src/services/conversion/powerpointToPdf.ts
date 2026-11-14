import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface PptxSlideData {
  slideNumber: number;
  title: string;
  paragraphs: string[];
  imageUrls: string[];
}

export interface PptxInspectionResult {
  slideCount: number;
  slides: PptxSlideData[];
  is16x9: boolean;
}

/**
 * Inspects a PPTX presentation file in client-side memory using JSZip and DOMParser.
 * Extracts slide order, slide texts, and slide images.
 */
export async function inspectPptx(file: File): Promise<PptxInspectionResult> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Check presentation.xml for slide dimension info
  let is16x9 = true;
  const presXmlFile = zip.file('ppt/presentation.xml');
  if (presXmlFile) {
    const presText = await presXmlFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(presText, 'application/xml');
    const sldSz = doc.querySelector('sldSz');
    if (sldSz) {
      const cx = parseInt(sldSz.getAttribute('cx') || '0', 10);
      const cy = parseInt(sldSz.getAttribute('cy') || '0', 10);
      if (cx > 0 && cy > 0) {
        const ratio = cx / cy;
        is16x9 = ratio >= 1.5;
      }
    }
  }

  // Find all slide files: ppt/slides/slide{n}.xml
  const slideEntries: { num: number; file: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, zipEntry) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
    if (match && match[1]) {
      slideEntries.push({
        num: parseInt(match[1], 10),
        file: zipEntry,
      });
    }
  });

  // Sort slides in natural presentation order
  slideEntries.sort((a, b) => a.num - b.num);

  const slides: PptxSlideData[] = [];
  const parser = new DOMParser();

  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i]!;
    const slideNumber = i + 1;
    const slideXml = await entry.file.async('text');
    const slideDoc = parser.parseFromString(slideXml, 'application/xml');

    // Extract text paragraphs
    const paragraphs: string[] = [];
    let title = '';

    const pNodes = slideDoc.querySelectorAll('p\\:sp, sp');
    pNodes.forEach((sp, spIdx) => {
      const textNodes = sp.querySelectorAll('a\\:t, t');
      const textParts: string[] = [];
      textNodes.forEach((t) => {
        const txt = t.textContent?.trim();
        if (txt) textParts.push(txt);
      });

      const fullText = textParts.join(' ').trim();
      if (fullText) {
        if (!title && spIdx === 0) {
          title = fullText;
        } else {
          paragraphs.push(fullText);
        }
      }
    });

    if (!title && paragraphs.length > 0) {
      title = paragraphs.shift()!;
    }
    if (!title) {
      title = `Slide ${slideNumber}`;
    }

    // Extract slide images if relationships exist
    const relsFile = zip.file(`ppt/slides/_rels/slide${entry.num}.xml.rels`);
    const imageUrls: string[] = [];

    if (relsFile) {
      const relsXml = await relsFile.async('text');
      const relsDoc = parser.parseFromString(relsXml, 'application/xml');
      const relationships = relsDoc.querySelectorAll('Relationship');

      for (let r = 0; r < relationships.length; r++) {
        const rel = relationships[r]!;
        const target = rel.getAttribute('Target') || '';
        const type = rel.getAttribute('Type') || '';

        if (type.includes('image') || target.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
          // Resolve relative target (e.g. "../media/image1.png" -> "ppt/media/image1.png")
          const cleanTarget = target.replace(/^\.\.\//, 'ppt/');
          const imageZipFile = zip.file(cleanTarget);
          if (imageZipFile) {
            const imgBlob = await imageZipFile.async('blob');
            imageUrls.push(URL.createObjectURL(imgBlob));
          }
        }
      }
    }

    slides.push({
      slideNumber,
      title,
      paragraphs,
      imageUrls,
    });
  }

  return {
    slideCount: slides.length,
    slides,
    is16x9,
  };
}

/**
 * Converts a PPTX presentation into a multi-page PDF document in 16:9 Landscape.
 */
export async function convertPowerPointToPdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const { slides } = await inspectPptx(file);

  if (slides.length === 0) {
    throw new Error('No slides could be extracted from this PowerPoint presentation.');
  }

  // 16:9 Landscape page dimensions in points (960 x 540 pt)
  const pageWidth = 960;
  const pageHeight = 540;

  const pdfDoc = await PDFDocument.create();

  // Create temporary slide render container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1280px';
  container.style.height = '720px';
  container.style.backgroundColor = '#ffffff';
  container.style.boxSizing = 'border-box';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.overflow = 'hidden';

  document.body.appendChild(container);

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      onProgress?.(i + 1, slides.length);

      // Render crisp, presentation-grade slide layout
      container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 48px 56px; box-sizing: border-box; background: #ffffff; border: 1px solid #e8eaed;">
          <!-- Slide Header -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1a73e8; padding-bottom: 16px; margin-bottom: 28px;">
              <h1 style="font-size: 32px; font-weight: 700; color: #202124; margin: 0; line-height: 1.2;">
                ${slide.title}
              </h1>
              <span style="font-size: 14px; font-weight: 600; color: #5f6368;">
                Slide ${slide.slideNumber} of ${slides.length}
              </span>
            </div>

            <!-- Slide Content Grid -->
            <div style="display: flex; gap: 36px; align-items: flex-start;">
              <!-- Text content -->
              <div style="flex: 1;">
                ${
                  slide.paragraphs.length > 0
                    ? slide.paragraphs
                        .map(
                          (p) => `
                        <div style="display: flex; gap: 12px; margin-bottom: 16px; font-size: 18px; line-height: 1.6; color: #3c4043;">
                          <span style="color: #1a73e8; font-weight: bold;">•</span>
                          <div>${p}</div>
                        </div>
                      `
                        )
                        .join('')
                    : `<p style="font-size: 16px; color: #80868b; font-style: italic;">No body text on this slide.</p>`
                }
              </div>

              <!-- Embedded Images (if any) -->
              ${
                slide.imageUrls.length > 0
                  ? `
                <div style="width: 380px; display: flex; flex-direction: column; gap: 16px; align-items: center;">
                  ${slide.imageUrls
                    .slice(0, 2)
                    .map(
                      (url) => `
                    <img src="${url}" style="max-width: 100%; max-height: 380px; object-fit: contain; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
                  `
                    )
                    .join('')}
                </div>
              `
                  : ''
              }
            </div>
          </div>

          <!-- Slide Footer -->
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #80868b; border-top: 1px solid #f1f3f4; padding-top: 12px;">
            <span>KloudPDF Presentation Engine</span>
            <span>Page ${slide.slideNumber}</span>
          </div>
        </div>
      `;

      // Allow any DOM images to decode
      const imgElements = container.querySelectorAll('img');
      await Promise.all(
        Array.from(imgElements).map((img) =>
          img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; })
        )
      );

      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            canvas.width = 0;
            canvas.height = 0;
            if (b) resolve(b);
            else reject(new Error(`Failed to render slide ${slide.slideNumber}`));
          },
          'image/jpeg',
          0.92
        );
      });

      const imageBuffer = await imageBlob.arrayBuffer();
      const image = await pdfDoc.embedJpg(imageBuffer);

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // Revoke temporary slide image object URLs
      slide.imageUrls.forEach((url) => URL.revokeObjectURL(url));
    }

    const pdfBytes = await pdfDoc.save();
    return toBlob(pdfBytes, 'application/pdf');
  } finally {
    document.body.removeChild(container);
  }
}
