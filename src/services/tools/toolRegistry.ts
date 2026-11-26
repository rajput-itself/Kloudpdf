import { ProcessedResult, PDFPageInfo, ToolId } from '../../types';
import { mergePdfFiles } from '../pdf/merge';
import { splitPdfFile } from '../pdf/split';
import { organizePdfFile, PageReorderItem } from '../pdf/organize';
import { rotatePdfFile } from '../pdf/rotate';
import { convertJpgToPdf, convertPdfToJpg } from '../pdf/convert';
import { addWatermarkToPdf } from '../pdf/watermark';
import { addPageNumbersToPdf, PageNumberPosition } from '../pdf/pageNumbers';
import { protectPdfFile } from '../pdf/protect';
import { extractTextFromPdf } from '../pdf/textExtraction';
import { convertPdfToGrayscale } from '../pdf/grayscale';
import { applyAnnotationsToPdf, AnnotationItem } from '../pdf/annotations';
import { saveFilledPdfForm } from '../pdf/forms';
import { flattenPdfDocument } from '../pdf/flatten';
import { removeBlankPagesFromPdf } from '../pdf/blankPageDetection';
import { createBookletPdf } from '../pdf/booklet';
import { deskewPdfDocument } from '../pdf/deskew';
import { convertPdfToImages } from '../conversion/pdfToImages';
import { convertHtmlToPdf, HtmlOrientation, HtmlPageSize } from '../conversion/htmlToPdf';
import { convertWordToPdf } from '../conversion/wordToPdf';
import { convertExcelToPdf } from '../conversion/excelToPdf';
import { convertPowerPointToPdf } from '../conversion/powerpointToPdf';
import { convertPdfToWord } from '../conversion/pdfToWord';
import { extractTablesFromPdf, exportTablesToSpreadsheet, ExtractedPdfTable } from '../conversion/pdfToExcel';
import { convertPdfToPptx, PptxAspectRatio, PptxConversionMode } from '../conversion/pdfToPptx';
import { convertTextOrMarkdownToPdf } from '../conversion/textAndMarkdownToPdf';

export interface ToolWorkspaceOptionsState {
  pages: PDFPageInfo[];
  splitRange: string;
  globalRotation: number;
  jpgOrientation: 'portrait' | 'landscape' | 'fit';
  jpgMargin: number;
  pngScale: number;
  webpQuality: number;
  htmlCode: string;
  htmlPageSize: HtmlPageSize;
  htmlOrientation: HtmlOrientation;
  htmlMargin: number;
  wordOrientation: 'portrait' | 'landscape';
  wordMargin: number;
  selectedSheets: string[];
  excelOrientation: 'portrait' | 'landscape';
  excelPageSize: 'a4' | 'letter';
  excelFitToWidth: boolean;
  selectedPptxSlides: number[];
  pdfToWordOcr: boolean;
  pdfToWordLang: 'eng' | 'hin' | 'spa' | 'fra' | 'deu';
  extractedTables: ExtractedPdfTable[];
  excelExportFormat: 'xlsx' | 'csv';
  ocrSearchablePdf: boolean;
  ocrLanguage: 'eng' | 'hin' | 'spa' | 'fra' | 'deu';
  pdfToPptxMode: PptxConversionMode;
  pdfToPptxAspect: PptxAspectRatio;
  plainOrMdText: string;
  textPageSize: 'a4' | 'letter';
  textFontSize: number;
  grayscaleMode: 'standard' | 'high-contrast';
  annotations: AnnotationItem[];
  formFieldValues: Record<string, string | boolean>;
  flattenOnSave: boolean;
  deskewManualAngle: number;
  watermarkText: string;
  watermarkColor: 'gray' | 'red' | 'blue' | 'black';
  watermarkPosition: 'center' | 'top' | 'bottom';
  watermarkOpacity: number;
  watermarkSize: number;
  pageNumberPosition: PageNumberPosition;
  pageNumberFormat: 'Page {n} of {total}' | 'Page {n}' | '{n}' | '{n} of {total}';
  protectPassword: string;
  protectConfirm: string;
  bookletPaper: 'a4' | 'a3';
  bookletMargin: number;
  bookletGutter: number;
}

export interface ToolExecutionContext {
  toolId: ToolId;
  files: File[];
  primaryFile: File;
  baseName: string;
  options: ToolWorkspaceOptionsState;
  setStatusText: (text: string) => void;
  setProgressDetail: (detail: string) => void;
}

export type ToolHandler = (ctx: ToolExecutionContext) => Promise<ProcessedResult>;

const singlePdf = (blob: Blob, filename: string): ProcessedResult => ({
  blob,
  filename,
  downloadUrl: '',
});

/**
 * Tool Handler Registry (Registry Pattern): maps each ToolId to its self-contained runner.
 */
export const TOOL_HANDLERS: Partial<Record<ToolId, ToolHandler>> = {
  merge: async ({ files, baseName, setStatusText, setProgressDetail }) => {
    if (files.length < 2) throw new Error('Please add at least 2 PDF files to merge.');
    setStatusText('Merging PDF documents...');
    const blob = await mergePdfFiles(files, {
      onProgress: (cur, tot) => setProgressDetail(`Processing document ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_merged.pdf`);
  },

  split: async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Splitting PDF document...');
    let blob: Blob;
    if (options.splitRange.trim()) {
      blob = await splitPdfFile(primaryFile, {
        pageRangeString: options.splitRange,
        onProgress: (cur, tot) => setProgressDetail(`Exporting page ${cur} of ${tot}`),
      });
    } else {
      const selectedIndices = options.pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
      if (selectedIndices.length === 0) throw new Error('Please specify a page range or select pages.');
      blob = await splitPdfFile(primaryFile, {
        pageIndices: selectedIndices,
        onProgress: (cur, tot) => setProgressDetail(`Exporting page ${cur} of ${tot}`),
      });
    }
    return singlePdf(blob, `${baseName}_split.pdf`);
  },

  organize: async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Saving organized PDF...');
    const pages: PageReorderItem[] = options.pages.map((p) => ({
      originalIndex: p.pageNumber - 1,
      rotation: p.rotation,
    }));
    const blob = await organizePdfFile(primaryFile, {
      pages,
      onProgress: (cur, tot) => setProgressDetail(`Rebuilding page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_organized.pdf`);
  },

  rotate: async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Rotating PDF pages...');
    const blob = await rotatePdfFile(primaryFile, {
      angle: options.globalRotation,
      onProgress: (cur, tot) => setProgressDetail(`Rotating page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_rotated.pdf`);
  },

  'remove-pages': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Removing pages from PDF...');
    const keepIndices = options.pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
    if (keepIndices.length === 0) {
      throw new Error('You cannot remove all pages. Please keep at least one page.');
    }
    const blob = await splitPdfFile(primaryFile, {
      pageIndices: keepIndices,
      onProgress: (cur, tot) => setProgressDetail(`Copying page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_removed_pages.pdf`);
  },

  'extract-pages': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Extracting chosen pages...');
    const extractIndices = options.pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
    if (extractIndices.length === 0 && !options.splitRange.trim()) {
      throw new Error('Please select at least one page to extract.');
    }
    const blob = await splitPdfFile(primaryFile, {
      pageIndices: extractIndices.length > 0 ? extractIndices : undefined,
      pageRangeString: extractIndices.length === 0 ? options.splitRange : undefined,
      onProgress: (cur, tot) => setProgressDetail(`Extracting page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_extracted.pdf`);
  },

  'remove-blank-pages': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Removing blank pages...');
    const pagesToRemove = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    if (pagesToRemove.length === 0) throw new Error('No blank pages selected for removal.');
    const blob = await removeBlankPagesFromPdf(primaryFile, pagesToRemove, (cur, tot) => {
      setProgressDetail(`Processing page removal ${cur} of ${tot}`);
    });
    return singlePdf(blob, `${baseName}_no_blanks.pdf`);
  },

  'booklet-maker': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Generating booklet imposition...');
    const blob = await createBookletPdf(primaryFile, {
      paperSize: options.bookletPaper,
      margin: options.bookletMargin,
      gutter: options.bookletGutter,
      onProgress: (cur, tot) => setProgressDetail(`Arranging sheet ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_booklet.pdf`);
  },

  'jpg-to-pdf': async ({ files, options, setStatusText, setProgressDetail }) => {
    setStatusText('Converting images to PDF...');
    const blob = await convertJpgToPdf(files, {
      orientation: options.jpgOrientation,
      margin: options.jpgMargin,
      onProgress: (cur, tot) => setProgressDetail(`Converting image ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}_converted.pdf`);
  },

  'webp-to-pdf': async (ctx) => TOOL_HANDLERS['jpg-to-pdf']!(ctx),

  'pdf-to-jpg': async ({ primaryFile, setStatusText, setProgressDetail }) => {
    setStatusText('Rendering PDF pages to JPG...');
    const { blob, filename } = await convertPdfToJpg(primaryFile, (cur, tot) => {
      setProgressDetail(`Rendering page ${cur} of ${tot}`);
    });
    return singlePdf(blob, filename);
  },

  'pdf-to-png': async ({ primaryFile, options, setStatusText, setProgressDetail }) => {
    setStatusText('Rendering PDF pages to PNG...');
    const selectedPageNums = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    const res = await convertPdfToImages(primaryFile, {
      format: 'png',
      scale: options.pngScale,
      pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
      onProgress: (cur, tot) => setProgressDetail(`Converting page ${cur} of ${tot} to PNG`),
    });
    return {
      blob: res.zipBlob || res.items[0]!.blob,
      filename: res.zipFilename || res.items[0]!.filename,
      downloadUrl: '',
      imageItems: res.items,
    };
  },

  'pdf-to-webp': async ({ primaryFile, options, setStatusText, setProgressDetail }) => {
    setStatusText('Compressing PDF pages to WebP...');
    const selectedPageNums = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    const res = await convertPdfToImages(primaryFile, {
      format: 'webp',
      quality: options.webpQuality,
      pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
      onProgress: (cur, tot) => setProgressDetail(`Compressing page ${cur} of ${tot} to WebP`),
    });
    return {
      blob: res.zipBlob || res.items[0]!.blob,
      filename: res.zipFilename || res.items[0]!.filename,
      downloadUrl: '',
      imageItems: res.items,
    };
  },

  'html-to-pdf': async ({ baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Rendering HTML to PDF...');
    const blob = await convertHtmlToPdf(options.htmlCode, {
      pageSize: options.htmlPageSize,
      orientation: options.htmlOrientation,
      margin: options.htmlMargin,
      onProgress: (cur, tot) => setProgressDetail(`Rendering document slice ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName || 'document'}.pdf`);
  },

  'word-to-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Converting Word document to PDF...');
    const blob = await convertWordToPdf(primaryFile, {
      orientation: options.wordOrientation,
      margin: options.wordMargin,
      onProgress: (cur, tot) => setProgressDetail(`Rendering Word page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}.pdf`);
  },

  'excel-to-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Converting Excel spreadsheet to PDF...');
    const blob = await convertExcelToPdf(primaryFile, {
      sheetNames: options.selectedSheets.length > 0 ? options.selectedSheets : undefined,
      orientation: options.excelOrientation,
      pageSize: options.excelPageSize,
      fitToWidth: options.excelFitToWidth,
      onProgress: (cur, tot) => setProgressDetail(`Rendering worksheet ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}.pdf`);
  },

  'powerpoint-to-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Extracting and rendering PowerPoint slides...');
    const blob = await convertPowerPointToPdf(primaryFile, {
      slideNumbers: options.selectedPptxSlides.length > 0 ? options.selectedPptxSlides : undefined,
      onProgress: (cur, tot) => setProgressDetail(`Rendering slide ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}.pdf`);
  },

  'pdf-to-word': async ({ primaryFile, options, setStatusText, setProgressDetail }) => {
    setStatusText('Reconstructing DOCX document...');
    const selectedPageNums = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    const wordRes = await convertPdfToWord(primaryFile, {
      enableOcrFallback: options.pdfToWordOcr,
      ocrLanguage: options.pdfToWordLang,
      pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
      onProgress: (cur, tot, status) => setProgressDetail(status || `Processing page ${cur} of ${tot}`),
    });
    return singlePdf(wordRes.blob, wordRes.filename);
  },

  'pdf-to-excel': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText(`Generating ${options.excelExportFormat.toUpperCase()} spreadsheet...`);
    let tablesToExport = options.extractedTables;
    if (tablesToExport.length === 0) {
      const extRes = await extractTablesFromPdf(primaryFile, {
        enableOcrFallback: options.ocrSearchablePdf,
        ocrLanguage: options.ocrLanguage,
        onProgress: (cur, tot, st) => setProgressDetail(st || `Scanning page ${cur} of ${tot}`),
      });
      tablesToExport = extRes.tables;
    }
    const exported = exportTablesToSpreadsheet(tablesToExport, options.excelExportFormat, baseName);
    return singlePdf(exported.blob, exported.filename);
  },

  'pdf-to-pptx': async ({ primaryFile, options, setStatusText, setProgressDetail }) => {
    setStatusText('Converting PDF pages to PowerPoint slides...');
    const selectedPageNums = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    const pptxRes = await convertPdfToPptx(primaryFile, {
      mode: options.pdfToPptxMode,
      aspectRatio: options.pdfToPptxAspect,
      pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
      onProgress: (cur, tot, st) => setProgressDetail(st || `Building slide ${cur} of ${tot}`),
    });
    return singlePdf(pptxRes.blob, pptxRes.filename);
  },

  'text-to-pdf': async ({ toolId, baseName, options, setStatusText }) => {
    setStatusText('Generating crisp vector PDF...');
    const blob = await convertTextOrMarkdownToPdf(options.plainOrMdText, {
      pageSize: options.textPageSize,
      fontSize: options.textFontSize,
      isMarkdown: toolId === 'markdown-to-pdf',
    });
    return singlePdf(blob, `${baseName || 'document'}.pdf`);
  },

  'markdown-to-pdf': async (ctx) => TOOL_HANDLERS['text-to-pdf']!(ctx),

  'pdf-to-text': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Extracting text content...');
    const selectedPageNums = options.pages.filter((p) => p.selected).map((p) => p.pageNumber);
    const textResult = await extractTextFromPdf(primaryFile, {
      pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
      onProgress: (cur, tot) => setProgressDetail(`Extracting text from page ${cur} of ${tot}`),
    });
    return {
      blob: new Blob([textResult.fullText], { type: 'text/plain;charset=utf-8' }),
      filename: `${baseName}_text.txt`,
      downloadUrl: '',
      textOutput: textResult.fullText,
    };
  },

  'grayscale-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Converting document to grayscale...');
    const blob = await convertPdfToGrayscale(primaryFile, {
      mode: options.grayscaleMode,
      onProgress: (cur, tot) => setProgressDetail(`Converting page ${cur} of ${tot} to grayscale`),
    });
    return singlePdf(blob, `${baseName}_grayscale.pdf`);
  },

  'annotate-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    if (options.annotations.length === 0) {
      throw new Error('Please add at least one annotation or drawing to the document.');
    }
    setStatusText('Applying annotations to PDF...');
    const blob = await applyAnnotationsToPdf(primaryFile, options.annotations, (cur, tot) => {
      setProgressDetail(`Saving annotations on page ${cur} of ${tot}`);
    });
    return singlePdf(blob, `${baseName}_annotated.pdf`);
  },

  'fill-forms': async ({ primaryFile, baseName, options, setStatusText }) => {
    setStatusText('Saving filled form values...');
    const blob = await saveFilledPdfForm(primaryFile, options.formFieldValues, {
      flatten: options.flattenOnSave,
    });
    return singlePdf(blob, `${baseName}_filled.pdf`);
  },

  'flatten-pdf': async ({ primaryFile, baseName, setStatusText }) => {
    setStatusText('Flattening PDF form fields and annotations...');
    const blob = await flattenPdfDocument(primaryFile);
    return singlePdf(blob, `${baseName}_flattened.pdf`);
  },

  'deskew-pdf': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Deskewing pages...');
    const blob = await deskewPdfDocument(primaryFile, {
      manualAngle: options.deskewManualAngle,
      onProgress: (cur, tot) => setProgressDetail(`Deskewing page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_deskewed.pdf`);
  },

  watermark: async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    if (!options.watermarkText.trim()) throw new Error('Please enter watermark text.');
    setStatusText('Applying watermark...');
    const blob = await addWatermarkToPdf(primaryFile, {
      text: options.watermarkText,
      fontSize: options.watermarkSize,
      color: options.watermarkColor,
      position: options.watermarkPosition,
      opacity: options.watermarkOpacity,
      onProgress: (cur, tot) => setProgressDetail(`Watermarking page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_watermarked.pdf`);
  },

  'page-numbers': async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    setStatusText('Inserting page numbers...');
    const blob = await addPageNumbersToPdf(primaryFile, {
      position: options.pageNumberPosition,
      format: options.pageNumberFormat,
      onProgress: (cur, tot) => setProgressDetail(`Numbering page ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_numbered.pdf`);
  },

  protect: async ({ primaryFile, baseName, options, setStatusText, setProgressDetail }) => {
    if (!options.protectPassword) throw new Error('Please enter a password.');
    if (options.protectPassword !== options.protectConfirm) {
      throw new Error('Passwords do not match. Please verify your password.');
    }
    if (options.protectPassword.length < 4) {
      throw new Error('Password must be at least 4 characters.');
    }
    setStatusText('Encrypting PDF document...');
    const blob = await protectPdfFile(primaryFile, {
      password: options.protectPassword,
      onProgress: (cur, tot) => setProgressDetail(`Encrypting block ${cur} of ${tot}`),
    });
    return singlePdf(blob, `${baseName}_protected.pdf`);
  },
};
