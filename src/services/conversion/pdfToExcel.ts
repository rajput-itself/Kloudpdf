/**
 * KloudPDF — Client-Side PDF Table Extractor (PDF to Excel XLSX & CSV)
 * Uses PDF.js coordinate clustering + Tesseract.js OCR fallback for scanned tables
 * + SheetJS (`xlsx`) for native spreadsheet output.
 */

import * as XLSX from 'xlsx';
import { loadPdfDocument } from '../pdf/render';
import { runOcrOnPdf } from '../pdf/ocr';
import { toBlob } from '../../utils/file';

export interface ExtractedPdfTable {
  id: string;
  pageNumber: number;
  title: string;
  rows: string[][];
  lowConfidenceRows: number[];
  source: 'vector-text' | 'ocr';
}

export interface PdfToExcelOptions {
  enableOcrFallback?: boolean;
  ocrLanguage?: 'eng' | 'hin' | 'spa' | 'fra' | 'deu';
  pageNumbers?: number[];
  onProgress?: (current: number, total: number, status?: string) => void;
  signal?: AbortSignal;
}

export interface PdfToExcelExtractionResult {
  tables: ExtractedPdfTable[];
  warnings: string[];
  totalPagesScanned: number;
}

interface TableCellSpan {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Clusters horizontal X positions into stable column slots for a group of Y-aligned rows.
 */
function alignRowsIntoColumns(rawRows: TableCellSpan[][]): {
  rows: string[][];
  lowConfidenceRows: number[];
} {
  if (rawRows.length === 0) return { rows: [], lowConfidenceRows: [] };

  // Collect all unique left X starts clustered within 18pt tolerance
  const xClusters: number[] = [];
  const allSpans = rawRows.flat().sort((a, b) => a.x - b.x);
  for (const span of allSpans) {
    const existing = xClusters.find((cx) => Math.abs(cx - span.x) < 22);
    if (existing === undefined) {
      xClusters.push(span.x);
    }
  }
  xClusters.sort((a, b) => a - b);

  const lowConfidenceRows: number[] = [];
  const rows: string[][] = rawRows.map((line, rIdx) => {
    const rowCells = new Array<string>(xClusters.length).fill('');
    for (const span of line) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < xClusters.length; c++) {
        const dist = Math.abs(span.x - xClusters[c]!);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      rowCells[bestCol] = rowCells[bestCol]
        ? `${rowCells[bestCol]} ${span.str.trim()}`
        : span.str.trim();
    }
    const nonEmptyCount = rowCells.filter(Boolean).length;
    if (xClusters.length >= 3 && nonEmptyCount === 1) {
      lowConfidenceRows.push(rIdx);
    }
    return rowCells;
  });

  return { rows, lowConfidenceRows };
}

/**
 * Extracts tabular structures from PDF pages for preview and manual editing prior to XLSX/CSV export.
 */
export async function extractTablesFromPdf(
  file: File,
  options: PdfToExcelOptions = {}
): Promise<PdfToExcelExtractionResult> {
  const enableOcr = options.enableOcrFallback ?? true;
  if (options.signal?.aborted) throw new Error('Extraction cancelled by user.');

  const buffer = await file.arrayBuffer();
  const pdfDoc = await loadPdfDocument(buffer);
  const totalPages = pdfDoc.numPages;

  const targetPages =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

  const tables: ExtractedPdfTable[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < targetPages.length; i++) {
    if (options.signal?.aborted) throw new Error('Extraction cancelled by user.');
    const pageNum = targetPages[i]!;
    options.onProgress?.(i + 1, targetPages.length, `Detecting tables on page ${pageNum}...`);

    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    const spans: TableCellSpan[] = [];
    for (const item of content.items as any[]) {
      if (item && typeof item.str === 'string' && item.str.trim()) {
        const tx = item.transform || [1, 0, 0, 11, 0, 0];
        spans.push({
          str: item.str.trim(),
          x: tx[4] || 0,
          y: tx[5] || 0,
          width: item.width || 0,
        });
      }
    }

    if (spans.length === 0 && enableOcr) {
      options.onProgress?.(i + 1, targetPages.length, `Running OCR table extraction on page ${pageNum}...`);
      try {
        const ocrRes = await runOcrOnPdf(file, {
          language: options.ocrLanguage || 'eng',
          pageNumbers: [pageNum],
          generateSearchablePdf: false,
          signal: options.signal,
        });
        const ocrPage = ocrRes.pages[0];
        if (ocrPage && ocrPage.lines.length > 0) {
          const ocrRows: string[][] = [];
          const lowConfRows: number[] = [];
          ocrPage.lines.forEach((line, lIdx) => {
            const cols = line.text
              .trim()
              .split(/\s{2,}|\t|\|/)
              .map((c) => c.trim())
              .filter(Boolean);
            if (cols.length > 0) {
              ocrRows.push(cols.length === 1 ? line.text.trim().split(/\s+/) : cols);
              if (line.confidence < 75) {
                lowConfRows.push(ocrRows.length - 1);
              }
            } else if (line.confidence < 75) {
              lowConfRows.push(lIdx);
            }
          });
          if (ocrRows.length > 0) {
            tables.push({
              id: `p${pageNum}_ocr_t1`,
              pageNumber: pageNum,
              title: `Page ${pageNum} (OCR Table)`,
              rows: ocrRows,
              lowConfidenceRows: lowConfRows,
              source: 'ocr',
            });
            warnings.push(
              `Page ${pageNum} required OCR extraction; review highlighted low-confidence rows before exporting.`
            );
          }
        }
      } catch {
        warnings.push(`OCR failed on scanned page ${pageNum}.`);
      }
      continue;
    }

    // Group spans by Y coordinate lines
    spans.sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x));
    const lines: TableCellSpan[][] = [];
    for (const s of spans) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0]!.y - s.y) <= 5) {
        last.push(s);
      } else {
        lines.push([s]);
      }
    }

    // Segment lines into distinct tables when multi-column density stops or huge vertical gap appears
    let currentBlock: TableCellSpan[][] = [];
    let tableCounter = 1;

    const commitBlock = () => {
      if (currentBlock.length >= 2) {
        const { rows, lowConfidenceRows } = alignRowsIntoColumns(currentBlock);
        tables.push({
          id: `p${pageNum}_t${tableCounter}`,
          pageNumber: pageNum,
          title: `Page ${pageNum} - Table ${tableCounter}`,
          rows,
          lowConfidenceRows,
          source: 'vector-text',
        });
        tableCounter++;
      }
      currentBlock = [];
    };

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l]!.sort((a, b) => a.x - b.x);
      // Merge tight horizontal words into cells separated by explicit column spacing (> 14pt)
      const mergedLine: TableCellSpan[] = [];
      for (const item of line) {
        const prev = mergedLine[mergedLine.length - 1];
        if (prev && item.x - (prev.x + prev.width) < 14) {
          prev.str = `${prev.str} ${item.str}`;
          prev.width = item.x + item.width - prev.x;
        } else {
          mergedLine.push({ ...item });
        }
      }

      if (mergedLine.length >= 2) {
        if (currentBlock.length > 0) {
          const prevY = currentBlock[currentBlock.length - 1]![0]!.y;
          if (Math.abs(prevY - mergedLine[0]!.y) > 42) {
            commitBlock();
          }
        }
        currentBlock.push(mergedLine);
      } else {
        // Allow 1-row continuation if inside an active table with slight misalignment, otherwise close table
        commitBlock();
      }
    }
    commitBlock();

    // Fallback: if no strict 2+ column blocks detected on page, provide raw lines for manual splitting
    if (tableCounter === 1 && lines.length > 0) {
      const fallbackRows = lines.map((line) => [
        line
          .sort((a, b) => a.x - b.x)
          .map((s) => s.str)
          .join(' '),
      ]);
      tables.push({
        id: `p${pageNum}_raw`,
        pageNumber: pageNum,
        title: `Page ${pageNum} (Unstructured Lines)`,
        rows: fallbackRows,
        lowConfidenceRows: fallbackRows.map((_, idx) => idx),
        source: 'vector-text',
      });
      warnings.push(
        `No strict multi-column table borders detected on page ${pageNum}; extracted lines for manual review.`
      );
    }
  }

  return {
    tables,
    warnings,
    totalPagesScanned: targetPages.length,
  };
}

/**
 * Exports inspected/edited tables to an Excel (.xlsx) or CSV (.csv) Blob using SheetJS.
 */
export function exportTablesToSpreadsheet(
  tables: ExtractedPdfTable[],
  format: 'xlsx' | 'csv',
  baseFilename: string
): { blob: Blob; filename: string } {
  if (tables.length === 0) {
    throw new Error('No tables available to export.');
  }

  const cleanBase = baseFilename.replace(/\.[^/.]+$/, '');

  if (format === 'csv') {
    const combinedRows: string[][] = [];
    tables.forEach((tbl, idx) => {
      if (idx > 0) combinedRows.push([]);
      combinedRows.push(...tbl.rows);
    });
    const sheet = XLSX.utils.aoa_to_sheet(combinedRows);
    const csvString = XLSX.utils.sheet_to_csv(sheet);
    return {
      blob: toBlob(new TextEncoder().encode(csvString), 'text/csv;charset=utf-8'),
      filename: `${cleanBase}_tables.csv`,
    };
  }

  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  tables.forEach((tbl, idx) => {
    let safeName = tbl.title.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || `Table_${idx + 1}`;
    while (usedNames.has(safeName)) {
      safeName = `${safeName.slice(0, 24)}_${idx + 1}`;
    }
    usedNames.add(safeName);

    const worksheet = XLSX.utils.aoa_to_sheet(tbl.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  });

  const outBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return {
    blob: toBlob(
      new Uint8Array(outBytes),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ),
    filename: `${cleanBase}_tables.xlsx`,
  };
}
