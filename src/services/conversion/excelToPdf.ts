import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { toBlob } from '../../utils/file';

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
}

/**
 * Parses an Excel or CSV file and returns workbook information including sheet names.
 */
export async function parseExcelWorkbook(file: File): Promise<ExcelWorkbookInfo> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  return {
    sheetNames: workbook.SheetNames,
    workbook,
  };
}

/**
 * Extracts a stylized HTML table for a given sheet name.
 */
export function getSheetHtmlTable(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fitToWidth: boolean = true
): string {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return '<p>No data found in worksheet.</p>';

  const rawHtml = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });

  // Inject responsive, professional table styling
  const styledHtml = `
    <div class="excel-sheet-render" style="width: ${fitToWidth ? '100%' : 'auto'}; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <h3 style="font-size: 16px; font-weight: 600; color: #1a73e8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #e8eaed;">
        ${sheetName}
      </h3>
      <div style="width: 100%; overflow-x: auto;">
        ${rawHtml}
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
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const pdfDoc = await PDFDocument.create();

  // Create temporary container for table rendering
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = orientation === 'portrait' ? '794px' : '1123px';
  container.style.backgroundColor = '#ffffff';
  container.style.padding = '24px';
  container.style.boxSizing = 'border-box';

  document.body.appendChild(container);

  try {
    for (let sIdx = 0; sIdx < targetSheets.length; sIdx++) {
      const sheetName = targetSheets[sIdx]!;
      options.onProgress?.(sIdx + 1, targetSheets.length);

      const sheetHtml = getSheetHtmlTable(workbook, sheetName, fitToWidth);
      container.innerHTML = sheetHtml;

      // Apply consistent styling to all table elements
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

      const canvas = await html2canvas(container, {
        scale: 1.8,
        useCORS: false,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pageAspectRatio = availableHeight / availableWidth;
      const sliceHeightPx = Math.floor(canvas.width * pageAspectRatio);
      const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

      for (let sliceIdx = 0; sliceIdx < totalSlices; sliceIdx++) {
        const sourceY = sliceIdx * sliceHeightPx;
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
              else reject(new Error(`Failed to render sheet slice ${sliceIdx + 1}`));
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
