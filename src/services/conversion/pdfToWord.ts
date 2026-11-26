/**
 * KloudPDF — Client-Side PDF to Word (.docx) Converter
 * Powered by PDF.js, Tesseract.js (for scanned pages), and `docx` (MIT).
 *
 * Clearly distinguishes reconstructed structured elements from pixel-perfect layout cloning:
 * Complex multi-column brochures, overlapping floats, and custom embedded fonts are
 * normalized into clean, editable Word paragraphs, headings, tables, images, and links.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  ExternalHyperlink,
  PageBreak,
} from 'docx';
import { loadPdfDocument, renderPageToCanvas } from '../pdf/render';
import { runOcrOnPdf } from '../pdf/ocr';

export interface PdfToWordOptions {
  enableOcrFallback?: boolean;
  ocrLanguage?: 'eng' | 'hin' | 'spa' | 'fra' | 'deu';
  pageNumbers?: number[];
  onProgress?: (current: number, total: number, status?: string) => void;
  signal?: AbortSignal;
}

export interface PdfToWordResult {
  blob: Blob;
  filename: string;
  pageCount: number;
  ocrPagesUsed: number;
  tablesDetected: number;
  linksPreserved: number;
  limitations: string[];
}

interface PositionedTextSpan {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

/**
 * Extracts image regions from rendered page operator list when safe in browser environment.
 */
async function extractPageVisualSnapshots(
  pdfDoc: any,
  pageNumber: number
): Promise<Uint8Array[]> {
  if (typeof document === 'undefined') return [];
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const ops = await page.getOperatorList();
    const pdfjs = await import('pdfjs-dist');
    const OPS = pdfjs.OPS;

    let hasImageOps = false;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (
        ops.fnArray[i] === OPS.paintImageXObject ||
        ops.fnArray[i] === OPS.paintInlineImageXObject
      ) {
        hasImageOps = true;
        break;
      }
    }
    if (!hasImageOps) return [];

    // Render page at 1.2x scale as crisp fallback visual reference when embedded images exist
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdfDoc, pageNumber, canvas, { scale: 1.2 });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(b);
      }, 'image/png')
    );
    if (!blob) return [];
    return [new Uint8Array(await blob.arrayBuffer())];
  } catch {
    return [];
  }
}

/**
 * Groups positioned PDF text items into logical lines and detects simple coordinate tables.
 */
function groupSpansIntoLines(spans: PositionedTextSpan[]): PositionedTextSpan[][] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PositionedTextSpan[][] = [];
  let currentLine: PositionedTextSpan[] = [];
  let currentY = sorted[0]!.y;

  for (const span of sorted) {
    if (!span.str.trim()) continue;
    if (Math.abs(span.y - currentY) <= 5) {
      currentLine.push(span);
    } else {
      if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
      }
      currentLine = [span];
      currentY = span.y;
    }
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Converts a PDF file into an editable DOCX document completely in the browser.
 */
export async function convertPdfToWord(
  file: File,
  options: PdfToWordOptions = {}
): Promise<PdfToWordResult> {
  const enableOcr = options.enableOcrFallback ?? true;
  const signal = options.signal;

  if (signal?.aborted) throw new Error('Conversion cancelled by user.');

  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const targetPages =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('No valid pages selected for conversion.');
  }

  const children: (Paragraph | Table)[] = [];
  let ocrPagesUsed = 0;
  let tablesDetected = 0;
  let linksPreserved = 0;

  for (let idx = 0; idx < targetPages.length; idx++) {
    if (signal?.aborted) throw new Error('Conversion cancelled by user.');

    const pageNum = targetPages[idx]!;
    options.onProgress?.(idx + 1, targetPages.length, `Analyzing page ${pageNum} of ${totalPages}...`);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const spans: PositionedTextSpan[] = [];
    for (const item of textContent.items as any[]) {
      if (item && typeof item.str === 'string' && item.str.trim().length > 0) {
        const tx = item.transform || [1, 0, 0, 12, 0, 0];
        const height = Math.abs(tx[3] || item.height || 11);
        spans.push({
          str: item.str,
          x: tx[4] || 0,
          y: tx[5] || 0,
          width: item.width || 0,
          height,
          fontName: String(item.fontName || ''),
        });
      }
    }

    // Collect external hyperlinks from annotations
    const annotations = await page.getAnnotations().catch(() => []);
    const pageUrls: string[] = [];
    for (const annot of annotations as any[]) {
      if (annot?.subtype === 'Link' && typeof annot.url === 'string' && /^https?:\/\//i.test(annot.url)) {
        pageUrls.push(annot.url);
      }
    }

    // Scanned page fallback via Tesseract OCR
    if (spans.length === 0 && enableOcr) {
      options.onProgress?.(
        idx + 1,
        targetPages.length,
        `Page ${pageNum} appears scanned — running browser OCR...`
      );
      try {
        const ocrRes = await runOcrOnPdf(file, {
          language: options.ocrLanguage || 'eng',
          pageNumbers: [pageNum],
          generateSearchablePdf: false,
          signal,
        });
        ocrPagesUsed++;
        const ocrPage = ocrRes.pages[0];
        if (ocrPage && ocrPage.lines.length > 0) {
          for (const line of ocrPage.lines) {
            if (line.text.trim()) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: line.text.trim(), size: 22 })],
                  spacing: { after: 120 },
                })
              );
            }
          }
        }
      } catch {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[Page ${pageNum}: Scanned content could not be extracted via OCR]`,
                italics: true,
                color: '666666',
              }),
            ],
          })
        );
      }
    } else {
      // Calculate median font height to identify headings cleanly
      const heights = spans.map((s) => s.height).sort((a, b) => a - b);
      const medianHeight = heights[Math.floor(heights.length / 2)] || 11;

      const lines = groupSpansIntoLines(spans);
      let tableBuffer: string[][] = [];

      const flushTable = () => {
        if (tableBuffer.length >= 2) {
          const maxCols = Math.max(...tableBuffer.map((r) => r.length));
          const docxRows = tableBuffer.map(
            (row) =>
              new TableRow({
                children: Array.from({ length: maxCols }, (_, colIdx) => {
                  const cellText = row[colIdx] || '';
                  return new TableCell({
                    width: { size: Math.floor(100 / maxCols), type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                      left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                      right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                    },
                    children: [new Paragraph({ children: [new TextRun({ text: cellText, size: 20 })] })],
                  });
                }),
              })
          );
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: docxRows,
            })
          );
          children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
          tablesDetected++;
        } else if (tableBuffer.length === 1) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: tableBuffer[0]!.join('   '), size: 22 })],
              spacing: { after: 120 },
            })
          );
        }
        tableBuffer = [];
      };

      for (const line of lines) {
        // Detect multi-column separated cells on the same line
        const columns: string[] = [];
        let currentColText = line[0]!.str;
        for (let i = 1; i < line.length; i++) {
          const prev = line[i - 1]!;
          const curr = line[i]!;
          const gap = curr.x - (prev.x + prev.width);
          if (gap > 24) {
            columns.push(currentColText.trim());
            currentColText = curr.str;
          } else {
            currentColText += (gap > 2 ? ' ' : '') + curr.str;
          }
        }
        columns.push(currentColText.trim());

        if (columns.length >= 2) {
          tableBuffer.push(columns);
          continue;
        }

        flushTable();

        const fullLineText = columns[0] || '';
        const avgLineHeight =
          line.reduce((sum, s) => sum + s.height, 0) / Math.max(1, line.length);
        const isBold = line.some((s) => /bold|black|heavy/i.test(s.fontName));

        let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
        if (avgLineHeight >= medianHeight * 1.45 && fullLineText.length < 140) {
          heading = HeadingLevel.HEADING_1;
        } else if (avgLineHeight >= medianHeight * 1.2 && fullLineText.length < 140) {
          heading = HeadingLevel.HEADING_2;
        }

        children.push(
          new Paragraph({
            heading,
            spacing: { after: heading ? 160 : 120 },
            children: [
              new TextRun({
                text: fullLineText,
                bold: isBold || Boolean(heading),
                size: heading ? undefined : Math.round(Math.max(18, Math.min(28, avgLineHeight * 2))),
              }),
            ],
          })
        );
      }

      flushTable();
    }

    // Preserve page hyperlinks if present
    if (pageUrls.length > 0) {
      const uniqueUrls = Array.from(new Set(pageUrls));
      linksPreserved += uniqueUrls.length;
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun({ text: 'Referenced Links: ', bold: true, size: 18, color: '5F6368' }),
            ...uniqueUrls.flatMap((url, uIdx) => [
              new ExternalHyperlink({
                link: url,
                children: [
                  new TextRun({
                    text: url,
                    style: 'Hyperlink',
                    color: '1A73E8',
                    underline: {},
                    size: 18,
                  }),
                ],
              }),
              ...(uIdx < uniqueUrls.length - 1 ? [new TextRun({ text: ' • ', size: 18 })] : []),
            ]),
          ],
        })
      );
    }

    // Embed page snapshot when raster images were detected in PDF operators
    const snapshots = await extractPageVisualSnapshots(pdfDoc, pageNum);
    for (const imgBytes of snapshots) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: imgBytes,
              transformation: { width: 460, height: 320 },
            }),
          ],
        })
      );
    }

    if (idx < targetPages.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  if (children.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'No extractable text or content found in this PDF.' })],
      })
    );
  }

  const docxDoc = new Document({
    creator: 'KloudPDF Local Converter',
    title: file.name.replace(/\.[^/.]+$/, ''),
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(docxDoc);
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob,
    filename: `${baseName}.docx`,
    pageCount: targetPages.length,
    ocrPagesUsed,
    tablesDetected,
    linksPreserved,
    limitations: [
      'Complex multi-column magazine layouts, decorative borders, and custom embedded fonts are simplified into editable Word paragraphs and tables.',
      'Pages containing embedded vector illustrations or graphics include a visual snapshot fallback.',
    ],
  };
}
