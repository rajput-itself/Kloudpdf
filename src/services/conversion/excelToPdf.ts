import * as XLSX from 'xlsx';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';
import { escapeHtml, sanitizeHtmlStrict } from '../../utils/fileSecurity';
import { appendCanvasSlicesToPdf, captureOffscreenDom } from './domToPdfPipeline';

export interface ExcelWorkbookInfo {
  sheetNames: string[];
  workbook: XLSX.WorkBook;
}

export interface ExcelToPdfOptions {
  sheetNames?: string[]; // Specific sheets to include (defaults to all or first)
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter';
  fitToWidth?: boolean;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Parses an Excel or CSV file and returns workbook information including sheet names.
 */
export async function parseExcelWorkbook(file: File): Promise<ExcelWorkbookInfo> {
  const buffer = await file.arrayBuffer();
  // Never parse/execute VBA macros (bookVBA: false)
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, bookVBA: false });
  return {
    sheetNames: workbook.SheetNames,
    workbook,
  };
}

/**
 * Extracts a stylized, XSS-sanitized HTML table for a given sheet name.
 */
export function getSheetHtmlTable(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fitToWidth: boolean = true
): string {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return '<p>No data found in worksheet.</p>';

  const rawHtml = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
  const safeTableHtml = sanitizeHtmlStrict(rawHtml);
  const safeSheetTitle = escapeHtml(sheetName);

  // Inject responsive, professional table styling
  const styledHtml = `
    <div class="excel-sheet-render" style="width: ${fitToWidth ? '100%' : 'auto'}; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <h3 style="font-size: 16px; font-weight: 600; color: #1a73e8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #e8eaed;">
        ${safeSheetTitle}
      </h3>
      <div style="width: 100%; overflow-x: auto;">
        ${safeTableHtml}
      </div>
    </div>
  `;

  return styledHtml;
}

/**
 * Converts selected Excel worksheets into a multi-page PDF document client-side.
 */
export async function convertExcelToPdf(
  file: File,
  options: ExcelToPdfOptions = {}
): Promise<Blob> {
  const orientation = options.orientation ?? 'landscape';
  const pageSize = options.pageSize ?? 'a4';
  const fitToWidth = options.fitToWidth ?? true;

  const { workbook, sheetNames } = await parseExcelWorkbook(file);
  const targetSheets = options.sheetNames && options.sheetNames.length > 0
    ? options.sheetNames
    : sheetNames;

  if (targetSheets.length === 0) {
    throw new Error('No worksheets selected for conversion.');
  }

  // Base dimensions
  const dims = pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4;
  const pageWidth = orientation === 'portrait' ? dims[0] : dims[1];
  const pageHeight = orientation === 'portrait' ? dims[1] : dims[0];
  const margin = 20;

  const pdfDoc = await PDFDocument.create();

  for (let sIdx = 0; sIdx < targetSheets.length; sIdx++) {
    if (options.signal?.aborted) throw new Error('Conversion cancelled by user.');
    const sheetName = targetSheets[sIdx]!;
    options.onProgress?.(sIdx + 1, targetSheets.length);

    const sheetHtml = getSheetHtmlTable(workbook, sheetName, fitToWidth);
    const canvas = await captureOffscreenDom(
      {
        widthPx: orientation === 'portrait' ? 794 : 1123,
        padding: '24px',
        scale: 1.8,
      },
      (container) => {
        container.innerHTML = sheetHtml;

        const table = container.querySelector('table');
        if (table) {
          table.style.width = fitToWidth ? '100%' : 'auto';
          table.style.borderCollapse = 'collapse';
          table.style.fontSize = '12px';
          table.style.color = '#202124';

          const cells = table.querySelectorAll<HTMLElement>('td, th');
          cells.forEach((cell) => {
            cell.style.border = '1px solid #dadce0';
            cell.style.padding = '6px 8px';
            cell.style.textAlign = 'left';
            cell.style.wordBreak = 'break-word';
          });

          const headerRow = table.querySelector('tr');
          if (headerRow) {
            headerRow.style.backgroundColor = '#f1f3f4';
            headerRow.style.fontWeight = '600';
          }
        }
      }
    );

    await appendCanvasSlicesToPdf(pdfDoc, canvas, {
      pageWidth,
      pageHeight,
      margin,
      jpegQuality: 0.95,
      signal: options.signal,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
