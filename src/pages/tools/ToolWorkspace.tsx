import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  FileText,
  Eye,
  EyeOff,
  AlertCircle,
  FileImage,
  Code,
  Table as TableIcon,
  Presentation,
  Check,
  Info,
  Highlighter,
  PenTool,
  Square,
  Circle as CircleIcon,
  ArrowRight,
  Type,
  Undo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ToolDefinition, ProcessingState, ProcessedResult, PDFPageInfo } from '../../types';
import { FileUpload } from '../../components/FileUpload/FileUpload';
import { PDFPageThumbnail } from '../../components/PDFPreview/PDFPageThumbnail';
import { ProcessingView } from './ProcessingView';
import { CompletedView } from './CompletedView';
import { Button } from '../../components/common/Button/Button';
import { formatBytes, isValidFileType } from '../../utils/file';
import { revokeObjectUrls } from '../../utils/disposableScope';
import { loadPdfDocument, renderPageToCanvas } from '../../services/pdf/render';
import { TOOL_HANDLERS } from '../../services/tools/toolRegistry';

// Metadata / preview helpers still consumed directly inside ToolWorkspace UI
import { PageNumberPosition } from '../../services/pdf/pageNumbers';
import { HtmlPageSize, HtmlOrientation, sanitizeHtml } from '../../services/conversion/htmlToPdf';
import { renderDocxPreview } from '../../services/conversion/wordToPdf';
import { parseExcelWorkbook, getSheetHtmlTable } from '../../services/conversion/excelToPdf';
import { inspectPptx, PptxInspectionResult } from '../../services/conversion/powerpointToPdf';
import { extractTablesFromPdf, ExtractedPdfTable } from '../../services/conversion/pdfToExcel';
import { PptxAspectRatio, PptxConversionMode } from '../../services/conversion/pdfToPptx';
import { AnnotationItem, AnnotationType } from '../../services/pdf/annotations';
import { inspectPdfForm, DetectedFormField } from '../../services/pdf/forms';
import { analyzePdfBlankPages, PageBlankAnalysis } from '../../services/pdf/blankPageDetection';
import { calculateBookletLayout } from '../../services/pdf/booklet';
import { detectCanvasSkewAngle } from '../../services/pdf/deskew';

import './ToolWorkspace.css';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
}

const DEFAULT_SAMPLE_HTML = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px;">
  <div style="border-bottom: 2px solid #1a73e8; padding-bottom: 12px; margin-bottom: 20px;">
    <h1 style="color: #202124; margin: 0 0 6px 0; font-size: 24px;">KloudPDF Document</h1>
    <p style="color: #5f6368; margin: 0; font-size: 13px;">PDF tools. Made simple.</p>
  </div>
  <h2 style="color: #202124; font-size: 17px; margin-top: 16px;">Browser-Native Conversion</h2>
  <p style="color: #3c4043; line-height: 1.6; font-size: 14px;">
    This document was converted directly inside your web browser. No external servers, third-party APIs, or cloud backends were involved.
  </p>
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px;">
    <thead>
      <tr style="background-color: #f1f3f4; text-align: left;">
        <th style="padding: 8px 12px; border: 1px solid #dadce0;">Feature</th>
        <th style="padding: 8px 12px; border: 1px solid #dadce0;">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #dadce0;">100% Client-Side</td>
        <td style="padding: 8px 12px; border: 1px solid #dadce0; color: #1e8e3e; font-weight: 600;">Active</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #dadce0;">Zero Server Transmission</td>
        <td style="padding: 8px 12px; border: 1px solid #dadce0; color: #1e8e3e; font-weight: 600;">Guaranteed</td>
      </tr>
    </tbody>
  </table>
</div>`;

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool, onBack }) => {
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [pages, setPages] = useState<PDFPageInfo[]>([]);

  // Processing indicators
  const [statusText, setStatusText] = useState('Processing document...');
  const [progressDetail, setProgressDetail] = useState<string | undefined>();
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tool-specific configurations
  const [splitRange, setSplitRange] = useState('');
  const [globalRotation, setGlobalRotation] = useState<number>(90);

  // JPG to PDF options
  const [jpgOrientation, setJpgOrientation] = useState<'portrait' | 'landscape' | 'fit'>('portrait');
  const [jpgMargin, setJpgMargin] = useState<number>(20);

  // PDF to PNG options
  const [pngScale, setPngScale] = useState<number>(2);

  // PDF to WebP options
  const [webpQuality, setWebpQuality] = useState<number>(0.85);

  // HTML to PDF options
  const [htmlInputMode, setHtmlInputMode] = useState<'file' | 'code'>('file');
  const [htmlCode, setHtmlCode] = useState<string>(DEFAULT_SAMPLE_HTML);
  const [htmlPageSize, setHtmlPageSize] = useState<HtmlPageSize>('a4');
  const [htmlOrientation, setHtmlOrientation] = useState<HtmlOrientation>('portrait');
  const [htmlMargin, setHtmlMargin] = useState<number>(20);

  // Word to PDF options & preview
  const [wordOrientation, setWordOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [wordMargin, setWordMargin] = useState<number>(20);
  const wordPreviewRef = useRef<HTMLDivElement>(null);

  // Excel to PDF options & preview
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [excelSheetNames, setExcelSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [activePreviewSheet, setActivePreviewSheet] = useState<string>('');
  const [excelOrientation, setExcelOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [excelPageSize, setExcelPageSize] = useState<'a4' | 'letter'>('a4');
  const [excelFitToWidth, setExcelFitToWidth] = useState<boolean>(true);

  // PowerPoint to PDF options & inspection
  const [pptxInspection, setPptxInspection] = useState<PptxInspectionResult | null>(null);
  const [selectedPptxSlides, setSelectedPptxSlides] = useState<number[]>([]);

  // PDF to Word options
  const [pdfToWordOcr, setPdfToWordOcr] = useState<boolean>(true);
  const [pdfToWordLang, setPdfToWordLang] = useState<'eng' | 'hin' | 'spa' | 'fra' | 'deu'>('eng');

  // PDF to Excel / CSV options & editable preview
  const [extractedTables, setExtractedTables] = useState<ExtractedPdfTable[]>([]);
  const [tableWarnings, setTableWarnings] = useState<string[]>([]);
  const [excelExportFormat, setExcelExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [isExtractingTables, setIsExtractingTables] = useState<boolean>(false);

  // PDF to PowerPoint options
  const [pdfToPptxMode, setPdfToPptxMode] = useState<PptxConversionMode>('image-slides');
  const [pdfToPptxAspect, setPdfToPptxAspect] = useState<PptxAspectRatio>('16:9');

  // Text / Markdown to PDF options
  const [plainOrMdText, setPlainOrMdText] = useState<string>('# KloudPDF Document\n\nWrite or paste **Markdown** or plain text here to convert into a crisp vector PDF locally.');
  const [textPageSize, setTextPageSize] = useState<'a4' | 'letter'>('a4');
  const [textFontSize, setTextFontSize] = useState<number>(11);

  // Watermark options
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkColor, setWatermarkColor] = useState<'gray' | 'red' | 'blue' | 'black'>('gray');
  const [watermarkPosition, setWatermarkPosition] = useState<'center' | 'top' | 'bottom'>('center');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.25);
  const [watermarkSize, setWatermarkSize] = useState<number>(48);

  // Page numbers options
  const [pageNumberPosition, setPageNumberPosition] = useState<PageNumberPosition>('bottom-center');
  const [pageNumberFormat, setPageNumberFormat] = useState<
    'Page {n} of {total}' | 'Page {n}' | '{n}' | '{n} of {total}'
  >('Page {n} of {total}');

  // Protect options
  const [protectPassword, setProtectPassword] = useState('');
  const [protectConfirm, setProtectConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // --- ADVANCED FEATURE STATES ---
  // Grayscale options
  const [grayscaleMode, setGrayscaleMode] = useState<'standard' | 'high-contrast'>('standard');

  // OCR defaults for PDF-to-Excel table extraction
  const ocrLanguage = 'eng' as const;
  const ocrSearchablePdf = true;

  // Blank pages detection
  const [blankAnalysis, setBlankAnalysis] = useState<PageBlankAnalysis[]>([]);
  const [blankSensitivity, setBlankSensitivity] = useState<number>(0.1);

  // Booklet options
  const [bookletPaper, setBookletPaper] = useState<'a4' | 'a3'>('a4');
  const [bookletMargin, setBookletMargin] = useState<number>(15);
  const [bookletGutter, setBookletGutter] = useState<number>(10);

  // Forms options
  const [detectedFormFields, setDetectedFormFields] = useState<DetectedFormField[]>([]);
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string | boolean>>({});
  const [flattenOnSave, setFlattenOnSave] = useState(false);
  const [isXfaForm, setIsXfaForm] = useState(false);

  // Deskew options
  const [deskewDetectedAngle, setDeskewDetectedAngle] = useState<number>(0);
  const [deskewManualAngle, setDeskewManualAngle] = useState<number>(0);

  // Interactive canvas state
  const [activeInteractivePage, setActiveInteractivePage] = useState<number>(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStartCoord, setDragStartCoord] = useState<{ x: number; y: number } | null>(null);
  const [currentDragRect, setCurrentDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Annotation options
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationType>('highlight');
  const [annotationColor, setAnnotationColor] = useState<string>('#fbbc04');
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState<number>(3);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [annotationTextNote, setAnnotationTextNote] = useState('Note text');
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);

  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement>(null);

  // Cleanup on unmount or reset
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [pdfDoc]);

  useEffect(() => {
    const urls = pptxInspection?.slides.flatMap((s) => s.imageUrls) ?? [];
    return () => revokeObjectUrls(urls);
  }, [pptxInspection]);

  // Render active page canvas for interactive tools (Annotate, Deskew)
  useEffect(() => {
    if (!pdfDoc || !interactiveCanvasRef.current) return;
    if (tool.id !== 'annotate-pdf' && tool.id !== 'deskew-pdf') {
      return;
    }

    let isCancelled = false;
    async function renderPage() {
      if (!pdfDoc || !interactiveCanvasRef.current) return;
      const canvas = interactiveCanvasRef.current;
      await renderPageToCanvas(pdfDoc, activeInteractivePage, canvas, { scale: 1.2 });

      if (tool.id === 'deskew-pdf' && !isCancelled) {
        const detected = detectCanvasSkewAngle(canvas);
        setDeskewDetectedAngle(detected.detectedAngle);
        if (deskewManualAngle === 0 && Math.abs(detected.detectedAngle) > 0.1) {
          setDeskewManualAngle(detected.detectedAngle);
        }
      }
    }

    renderPage();
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, activeInteractivePage, tool.id]);

  // Load PDF.js document when a PDF file is chosen
  const loadSinglePdfDoc = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const doc = await loadPdfDocument(buffer);
      setPdfDoc(doc);
      setPageCount(doc.numPages);

      // Tool-specific automatic analyses
      if (tool.id === 'remove-blank-pages') {
        const analysis = await analyzePdfBlankPages(file, { thresholdPercentage: blankSensitivity });
        setBlankAnalysis(analysis);
        // Pre-select detected blank pages for removal
        const initialPages: PDFPageInfo[] = analysis.map((a) => ({
          pageNumber: a.pageNumber,
          rotation: 0,
          selected: a.isBlank,
        }));
        setPages(initialPages);
      } else if (tool.id === 'fill-forms') {
        const formInfo = await inspectPdfForm(file);
        setDetectedFormFields(formInfo.fields);
        setIsXfaForm(formInfo.isXfa);
        const initVals: Record<string, string | boolean> = {};
        formInfo.fields.forEach((f) => {
          initVals[f.name] = f.currentValue;
        });
        setFormFieldValues(initVals);

        const initialPages: PDFPageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          initialPages.push({ pageNumber: i, rotation: 0, selected: true });
        }
        setPages(initialPages);
      } else if (tool.id === 'pdf-to-excel') {
        const initialPages: PDFPageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          initialPages.push({ pageNumber: i, rotation: 0, selected: true });
        }
        setPages(initialPages);
        setIsExtractingTables(true);
        try {
          const tableRes = await extractTablesFromPdf(file, {
            enableOcrFallback: ocrSearchablePdf,
            ocrLanguage: ocrLanguage,
          });
          setExtractedTables(tableRes.tables);
          setTableWarnings(tableRes.warnings);
        } finally {
          setIsExtractingTables(false);
        }
      } else {
        const initialPages: PDFPageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          initialPages.push({
            pageNumber: i,
            rotation: 0,
            selected: tool.id === 'extract-pages' ? false : true,
          });
        }
        setPages(initialPages);
      }
    } catch (err: unknown) {
      console.error('Failed to load PDF preview:', err);
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted')) {
        setErrorMessage('This PDF is password-protected. Please provide an unlocked document.');
      } else {
        setErrorMessage('Could not render PDF preview. Please ensure the file is a valid, uncorrupted PDF.');
      }
    }
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    setErrorMessage(null);
    if (newFiles.length === 0) return;

    if (tool.acceptMultiple) {
      const combined = [...files, ...newFiles];
      setFiles(combined);
      setProcessingState('configured');
    } else {
      const single = newFiles[0]!;
      setFiles([single]);
      setProcessingState('configured');

      const lowerName = single.name.toLowerCase();

      // PDF based tools
      if (lowerName.endsWith('.pdf')) {
        await loadSinglePdfDoc(single);
      }
      // Word (.docx)
      else if (lowerName.endsWith('.docx')) {
        setTimeout(async () => {
          if (wordPreviewRef.current) {
            try {
              await renderDocxPreview(single, wordPreviewRef.current);
            } catch (err) {
              console.warn('Word preview render warning:', err);
            }
          }
        }, 100);
      }
      // Excel (.xlsx, .xls, .csv)
      else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
        try {
          const info = await parseExcelWorkbook(single);
          setExcelWorkbook(info.workbook);
          setExcelSheetNames(info.sheetNames);
          setSelectedSheets(info.sheetNames);
          setActivePreviewSheet(info.sheetNames[0] || '');
        } catch (err) {
          console.error('Failed to parse Excel file:', err);
          setErrorMessage('Could not read spreadsheet data. Please ensure it is a valid Excel or CSV file.');
        }
      }
      // PowerPoint (.pptx)
      else if (lowerName.endsWith('.pptx')) {
        try {
          const info = await inspectPptx(single);
          setPptxInspection(info);
          setSelectedPptxSlides(info.slides.map((s) => s.slideNumber));
        } catch (err) {
          console.error('Failed to inspect PowerPoint file:', err);
          setErrorMessage('Could not parse PowerPoint slides. Please ensure the file is an uncorrupted .pptx presentation.');
        }
      }
      // Text / Markdown (.txt, .md)
      else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
        try {
          const text = await single.text();
          setPlainOrMdText(text);
        } catch (err) {
          console.error('Failed to read text/markdown file:', err);
          setErrorMessage('Could not read text file.');
        }
      }
      // HTML (.html, .htm)
      else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
        try {
          const text = await single.text();
          setHtmlCode(text);
          setHtmlInputMode('file');
        } catch (err) {
          console.error('Failed to read HTML file:', err);
          setErrorMessage('Could not read HTML file.');
        }
      }
    }
  };

  const handleStartWithHtmlCode = () => {
    setFiles([new File([htmlCode], 'custom_page.html', { type: 'text/html' })]);
    setHtmlInputMode('code');
    setProcessingState('configured');
  };

  const handleStartWithTextOrMd = () => {
    const isMd = tool.id === 'markdown-to-pdf';
    const sample = isMd
      ? '# KloudPDF Markdown Export\n\n## Privacy First\n- 100% browser processing\n- Zero server uploads\n\n> Crisp vector typography using pdf-lib.\n'
      : 'KloudPDF Vector Text Document\n\nType or paste plain text here to generate a searchable PDF.';
    setPlainOrMdText(sample);
    setFiles([
      new File([sample], isMd ? 'document.md' : 'document.txt', {
        type: isMd ? 'text/markdown' : 'text/plain',
      }),
    ]);
    setProcessingState('configured');
  };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const additional = Array.from(e.target.files).filter((f) =>
      isValidFileType(f, tool.acceptedFileTypes)
    );
    if (additional.length > 0) {
      setFiles((prev) => [...prev, ...additional]);
    }
    e.target.value = '';
  };

  const handleMoveFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    const updated = [...files];
    const item = updated[index]!;
    updated[index] = updated[targetIndex]!;
    updated[targetIndex] = item;
    setFiles(updated);
  };

  const handleRemoveFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    if (updated.length === 0) {
      handleReset();
    }
  };

  const handleRotatePage = (pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumber ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const handleDeletePage = (pageNumber: number) => {
    if (pages.length <= 1) {
      setErrorMessage('A PDF document must have at least one page.');
      return;
    }
    setPages((prev) => prev.filter((p) => p.pageNumber !== pageNumber));
  };

  const handleToggleSelectPage = (pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p
      )
    );
  };

  const handleSelectAllPages = (selectAll: boolean) => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: selectAll })));
  };

  const handleToggleExcelSheet = (sheetName: string) => {
    setSelectedSheets((prev) => {
      if (prev.includes(sheetName)) {
        if (prev.length <= 1) return prev;
        return prev.filter((s) => s !== sheetName);
      }
      return [...prev, sheetName];
    });
  };

  // --- Interactive Canvas Drag & Drawing Handlers (Annotate & Redact) ---
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setIsDrawing(true);
    setDragStartCoord({ x, y });

    if (tool.id === 'annotate-pdf' && activeAnnotationTool === 'freehand') {
      setFreehandPoints([{ x, y }]);
    } else {
      setCurrentDragRect({ x, y, w: 0, h: 0 });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragStartCoord) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const currentY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (tool.id === 'annotate-pdf' && activeAnnotationTool === 'freehand') {
      setFreehandPoints((prev) => [...prev, { x: currentX, y: currentY }]);
    } else {
      const x = Math.min(dragStartCoord.x, currentX);
      const y = Math.min(dragStartCoord.y, currentY);
      const w = Math.abs(currentX - dragStartCoord.x);
      const h = Math.abs(currentY - dragStartCoord.y);
      setCurrentDragRect({ x, y, w, h });
    }
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing || !dragStartCoord) return;
    setIsDrawing(false);

    if (tool.id === 'annotate-pdf') {
      const newId = `ann_${Date.now()}`;
      if (activeAnnotationTool === 'freehand' && freehandPoints.length > 1) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: newId,
            pageNumber: activeInteractivePage,
            type: 'freehand',
            color: annotationColor,
            strokeWidth: annotationStrokeWidth,
            points: freehandPoints,
          },
        ]);
      } else if (currentDragRect && (currentDragRect.w > 0.01 || currentDragRect.h > 0.01)) {
        if (activeAnnotationTool === 'highlight') {
          setAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: activeInteractivePage,
              type: 'highlight',
              color: annotationColor,
              strokeWidth: 0,
              x: currentDragRect.x,
              y: currentDragRect.y,
              width: currentDragRect.w,
              height: currentDragRect.h,
              opacity: 0.35,
            },
          ]);
        } else if (activeAnnotationTool === 'rectangle') {
          setAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: activeInteractivePage,
              type: 'rectangle',
              color: annotationColor,
              strokeWidth: annotationStrokeWidth,
              x: currentDragRect.x,
              y: currentDragRect.y,
              width: currentDragRect.w,
              height: currentDragRect.h,
            },
          ]);
        } else if (activeAnnotationTool === 'circle') {
          setAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: activeInteractivePage,
              type: 'circle',
              color: annotationColor,
              strokeWidth: annotationStrokeWidth,
              cx: currentDragRect.x + currentDragRect.w / 2,
              cy: currentDragRect.y + currentDragRect.h / 2,
              rx: currentDragRect.w / 2,
              ry: currentDragRect.h / 2,
            },
          ]);
        } else if (activeAnnotationTool === 'arrow' || activeAnnotationTool === 'underline' || activeAnnotationTool === 'strikethrough') {
          setAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: activeInteractivePage,
              type: activeAnnotationTool,
              color: annotationColor,
              strokeWidth: annotationStrokeWidth,
              x1: dragStartCoord.x,
              y1: dragStartCoord.y,
              x2: currentDragRect.x + (dragStartCoord.x === currentDragRect.x ? currentDragRect.w : 0),
              y2: currentDragRect.y + (dragStartCoord.y === currentDragRect.y ? currentDragRect.h : 0),
            },
          ]);
        } else if (activeAnnotationTool === 'text') {
          setAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: activeInteractivePage,
              type: 'text',
              color: annotationColor,
              strokeWidth: 1,
              x: currentDragRect.x,
              y: currentDragRect.y,
              text: annotationTextNote || 'Note',
              fontSize: 14,
            },
          ]);
        }
      }
    }

    setDragStartCoord(null);
    setCurrentDragRect(null);
    setFreehandPoints([]);
  };

  const handleReset = () => {
    if (pdfDoc) {
      pdfDoc.destroy();
    }
    setFiles([]);
    setPdfDoc(null);
    setPageCount(0);
    setPages([]);
    setProcessingState('idle');
    setResult(null);
    setErrorMessage(null);
    setStatusText('Processing document...');
    setProgressDetail(undefined);
    setProtectPassword('');
    setProtectConfirm('');
    setExcelWorkbook(null);
    setExcelSheetNames([]);
    setSelectedSheets([]);
    setActivePreviewSheet('');
    setPptxInspection(null);
    setSelectedPptxSlides([]);
    setExtractedTables([]);
    setTableWarnings([]);
    setAnnotations([]);
    setBlankAnalysis([]);
    setDetectedFormFields([]);
    setFormFieldValues({});
    setDeskewManualAngle(0);
  };

  // Execute PDF / Conversion action via ToolRegistry
  const handleExecute = async () => {
    if (files.length === 0 && tool.id !== 'html-to-pdf' && tool.id !== 'text-to-pdf' && tool.id !== 'markdown-to-pdf') return;
    setErrorMessage(null);
    setProcessingState('processing');

    try {
      const primaryFile =
        files[0] ||
        new File(
          [tool.id === 'html-to-pdf' ? htmlCode : plainOrMdText],
          tool.id === 'markdown-to-pdf' ? 'document.md' : tool.id === 'text-to-pdf' ? 'document.txt' : 'document.html',
          { type: 'text/plain' }
        );
      const baseName = primaryFile.name.replace(/\.[^/.]+$/, '');
      const handler = TOOL_HANDLERS[tool.id];
      if (!handler) {
        throw new Error('Unsupported tool operation.');
      }

      const executionResult = await handler({
        toolId: tool.id,
        files,
        primaryFile,
        baseName,
        setStatusText,
        setProgressDetail: (detail) => setProgressDetail(detail),
        options: {
          pages,
          splitRange,
          globalRotation,
          jpgOrientation,
          jpgMargin,
          pngScale,
          webpQuality,
          htmlCode,
          htmlPageSize,
          htmlOrientation,
          htmlMargin,
          wordOrientation,
          wordMargin,
          selectedSheets,
          excelOrientation,
          excelPageSize,
          excelFitToWidth,
          selectedPptxSlides,
          pdfToWordOcr,
          pdfToWordLang,
          extractedTables,
          excelExportFormat,
          ocrSearchablePdf,
          ocrLanguage,
          pdfToPptxMode,
          pdfToPptxAspect,
          plainOrMdText,
          textPageSize,
          textFontSize,
          grayscaleMode,
          annotations,
          formFieldValues,
          flattenOnSave,
          deskewManualAngle,
          watermarkText,
          watermarkColor,
          watermarkPosition,
          watermarkOpacity,
          watermarkSize,
          pageNumberPosition,
          pageNumberFormat,
          protectPassword,
          protectConfirm,
          bookletPaper,
          bookletMargin,
          bookletGutter,
        },
      });

      setResult(executionResult);
      setProcessingState('completed');
    } catch (err: unknown) {
      console.error('Operation error:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred during processing.';
      setErrorMessage(msg);
      setProcessingState('error');
    }
  };

  return (
    <div className="workspace-container">
      <div className="container">
        {/* Workspace Header */}
        <div className="workspace-header">
          <button type="button" className="workspace-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back to PDF Tools</span>
          </button>
          <div className="workspace-title-row">
            <h1 className="workspace-title">{tool.name}</h1>
          </div>
          <p className="workspace-desc">{tool.description}</p>
        </div>

        {/* Workspace Body */}
        <div className="workspace-content">
          {processingState === 'idle' && (
            <div>
              <FileUpload tool={tool} onFilesSelected={handleFilesSelected} />

              {/* Special quick action for HTML / Text / Markdown to PDF */}
              {tool.id === 'html-to-pdf' && (
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <span className="text-xs text-secondary" style={{ marginRight: '0.5rem' }}>
                    Don't have an HTML file?
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleStartWithHtmlCode}
                  >
                    <Code size={14} />
                    <span>Enter or Paste HTML Code</span>
                  </button>
                </div>
              )}

              {(tool.id === 'text-to-pdf' || tool.id === 'markdown-to-pdf') && (
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <span className="text-xs text-secondary" style={{ marginRight: '0.5rem' }}>
                    Don't have a file handy?
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleStartWithTextOrMd}
                  >
                    <FileText size={14} />
                    <span>Type or Paste {tool.id === 'markdown-to-pdf' ? 'Markdown' : 'Text'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {processingState === 'processing' && (
            <ProcessingView statusText={statusText} progressDetail={progressDetail} />
          )}

          {processingState === 'completed' && result && (
            <CompletedView result={result} onReset={handleReset} />
          )}

          {(processingState === 'configured' || processingState === 'error') && (
            <div className="workspace-configured-layout">
              {/* Left Panel: Preview or File List */}
              <div className="workspace-preview-panel">
                {/* Multi-file list for Merge or JPG/WebP-to-PDF */}
                {(tool.id === 'merge' || tool.id === 'jpg-to-pdf' || tool.id === 'webp-to-pdf') && (
                  <div className="file-list-group">
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                      <span className="form-label">
                        Files to {tool.id === 'merge' ? 'Merge' : 'Convert'} ({files.length})
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => addMoreInputRef.current?.click()}
                      >
                        <Plus size={14} />
                        <span>Add Files</span>
                      </button>
                      <input
                        ref={addMoreInputRef}
                        type="file"
                        accept={tool.acceptedFileTypes}
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleAddMoreFiles}
                      />
                    </div>

                    {files.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="file-list-item">
                        <div className="file-item-left">
                          {tool.id === 'jpg-to-pdf' || tool.id === 'webp-to-pdf' ? (
                            <FileImage size={20} className="file-item-icon" />
                          ) : (
                            <FileText size={20} className="file-item-icon" />
                          )}
                          <div className="file-item-details">
                            <span className="file-item-name">{file.name}</span>
                            <span className="file-item-size">{formatBytes(file.size)}</span>
                          </div>
                        </div>

                        <div className="file-item-actions">
                          <button
                            type="button"
                            className="file-item-btn"
                            disabled={idx === 0}
                            onClick={() => handleMoveFile(idx, 'up')}
                            title="Move up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="file-item-btn"
                            disabled={idx === files.length - 1}
                            onClick={() => handleMoveFile(idx, 'down')}
                            title="Move down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="file-item-btn file-item-delete"
                            onClick={() => handleRemoveFile(idx)}
                            title="Remove file"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* PDF Page Thumbnail Grid for page-selection tools */}
                {pdfDoc &&
                  (tool.id === 'organize' ||
                    tool.id === 'rotate' ||
                    tool.id === 'remove-pages' ||
                    tool.id === 'extract-pages' ||
                    tool.id === 'pdf-to-png' ||
                    tool.id === 'pdf-to-webp' ||
                    tool.id === 'pdf-to-text' ||
                    tool.id === 'pdf-to-word' ||
                    tool.id === 'pdf-to-pptx' ||
                    tool.id === 'grayscale-pdf' ||
                    tool.id === 'remove-blank-pages') && (
                    <div>
                      <div
                        className="flex items-center justify-between"
                        style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}
                      >
                        <span className="form-label">
                          Pages ({pageCount})
                          {tool.id === 'remove-blank-pages' &&
                            ` — Detected ${blankAnalysis.filter((b) => b.isBlank).length} blank page(s) marked for removal`}
                          {(tool.id === 'pdf-to-png' ||
                            tool.id === 'pdf-to-webp' ||
                            tool.id === 'pdf-to-text' ||
                            tool.id === 'pdf-to-word' ||
                            tool.id === 'pdf-to-pptx') &&
                            ` — Processing ${pages.filter((p) => p.selected).length} of ${pageCount} pages`}
                        </span>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectAllPages(true)}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectAllPages(false)}
                          >
                            Clear Selection
                          </button>
                        </div>
                      </div>

                      <div className="pages-grid">
                        {pages.map((p) => {
                          const blankInfo = blankAnalysis.find((b) => b.pageNumber === p.pageNumber);
                          const badge =
                            tool.id === 'remove-blank-pages' && blankInfo
                              ? {
                                  text: blankInfo.isBlank ? `Blank (${blankInfo.inkPercentage}%)` : 'Content',
                                  variant: (blankInfo.isBlank ? 'blank' : 'primary') as 'blank' | 'primary',
                                }
                              : undefined;

                          return (
                            <PDFPageThumbnail
                              key={p.pageNumber}
                              pdfDoc={pdfDoc}
                              pageNumber={p.pageNumber}
                              rotation={p.rotation + (tool.id === 'rotate' ? globalRotation : 0)}
                              selected={p.selected}
                              badge={badge}
                              selectable={
                                tool.id === 'remove-pages' ||
                                tool.id === 'extract-pages' ||
                                tool.id === 'pdf-to-png' ||
                                tool.id === 'pdf-to-webp' ||
                                tool.id === 'pdf-to-text' ||
                                tool.id === 'remove-blank-pages'
                              }
                              showRotate={tool.id === 'organize'}
                              showDelete={tool.id === 'organize'}
                              onSelect={handleToggleSelectPage}
                              onRotate={handleRotatePage}
                              onDelete={handleDeletePage}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Interactive Overlay Workspace for Annotate & Deskew */}
                {pdfDoc && (tool.id === 'annotate-pdf' || tool.id === 'deskew-pdf') && (
                  <div>
                    {/* Navigation Bar for Active Page */}
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                      <span className="form-label">
                        {tool.id === 'annotate-pdf' && 'Draw & Annotate Directly on Page'}
                        {tool.id === 'deskew-pdf' && 'Page Alignment Preview'}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={activeInteractivePage <= 1}
                          onClick={() => setActiveInteractivePage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#3c4043' }}>
                          Page {activeInteractivePage} of {pageCount}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={activeInteractivePage >= pageCount}
                          onClick={() => setActiveInteractivePage((p) => Math.min(pageCount, p + 1))}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Annotation Toolbar */}
                    {tool.id === 'annotate-pdf' && (
                      <div className="annotation-toolbar">
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'highlight' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('highlight')}
                        >
                          <Highlighter size={14} />
                          <span>Highlight</span>
                        </button>
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'freehand' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('freehand')}
                        >
                          <PenTool size={14} />
                          <span>Pen</span>
                        </button>
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'arrow' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('arrow')}
                        >
                          <ArrowRight size={14} />
                          <span>Arrow</span>
                        </button>
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'rectangle' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('rectangle')}
                        >
                          <Square size={14} />
                          <span>Rectangle</span>
                        </button>
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'circle' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('circle')}
                        >
                          <CircleIcon size={14} />
                          <span>Circle</span>
                        </button>
                        <button
                          type="button"
                          className={`annotation-tool-btn ${activeAnnotationTool === 'text' ? 'active' : ''}`}
                          onClick={() => setActiveAnnotationTool('text')}
                        >
                          <Type size={14} />
                          <span>Text Note</span>
                        </button>

                        <div className="color-dots-group" style={{ marginLeft: 'auto' }}>
                          {['#fbbc04', '#ea4335', '#1a73e8', '#34a853', '#202124'].map((col) => (
                            <button
                              key={col}
                              type="button"
                              className={`color-dot ${annotationColor === col ? 'active' : ''}`}
                              style={{ backgroundColor: col }}
                              onClick={() => setAnnotationColor(col)}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="annotation-tool-btn"
                          onClick={() => setAnnotations((prev) => prev.slice(0, -1))}
                          disabled={annotations.length === 0}
                          title="Undo last annotation"
                        >
                          <Undo2 size={14} />
                        </button>
                      </div>
                    )}

                    {/* Interactive Canvas Stage */}
                    <div className="interactive-canvas-outer">
                      <div
                        className="interactive-canvas-wrapper"
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                      >
                        <canvas
                          ref={interactiveCanvasRef}
                          style={{
                            display: 'block',
                            maxWidth: '100%',
                            transform:
                              tool.id === 'deskew-pdf' ? `rotate(${deskewManualAngle}deg)` : 'none',
                            transition: 'transform 0.1s ease-out',
                          }}
                        />

                        {/* Annotations SVG overlay for this active page */}
                        {tool.id === 'annotate-pdf' && (
                          <svg className="annotation-svg-overlay">
                            {annotations
                              .filter((a) => a.pageNumber === activeInteractivePage)
                              .map((a) => {
                                if (a.type === 'highlight') {
                                  return (
                                    <rect
                                      key={a.id}
                                      x={`${a.x * 100}%`}
                                      y={`${a.y * 100}%`}
                                      width={`${a.width * 100}%`}
                                      height={`${a.height * 100}%`}
                                      fill={a.color}
                                      opacity={a.opacity ?? 0.35}
                                    />
                                  );
                                } else if (a.type === 'rectangle') {
                                  return (
                                    <rect
                                      key={a.id}
                                      x={`${a.x * 100}%`}
                                      y={`${a.y * 100}%`}
                                      width={`${a.width * 100}%`}
                                      height={`${a.height * 100}%`}
                                      fill="none"
                                      stroke={a.color}
                                      strokeWidth={a.strokeWidth}
                                    />
                                  );
                                } else if (a.type === 'circle') {
                                  return (
                                    <ellipse
                                      key={a.id}
                                      cx={`${a.cx * 100}%`}
                                      cy={`${a.cy * 100}%`}
                                      rx={`${a.rx * 100}%`}
                                      ry={`${a.ry * 100}%`}
                                      fill="none"
                                      stroke={a.color}
                                      strokeWidth={a.strokeWidth}
                                    />
                                  );
                                } else if (a.type === 'freehand') {
                                  const d = a.points
                                    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x * 100}% ${p.y * 100}%`)
                                    .join(' ');
                                  return (
                                    <path
                                      key={a.id}
                                      d={d}
                                      fill="none"
                                      stroke={a.color}
                                      strokeWidth={a.strokeWidth}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  );
                                } else if (a.type === 'text') {
                                  return (
                                    <text
                                      key={a.id}
                                      x={`${a.x * 100}%`}
                                      y={`${a.y * 100}%`}
                                      fill={a.color}
                                      fontSize="14"
                                      fontWeight="bold"
                                    >
                                      {a.text}
                                    </text>
                                  );
                                } else if (a.type === 'arrow') {
                                  return (
                                    <line
                                      key={a.id}
                                      x1={`${a.x1 * 100}%`}
                                      y1={`${a.y1 * 100}%`}
                                      x2={`${a.x2 * 100}%`}
                                      y2={`${a.y2 * 100}%`}
                                      stroke={a.color}
                                      strokeWidth={a.strokeWidth}
                                    />
                                  );
                                }
                                return null;
                              })}
                          </svg>
                        )}

                        {/* Live active drag rectangle */}
                        {isDrawing && currentDragRect && (
                          <div
                            style={{
                              position: 'absolute',
                              left: `${currentDragRect.x * 100}%`,
                              top: `${currentDragRect.y * 100}%`,
                              width: `${currentDragRect.w * 100}%`,
                              height: `${currentDragRect.h * 100}%`,
                              backgroundColor:
                                activeAnnotationTool === 'highlight'
                                  ? 'rgba(251, 188, 4, 0.4)'
                                  : 'transparent',
                              border: '1px dashed #1a73e8',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fill Forms Interactive Fields List */}
                {pdfDoc && tool.id === 'fill-forms' && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                      <span className="form-label">
                        Interactive Form Fields ({detectedFormFields.length})
                      </span>
                    </div>

                    {isXfaForm && (
                      <div className="conversion-hint-box" style={{ marginBottom: '1rem' }}>
                        <Info size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        <span>
                          Notice: Dynamic Adobe XFA forms use proprietary XML packaging. Standard AcroForm fields are fully supported.
                        </span>
                      </div>
                    )}

                    {detectedFormFields.length === 0 ? (
                      <div className="conversion-hint-box">
                        No interactive AcroForm fields were detected in this PDF.
                      </div>
                    ) : (
                      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                        {detectedFormFields.map((field) => (
                          <div key={field.name} className="form-field-card">
                            <div className="form-field-card-header">
                              <span className="form-field-name">{field.name}</span>
                              <span className="form-field-type-badge">{field.type}</span>
                            </div>

                            {field.type === 'text' && (
                              <input
                                type="text"
                                className="form-input"
                                value={(formFieldValues[field.name] as string) || ''}
                                onChange={(e) =>
                                  setFormFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                                }
                              />
                            )}

                            {field.type === 'checkbox' && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!formFieldValues[field.name]}
                                  onChange={(e) =>
                                    setFormFieldValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                                  }
                                />
                                <span className="text-sm">Checked</span>
                              </label>
                            )}

                            {field.type === 'dropdown' && field.options && (
                              <select
                                className="form-select"
                                value={(formFieldValues[field.name] as string) || ''}
                                onChange={(e) =>
                                  setFormFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                                }
                              >
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            )}

                            {field.type === 'radio' && field.options && (
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {field.options.map((opt) => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                      type="radio"
                                      name={field.name}
                                      value={opt}
                                      checked={formFieldValues[field.name] === opt}
                                      onChange={() =>
                                        setFormFieldValues((prev) => ({ ...prev, [field.name]: opt }))
                                      }
                                    />
                                    <span className="text-sm">{opt}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Booklet Maker Imposition Plan */}
                {pdfDoc && tool.id === 'booklet-maker' && (
                  <div>
                    <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Booklet Saddle-Stitch Layout ({pageCount} Source Pages → {Math.ceil(pageCount / 4)} Printed Sheets)
                    </span>
                    <div className="doc-preview-box">
                      {calculateBookletLayout(pageCount).map((slot, sIdx) => (
                        <div
                          key={sIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: '1px solid #e8eaed',
                            fontSize: '13px',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: '#1a73e8' }}>
                            Sheet {slot.sheetIndex} ({slot.side.toUpperCase()})
                          </span>
                          <span style={{ color: '#202124' }}>
                            Left: Page {slot.leftPageNum ?? 'Blank'} • Right: Page {slot.rightPageNum ?? 'Blank'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Single file PDF preview thumbnail for Watermark, Page-numbers, PDF to JPG, Protect, Split, Flatten */}
                {pdfDoc &&
                  (tool.id === 'watermark' ||
                    tool.id === 'page-numbers' ||
                    tool.id === 'pdf-to-jpg' ||
                    tool.id === 'protect' ||
                    tool.id === 'split' ||
                    tool.id === 'flatten-pdf') && (
                    <div className="file-list-group">
                      <div className="file-list-item">
                        <div className="file-item-left">
                          <FileText size={20} className="file-item-icon" />
                          <div className="file-item-details">
                            <span className="file-item-name">{files[0]?.name}</span>
                            <span className="file-item-size">
                              {formatBytes(files[0]?.size || 0)} • {pageCount}{' '}
                              {pageCount === 1 ? 'page' : 'pages'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="file-item-btn file-item-delete"
                          onClick={handleReset}
                          title="Change file"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div style={{ maxWidth: '240px', margin: '1rem auto' }}>
                        <PDFPageThumbnail pdfDoc={pdfDoc} pageNumber={1} rotation={0} />
                        <p
                          className="text-xs text-secondary text-center"
                          style={{ marginTop: '0.5rem', textAlign: 'center' }}
                        >
                          Preview: Page 1 of {pageCount}
                        </p>
                      </div>
                    </div>
                  )}

                {/* HTML to PDF: Code Editor and Live Sandboxed Preview */}
                {tool.id === 'html-to-pdf' && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                      <span className="form-label">HTML Content</span>
                      <div className="options-pill-group" style={{ marginBottom: 0 }}>
                        <button
                          type="button"
                          className={`options-pill ${htmlInputMode === 'code' ? 'active' : ''}`}
                          onClick={() => setHtmlInputMode('code')}
                        >
                          Editor
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${htmlInputMode === 'file' ? 'active' : ''}`}
                          onClick={() => setHtmlInputMode('file')}
                        >
                          Live Preview
                        </button>
                      </div>
                    </div>

                    {htmlInputMode === 'code' ? (
                      <textarea
                        className="html-editor-textarea"
                        value={htmlCode}
                        onChange={(e) => setHtmlCode(e.target.value)}
                        placeholder="Enter or paste HTML here..."
                        spellCheck={false}
                      />
                    ) : (
                      <div
                        className="doc-preview-box"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlCode) }}
                      />
                    )}

                    <div className="conversion-hint-box">
                      <span style={{ fontWeight: 600 }}>Security Note:</span> HTML is strictly
                      sanitized client-side with DOMPurify. Scripts and unsafe iframe embeds are
                      safely removed before rendering to PDF.
                    </div>
                  </div>
                )}

                {/* Word to PDF: Live Document Preview */}
                {tool.id === 'word-to-pdf' && (
                  <div>
                    <div className="file-list-item" style={{ marginBottom: '1rem' }}>
                      <div className="file-item-left">
                        <FileText size={20} className="file-item-icon" />
                        <div className="file-item-details">
                          <span className="file-item-name">{files[0]?.name}</span>
                          <span className="file-item-size">{formatBytes(files[0]?.size || 0)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="file-item-btn file-item-delete"
                        onClick={handleReset}
                        title="Change file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Document Preview
                    </span>
                    <div ref={wordPreviewRef} className="doc-preview-box" />

                    <div className="conversion-hint-box">
                      <Info size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      <span>
                        Converts standard paragraphs, headings, bullet lists, tables, and images.
                        Complex Word macros or specialized vector SmartArt may render with simplified styling.
                      </span>
                    </div>
                  </div>
                )}

                {/* Excel to PDF: Worksheet Selector and Table Preview */}
                {tool.id === 'excel-to-pdf' && excelWorkbook && (
                  <div>
                    <div className="file-list-item" style={{ marginBottom: '1rem' }}>
                      <div className="file-item-left">
                        <TableIcon size={20} className="file-item-icon" />
                        <div className="file-item-details">
                          <span className="file-item-name">{files[0]?.name}</span>
                          <span className="file-item-size">
                            {formatBytes(files[0]?.size || 0)} • {excelSheetNames.length} worksheets
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="file-item-btn file-item-delete"
                        onClick={handleReset}
                        title="Change file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Select Worksheets to Include
                    </span>
                    <div className="sheet-tab-list">
                      {excelSheetNames.map((sheet) => (
                        <button
                          key={sheet}
                          type="button"
                          className={`sheet-tab-btn ${selectedSheets.includes(sheet) ? 'active' : ''}`}
                          onClick={() => handleToggleExcelSheet(sheet)}
                        >
                          {selectedSheets.includes(sheet) && <Check size={12} style={{ marginRight: '4px' }} />}
                          {sheet}
                        </button>
                      ))}
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                        <span className="form-label">Previewing: {activePreviewSheet || excelSheetNames[0]}</span>
                        {excelSheetNames.length > 1 && (
                          <select
                            className="form-select"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                            value={activePreviewSheet}
                            onChange={(e) => setActivePreviewSheet(e.target.value)}
                          >
                            {excelSheetNames.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div
                        className="doc-preview-box"
                        dangerouslySetInnerHTML={{
                          __html: getSheetHtmlTable(
                            excelWorkbook,
                            activePreviewSheet || excelSheetNames[0] || '',
                            excelFitToWidth
                          ),
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* PowerPoint to PDF: Presentation Inspection & Slide List */}
                {tool.id === 'powerpoint-to-pdf' && pptxInspection && (
                  <div>
                    <div className="file-list-item" style={{ marginBottom: '1rem' }}>
                      <div className="file-item-left">
                        <Presentation size={20} className="file-item-icon" />
                        <div className="file-item-details">
                          <span className="file-item-name">{files[0]?.name}</span>
                          <span className="file-item-size">
                            {formatBytes(files[0]?.size || 0)} • {selectedPptxSlides.length} of {pptxInspection.slideCount} slides selected
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="file-item-btn file-item-delete"
                        onClick={handleReset}
                        title="Change file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {pptxInspection.unsupportedWarnings.length > 0 && (
                      <div className="conversion-hint-box" style={{ marginBottom: '1rem', backgroundColor: '#fef7e0', borderColor: '#feefc3', color: '#b06000' }}>
                        <strong>Presentation Notes:</strong>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                          {pptxInspection.unsupportedWarnings.map((w, wi) => (
                            <li key={wi}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Select Presentation Slides ({pptxInspection.slideCount})
                    </span>

                    <div className="doc-preview-box">
                      {pptxInspection.slides.map((s) => {
                        const checked = selectedPptxSlides.includes(s.slideNumber);
                        return (
                          <label
                            key={s.slideNumber}
                            style={{
                              padding: '12px',
                              borderBottom: '1px solid #e8eaed',
                              display: 'flex',
                              gap: '12px',
                              alignItems: 'flex-start',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPptxSlides((prev) => [...prev, s.slideNumber].sort((a, b) => a - b));
                                } else {
                                  setSelectedPptxSlides((prev) => prev.filter((n) => n !== s.slideNumber));
                                }
                              }}
                            />
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#1a73e8',
                                fontSize: '13px',
                                minWidth: '55px',
                              }}
                            >
                              Slide {s.slideNumber}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, color: '#202124', fontSize: '14px' }}>
                                {s.title}
                              </div>
                              <div style={{ color: '#5f6368', fontSize: '12px', marginTop: '4px' }}>
                                {s.paragraphs.length} paragraph(s) • {s.imageUrls.length} image(s)
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PDF to Excel / CSV: Editable Extracted Tables Preview */}
                {tool.id === 'pdf-to-excel' && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                      <span className="form-label">
                        Extracted Tables ({extractedTables.length}) — Click any cell to edit manually
                      </span>
                    </div>

                    {tableWarnings.length > 0 && (
                      <div className="conversion-hint-box" style={{ marginBottom: '1rem', backgroundColor: '#fef7e0', borderColor: '#feefc3', color: '#b06000' }}>
                        {tableWarnings.map((w, idx) => (
                          <div key={idx}>{w}</div>
                        ))}
                      </div>
                    )}

                    {isExtractingTables ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#5f6368' }}>
                        Scanning document coordinates for tables...
                      </div>
                    ) : extractedTables.length === 0 ? (
                      <div className="conversion-hint-box">
                        No structured tables detected yet. Click Export Spreadsheet to attempt full-document table extraction, or enable OCR fallback for scanned tables.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {extractedTables.map((tbl, tblIdx) => (
                          <div key={tbl.id} className="doc-preview-box" style={{ overflowX: 'auto' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: '#1a73e8' }}>
                              {tbl.title} ({tbl.source === 'ocr' ? 'OCR Extraction' : 'Digital Text'})
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <tbody>
                                {tbl.rows.map((row, rIdx) => {
                                  const isLowConf = tbl.lowConfidenceRows.includes(rIdx);
                                  return (
                                    <tr
                                      key={rIdx}
                                      style={{ backgroundColor: isLowConf ? '#fef7e0' : 'transparent' }}
                                      title={isLowConf ? 'Low-confidence extraction row — verify manually' : undefined}
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} style={{ border: '1px solid #dadce0', padding: '2px' }}>
                                          <input
                                            type="text"
                                            value={cell}
                                            aria-label={`Table ${tblIdx + 1} row ${rIdx + 1} column ${cIdx + 1}`}
                                            style={{
                                              width: '100%',
                                              border: 'none',
                                              background: 'transparent',
                                              padding: '4px 6px',
                                              fontSize: '12px',
                                            }}
                                            onChange={(e) => {
                                              const nextVal = e.target.value;
                                              setExtractedTables((prev) =>
                                                prev.map((t, ti) =>
                                                  ti !== tblIdx
                                                    ? t
                                                    : {
                                                        ...t,
                                                        rows: t.rows.map((r, ri) =>
                                                          ri !== rIdx
                                                            ? r
                                                            : r.map((cv, ci) => (ci === cIdx ? nextVal : cv))
                                                        ),
                                                      }
                                                )
                                              );
                                            }}
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Text / Markdown to PDF: Editor */}
                {(tool.id === 'text-to-pdf' || tool.id === 'markdown-to-pdf') && (
                  <div>
                    <span className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      {tool.id === 'markdown-to-pdf' ? 'Markdown Source' : 'Plain Text Content'}
                    </span>
                    <textarea
                      className="html-editor-textarea"
                      value={plainOrMdText}
                      onChange={(e) => setPlainOrMdText(e.target.value)}
                      placeholder="Enter or paste content..."
                      aria-label={tool.id === 'markdown-to-pdf' ? 'Markdown source editor' : 'Plain text editor'}
                    />
                    <div className="conversion-hint-box">
                      Generates crisp, lightweight vector PDF text locally using standard fonts.
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="workspace-error-box" role="alert">
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Right Sidebar: Configuration & Primary Action */}
              <div className="workspace-sidebar-panel">
                <h3 className="sidebar-heading">Configuration</h3>

                {/* Annotate PDF Configuration */}
                {tool.id === 'annotate-pdf' && (
                  <>
                    <div className="form-group">
                      <span className="form-label">Active Tool: {activeAnnotationTool}</span>
                      <p className="text-xs text-secondary">
                        Total annotations added: {annotations.length}
                      </p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Line Thickness</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${annotationStrokeWidth === 1 ? 'active' : ''}`}
                          onClick={() => setAnnotationStrokeWidth(1)}
                        >
                          Thin (1px)
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${annotationStrokeWidth === 3 ? 'active' : ''}`}
                          onClick={() => setAnnotationStrokeWidth(3)}
                        >
                          Medium (3px)
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${annotationStrokeWidth === 5 ? 'active' : ''}`}
                          onClick={() => setAnnotationStrokeWidth(5)}
                        >
                          Thick (5px)
                        </button>
                      </div>
                    </div>

                    {activeAnnotationTool === 'text' && (
                      <div className="form-group">
                        <label className="form-label">Note Content</label>
                        <input
                          type="text"
                          className="form-input"
                          value={annotationTextNote}
                          onChange={(e) => setAnnotationTextNote(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Grayscale PDF Configuration */}
                {tool.id === 'grayscale-pdf' && (
                  <div className="form-group">
                    <label className="form-label">Conversion Mode</label>
                    <div className="options-pill-group">
                      <button
                        type="button"
                        className={`options-pill ${grayscaleMode === 'standard' ? 'active' : ''}`}
                        onClick={() => setGrayscaleMode('standard')}
                      >
                        Standard Balanced
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${grayscaleMode === 'high-contrast' ? 'active' : ''}`}
                        onClick={() => setGrayscaleMode('high-contrast')}
                      >
                        High Contrast
                      </button>
                    </div>
                    <span className="form-hint">
                      Converts all colors to Rec. 709 monochrome luminance for clean printer output.
                    </span>
                  </div>
                )}

                {/* Remove Blank Pages Configuration */}
                {tool.id === 'remove-blank-pages' && (
                  <div className="form-group">
                    <label className="form-label">Detection Threshold</label>
                    <div className="options-pill-group">
                      <button
                        type="button"
                        className={`options-pill ${blankSensitivity === 0.05 ? 'active' : ''}`}
                        onClick={() => setBlankSensitivity(0.05)}
                      >
                        Strict (0.05%)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${blankSensitivity === 0.1 ? 'active' : ''}`}
                        onClick={() => setBlankSensitivity(0.1)}
                      >
                        Standard (0.1%)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${blankSensitivity === 0.2 ? 'active' : ''}`}
                        onClick={() => setBlankSensitivity(0.2)}
                      >
                        Relaxed (0.2%)
                      </button>
                    </div>
                    <span className="form-hint">
                      Review detected blank pages on the left before confirming removal.
                    </span>
                  </div>
                )}

                {/* Booklet Maker Configuration */}
                {tool.id === 'booklet-maker' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Paper Size</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${bookletPaper === 'a4' ? 'active' : ''}`}
                          onClick={() => setBookletPaper('a4')}
                        >
                          A4 Landscape
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${bookletPaper === 'a3' ? 'active' : ''}`}
                          onClick={() => setBookletPaper('a3')}
                        >
                          A3 Landscape
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Folding Gutter</label>
                      <select
                        className="form-select"
                        value={bookletGutter}
                        onChange={(e) => setBookletGutter(parseInt(e.target.value, 10))}
                      >
                        <option value={0}>None (0 pt)</option>
                        <option value={10}>Standard (10 pt)</option>
                        <option value={20}>Wide (20 pt)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Page Margins</label>
                      <select
                        className="form-select"
                        value={bookletMargin}
                        onChange={(e) => setBookletMargin(parseInt(e.target.value, 10))}
                      >
                        <option value={10}>Compact (10 pt)</option>
                        <option value={15}>Normal (15 pt)</option>
                        <option value={25}>Spacious (25 pt)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Fill Forms Configuration */}
                {tool.id === 'fill-forms' && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={flattenOnSave}
                        onChange={(e) => setFlattenOnSave(e.target.checked)}
                      />
                      <span className="text-sm font-medium">Flatten Form Fields on Save</span>
                    </label>
                    <span className="form-hint">
                      Locks form values into permanent artwork so they cannot be altered.
                    </span>
                  </div>
                )}

                {/* Deskew Configuration */}
                {tool.id === 'deskew-pdf' && (
                  <div className="form-group">
                    <label className="form-label">Tilt Correction Angle</label>
                    <div className="deskew-slider-box">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-secondary">Angle:</span>
                        <span style={{ fontWeight: 700, color: '#1a73e8', fontSize: '13px' }}>
                          {deskewManualAngle > 0 ? `+${deskewManualAngle.toFixed(1)}` : deskewManualAngle.toFixed(1)}°
                        </span>
                      </div>
                      <input
                        type="range"
                        className="deskew-slider"
                        min="-10"
                        max="10"
                        step="0.5"
                        value={deskewManualAngle}
                        onChange={(e) => setDeskewManualAngle(parseFloat(e.target.value))}
                      />
                      {deskewDetectedAngle !== 0 && (
                        <span className="text-xs text-secondary">
                          Auto-Detected Skew: {deskewDetectedAngle > 0 ? `+${deskewDetectedAngle.toFixed(1)}` : deskewDetectedAngle.toFixed(1)}°
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Flatten PDF Note */}
                {tool.id === 'flatten-pdf' && (
                  <div className="conversion-hint-box">
                    <Info size={14} style={{ display: 'inline', marginRight: '4px' }} />
                    <span>
                      Flattens all interactive form fields and annotations into static document artwork.
                    </span>
                  </div>
                )}

                {/* PDF to Text Info */}
                {tool.id === 'pdf-to-text' && (
                  <div className="form-group">
                    <span className="form-label">Digital Text Extraction</span>
                    <p className="text-xs text-secondary">
                      Extracts readable text from digitally generated documents. For scanned documents or images, use the OCR PDF tool.
                    </p>
                  </div>
                )}

                {/* PDF to PNG Configuration */}
                {tool.id === 'pdf-to-png' && (
                  <div className="form-group">
                    <label className="form-label">Resolution / Quality</label>
                    <div className="options-pill-group">
                      <button
                        type="button"
                        className={`options-pill ${pngScale === 1 ? 'active' : ''}`}
                        onClick={() => setPngScale(1)}
                      >
                        Standard (1x)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${pngScale === 1.5 ? 'active' : ''}`}
                        onClick={() => setPngScale(1.5)}
                      >
                        Crisp (1.5x)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${pngScale === 2 ? 'active' : ''}`}
                        onClick={() => setPngScale(2)}
                      >
                        Ultra HD (2x)
                      </button>
                    </div>
                  </div>
                )}

                {/* PDF to WebP Configuration */}
                {tool.id === 'pdf-to-webp' && (
                  <div className="form-group">
                    <label className="form-label">WebP Compression Quality</label>
                    <div className="options-pill-group">
                      <button
                        type="button"
                        className={`options-pill ${webpQuality === 0.7 ? 'active' : ''}`}
                        onClick={() => setWebpQuality(0.7)}
                      >
                        Compact (70%)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${webpQuality === 0.85 ? 'active' : ''}`}
                        onClick={() => setWebpQuality(0.85)}
                      >
                        Balanced (85%)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${webpQuality === 0.95 ? 'active' : ''}`}
                        onClick={() => setWebpQuality(0.95)}
                      >
                        Maximum (95%)
                      </button>
                    </div>
                  </div>
                )}

                {/* HTML to PDF Configuration */}
                {tool.id === 'html-to-pdf' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Page Size</label>
                      <select
                        className="form-select"
                        value={htmlPageSize}
                        onChange={(e) => setHtmlPageSize(e.target.value as HtmlPageSize)}
                      >
                        <option value="a4">A4 (210 × 297 mm)</option>
                        <option value="a3">A3 (297 × 420 mm)</option>
                        <option value="letter">Letter (8.5 × 11 in)</option>
                        <option value="legal">Legal (8.5 × 14 in)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Orientation</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${htmlOrientation === 'portrait' ? 'active' : ''}`}
                          onClick={() => setHtmlOrientation('portrait')}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${htmlOrientation === 'landscape' ? 'active' : ''}`}
                          onClick={() => setHtmlOrientation('landscape')}
                        >
                          Landscape
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Margin</label>
                      <select
                        className="form-select"
                        value={htmlMargin}
                        onChange={(e) => setHtmlMargin(parseInt(e.target.value, 10))}
                      >
                        <option value={0}>None (0 pt)</option>
                        <option value={10}>Small (10 pt)</option>
                        <option value={20}>Standard (20 pt)</option>
                        <option value={36}>Spacious (36 pt)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Word to PDF Configuration */}
                {tool.id === 'word-to-pdf' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Page Orientation</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${wordOrientation === 'portrait' ? 'active' : ''}`}
                          onClick={() => setWordOrientation('portrait')}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${wordOrientation === 'landscape' ? 'active' : ''}`}
                          onClick={() => setWordOrientation('landscape')}
                        >
                          Landscape
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Margin</label>
                      <select
                        className="form-select"
                        value={wordMargin}
                        onChange={(e) => setWordMargin(parseInt(e.target.value, 10))}
                      >
                        <option value={10}>Compact (10 pt)</option>
                        <option value={20}>Standard (20 pt)</option>
                        <option value={36}>Wide (36 pt)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Excel to PDF Configuration */}
                {tool.id === 'excel-to-pdf' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Page Orientation</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${excelOrientation === 'landscape' ? 'active' : ''}`}
                          onClick={() => setExcelOrientation('landscape')}
                        >
                          Landscape (Recommended)
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${excelOrientation === 'portrait' ? 'active' : ''}`}
                          onClick={() => setExcelOrientation('portrait')}
                        >
                          Portrait
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Paper Size</label>
                      <select
                        className="form-select"
                        value={excelPageSize}
                        onChange={(e) => setExcelPageSize(e.target.value as 'a4' | 'letter')}
                      >
                        <option value="a4">A4 (210 × 297 mm)</option>
                        <option value="letter">US Letter (8.5 × 11 in)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Scale to Fit</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${excelFitToWidth ? 'active' : ''}`}
                          onClick={() => setExcelFitToWidth(true)}
                        >
                          Fit to Page Width
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${!excelFitToWidth ? 'active' : ''}`}
                          onClick={() => setExcelFitToWidth(false)}
                        >
                          Actual Size
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Split Configuration */}
                {tool.id === 'split' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="split-range-input">
                      Page Ranges to Extract
                    </label>
                    <input
                      id="split-range-input"
                      type="text"
                      className="form-input"
                      placeholder={`e.g. 1-2, 4 (Total: ${pageCount} pages)`}
                      value={splitRange}
                      onChange={(e) => setSplitRange(e.target.value)}
                    />
                  </div>
                )}

                {/* Rotate Configuration */}
                {tool.id === 'rotate' && (
                  <div className="form-group">
                    <label className="form-label">Rotation Angle</label>
                    <div className="options-pill-group">
                      <button
                        type="button"
                        className={`options-pill ${globalRotation === 90 ? 'active' : ''}`}
                        onClick={() => setGlobalRotation(90)}
                      >
                        +90° (Right)
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${globalRotation === 180 ? 'active' : ''}`}
                        onClick={() => setGlobalRotation(180)}
                      >
                        180°
                      </button>
                      <button
                        type="button"
                        className={`options-pill ${globalRotation === 270 ? 'active' : ''}`}
                        onClick={() => setGlobalRotation(270)}
                      >
                        +270° (Left)
                      </button>
                    </div>
                  </div>
                )}

                {/* JPG / WebP to PDF Configuration */}
                {(tool.id === 'jpg-to-pdf' || tool.id === 'webp-to-pdf') && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Page Orientation</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${jpgOrientation === 'portrait' ? 'active' : ''}`}
                          onClick={() => setJpgOrientation('portrait')}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${jpgOrientation === 'landscape' ? 'active' : ''}`}
                          onClick={() => setJpgOrientation('landscape')}
                        >
                          Landscape
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${jpgOrientation === 'fit' ? 'active' : ''}`}
                          onClick={() => setJpgOrientation('fit')}
                        >
                          Fit Image
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Margin</label>
                      <select
                        className="form-select"
                        value={jpgMargin}
                        onChange={(e) => setJpgMargin(parseInt(e.target.value, 10))}
                      >
                        <option value={0}>No Margin (0 pt)</option>
                        <option value={20}>Standard (20 pt)</option>
                        <option value={40}>Spacious (40 pt)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* PDF to Word Configuration */}
                {tool.id === 'pdf-to-word' && (
                  <>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={pdfToWordOcr}
                          onChange={(e) => setPdfToWordOcr(e.target.checked)}
                        />
                        <span className="form-label" style={{ marginBottom: 0 }}>
                          OCR Fallback for Scanned Pages
                        </span>
                      </label>
                    </div>
                    {pdfToWordOcr && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="pdf-word-ocr-lang">OCR Language</label>
                        <select
                          id="pdf-word-ocr-lang"
                          className="form-select"
                          value={pdfToWordLang}
                          onChange={(e) => setPdfToWordLang(e.target.value as any)}
                        >
                          <option value="eng">English</option>
                          <option value="hin">Hindi</option>
                          <option value="spa">Spanish</option>
                          <option value="fra">French</option>
                          <option value="deu">German</option>
                        </select>
                      </div>
                    )}
                    <div className="conversion-hint-box">
                      Reconstructs editable DOCX headings, paragraphs, detected tables, and links. Intricate graphic layouts are simplified.
                    </div>
                  </>
                )}

                {/* PDF to Excel / CSV Configuration */}
                {tool.id === 'pdf-to-excel' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="excel-export-format">Export Format</label>
                      <select
                        id="excel-export-format"
                        className="form-select"
                        value={excelExportFormat}
                        onChange={(e) => setExcelExportFormat(e.target.value as 'xlsx' | 'csv')}
                      >
                        <option value="xlsx">Excel Workbook (.xlsx)</option>
                        <option value="csv">Comma-Separated (.csv)</option>
                      </select>
                    </div>
                    <div className="conversion-hint-box">
                      Click cells in the preview table to fix formatting before exporting. Rows highlighted in amber indicate low extraction confidence.
                    </div>
                  </>
                )}

                {/* PDF to PowerPoint Configuration */}
                {tool.id === 'pdf-to-pptx' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="pptx-conversion-mode">Slide Mode</label>
                      <select
                        id="pptx-conversion-mode"
                        className="form-select"
                        value={pdfToPptxMode}
                        onChange={(e) => setPdfToPptxMode(e.target.value as PptxConversionMode)}
                      >
                        <option value="image-slides">High-Quality Image Slides (Exact Layout)</option>
                        <option value="editable">Editable Text Reconstruction (Beta)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="pptx-aspect-ratio">Aspect Ratio</label>
                      <select
                        id="pptx-aspect-ratio"
                        className="form-select"
                        value={pdfToPptxAspect}
                        onChange={(e) => setPdfToPptxAspect(e.target.value as PptxAspectRatio)}
                      >
                        <option value="16:9">Widescreen (16:9)</option>
                        <option value="4:3">Standard (4:3)</option>
                        <option value="original">Original PDF Aspect</option>
                      </select>
                    </div>
                    <div className="conversion-hint-box">
                      {pdfToPptxMode === 'image-slides'
                        ? 'Image Slides preserve exact appearance; slide text will be flattened into slide images.'
                        : 'Editable mode extracts positioned text into PowerPoint text boxes; custom graphics and font metrics are simplified.'}
                    </div>
                  </>
                )}

                {/* Text / Markdown to PDF Configuration */}
                {(tool.id === 'text-to-pdf' || tool.id === 'markdown-to-pdf') && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="text-pdf-pagesize">Page Size</label>
                      <select
                        id="text-pdf-pagesize"
                        className="form-select"
                        value={textPageSize}
                        onChange={(e) => setTextPageSize(e.target.value as 'a4' | 'letter')}
                      >
                        <option value="a4">A4 (210 × 297 mm)</option>
                        <option value="letter">Letter (8.5 × 11 in)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="text-pdf-fontsize">Base Font Size ({textFontSize} pt)</label>
                      <input
                        id="text-pdf-fontsize"
                        type="range"
                        min={9}
                        max={16}
                        value={textFontSize}
                        onChange={(e) => setTextFontSize(parseInt(e.target.value, 10))}
                      />
                    </div>
                  </>
                )}

                {/* Watermark Configuration */}
                {tool.id === 'watermark' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="watermark-text-input">
                        Watermark Text
                      </label>
                      <input
                        id="watermark-text-input"
                        type="text"
                        className="form-input"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="e.g. CONFIDENTIAL"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Color</label>
                      <select
                        className="form-select"
                        value={watermarkColor}
                        onChange={(e) => setWatermarkColor(e.target.value as 'gray' | 'red' | 'blue' | 'black')}
                      >
                        <option value="gray">Subtle Gray</option>
                        <option value="red">Warning Red</option>
                        <option value="blue">Doc Blue</option>
                        <option value="black">Deep Black</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Opacity</label>
                      <select
                        className="form-select"
                        value={watermarkOpacity}
                        onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                      >
                        <option value={0.15}>Faint (15%)</option>
                        <option value={0.25}>Standard (25%)</option>
                        <option value={0.45}>Bold (45%)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Font Size</label>
                      <select
                        className="form-select"
                        value={watermarkSize}
                        onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))}
                      >
                        <option value={32}>Small (32 pt)</option>
                        <option value={48}>Medium (48 pt)</option>
                        <option value={64}>Large (64 pt)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Position</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${watermarkPosition === 'center' ? 'active' : ''}`}
                          onClick={() => setWatermarkPosition('center')}
                        >
                          Center
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${watermarkPosition === 'top' ? 'active' : ''}`}
                          onClick={() => setWatermarkPosition('top')}
                        >
                          Top
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${watermarkPosition === 'bottom' ? 'active' : ''}`}
                          onClick={() => setWatermarkPosition('bottom')}
                        >
                          Bottom
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Page Numbers Configuration */}
                {tool.id === 'page-numbers' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="page-number-position-select">
                        Position
                      </label>
                      <select
                        id="page-number-position-select"
                        className="form-select"
                        value={pageNumberPosition}
                        onChange={(e) => setPageNumberPosition(e.target.value as PageNumberPosition)}
                      >
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="top-center">Top Center</option>
                        <option value="top-right">Top Right</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Format Style</label>
                      <select
                        className="form-select"
                        value={pageNumberFormat}
                        onChange={(e) => setPageNumberFormat(e.target.value as '{n}' | 'Page {n}' | '{n} of {total}' | 'Page {n} of {total}')}
                      >
                        <option value="{n}">Simple: 1</option>
                        <option value="Page {n}">Page Prefix: Page 1</option>
                        <option value="{n} of {total}">Fraction: 1 of 10</option>
                        <option value="Page {n} of {total}">Full: Page 1 of 10</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Protect PDF Configuration */}
                {tool.id === 'protect' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="protect-password-input">
                        Document Password
                      </label>
                      <div className="flex items-center" style={{ position: 'relative' }}>
                        <input
                          id="protect-password-input"
                          type={showPassword ? 'text' : 'password'}
                          className="form-input"
                          style={{ width: '100%', paddingRight: '36px' }}
                          value={protectPassword}
                          onChange={(e) => setProtectPassword(e.target.value)}
                          placeholder="Enter password..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            color: 'var(--color-text-secondary)',
                          }}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="protect-confirm-input">
                        Confirm Password
                      </label>
                      <input
                        id="protect-confirm-input"
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        value={protectConfirm}
                        onChange={(e) => setProtectConfirm(e.target.value)}
                        placeholder="Re-enter password..."
                      />
                    </div>
                  </>
                )}

                {/* Primary Action Button */}
                <div className="workspace-action-box">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleExecute}
                    style={{ width: '100%' }}
                  >
                    {tool.actionButtonText}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    style={{ width: '100%' }}
                  >
                    Cancel & Choose Other File
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
