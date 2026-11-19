import { loadPdfDocument } from './render';

export interface PageTextResult {
  pageNumber: number;
  text: string;
}

export interface PdfExtractedTextResult {
  pages: PageTextResult[];
  fullText: string;
  totalCharacters: number;
  totalPages: number;
}

/**
 * Extracts digital text from a PDF file page by page using PDF.js.
 * Preserves reading order and paragraph line breaks.
 */
export async function extractTextFromPdf(
  file: File,
  options?: {
    pageNumbers?: number[];
    onProgress?: (current: number, total: number) => void;
  }
): Promise<PdfExtractedTextResult> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const targetPages =
    options?.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('No valid pages selected for text extraction.');
  }

  const pages: PageTextResult[] = [];
  const fullTextParts: string[] = [];

  for (let i = 0; i < targetPages.length; i++) {
    const pageNum = targetPages[i]!;
    options?.onProgress?.(i + 1, targetPages.length);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let pageText = '';
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if ('str' in item) {
        const currentY = item.transform ? item.transform[5] : null;

        // If Y coordinate drops significantly, insert a line break
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
          pageText += ' ';
        }

        pageText += item.str;
        if (currentY !== null) {
          lastY = currentY;
        }
      }
    }

    const cleanPageText = pageText.trim();
    pages.push({
      pageNumber: pageNum,
      text: cleanPageText,
    });

    fullTextParts.push(`--- Page ${pageNum} ---\n${cleanPageText}\n`);
  }

  const fullText = fullTextParts.join('\n');
  const totalCharacters = fullText.length;

  return {
    pages,
    fullText,
    totalCharacters,
    totalPages,
  };
}
