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
import { loadPdfDocument, renderPageToCanvas } from '../../services/pdf/render';

// Service operations
import { mergePdfFiles } from '../../services/pdf/merge';
import { splitPdfFile } from '../../services/pdf/split';
import { organizePdfFile, PageReorderItem } from '../../services/pdf/organize';
import { rotatePdfFile } from '../../services/pdf/rotate';
import { convertJpgToPdf, convertPdfToJpg } from '../../services/pdf/convert';
import { addWatermarkToPdf } from '../../services/pdf/watermark';
import { addPageNumbersToPdf, PageNumberPosition } from '../../services/pdf/pageNumbers';
import { protectPdfFile } from '../../services/pdf/protect';

// Conversion services
import { convertPdfToImages } from '../../services/conversion/pdfToImages';
import { convertHtmlToPdf, HtmlPageSize, HtmlOrientation, sanitizeHtml } from '../../services/conversion/htmlToPdf';
import { convertWordToPdf, renderDocxPreview } from '../../services/conversion/wordToPdf';
import { convertExcelToPdf, parseExcelWorkbook, getSheetHtmlTable } from '../../services/conversion/excelToPdf';
import { convertPowerPointToPdf, inspectPptx, PptxInspectionResult } from '../../services/conversion/powerpointToPdf';

// Advanced PDF services
import { extractTextFromPdf } from '../../services/pdf/textExtraction';
import { convertPdfToGrayscale } from '../../services/pdf/grayscale';
import { applyAnnotationsToPdf, AnnotationItem, AnnotationType } from '../../services/pdf/annotations';
import { inspectPdfForm, saveFilledPdfForm, DetectedFormField } from '../../services/pdf/forms';
import { flattenPdfDocument } from '../../services/pdf/flatten';
import { analyzePdfBlankPages, removeBlankPagesFromPdf, PageBlankAnalysis } from '../../services/pdf/blankPageDetection';
import { createBookletPdf, calculateBookletLayout } from '../../services/pdf/booklet';
import { runOcrOnPdf } from '../../services/pdf/ocr';
import { deskewPdfDocument, detectCanvasSkewAngle } from '../../services/pdf/deskew';
import { applyPermanentRedaction, RedactionArea } from '../../services/pdf/redaction';

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

  // OCR options
  const [ocrLanguage, setOcrLanguage] = useState<'eng' | 'hin' | 'spa' | 'fra' | 'deu'>('eng');
  const [ocrSearchablePdf, setOcrSearchablePdf] = useState(true);

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

  // Redaction options & interactive canvas
  const [redactions, setRedactions] = useState<RedactionArea[]>([]);
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

  // Render active page canvas for interactive tools (Annotate, Redact, Deskew)
  useEffect(() => {
    if (!pdfDoc || !interactiveCanvasRef.current) return;
    if (
      tool.id !== 'annotate-pdf' &&
      tool.id !== 'redact-pdf' &&
      tool.id !== 'deskew-pdf'
    ) {
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
        } catch (err) {
          console.error('Failed to inspect PowerPoint file:', err);
          setErrorMessage('Could not parse PowerPoint slides. Please ensure the file is an uncorrupted .pptx presentation.');
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

    if (tool.id === 'redact-pdf' && currentDragRect && currentDragRect.w > 0.01 && currentDragRect.h > 0.01) {
      setRedactions((prev) => [
        ...prev,
        {
          pageNumber: activeInteractivePage,
          x: currentDragRect.x,
          y: currentDragRect.y,
          width: currentDragRect.w,
          height: currentDragRect.h,
        },
      ]);
    } else if (tool.id === 'annotate-pdf') {
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
    setRedactions([]);
    setAnnotations([]);
    setBlankAnalysis([]);
    setDetectedFormFields([]);
    setFormFieldValues({});
    setDeskewManualAngle(0);
  };

  // Execute PDF / Conversion action
  const handleExecute = async () => {
    if (files.length === 0 && tool.id !== 'html-to-pdf') return;
    setErrorMessage(null);
    setProcessingState('processing');

    try {
      const primaryFile = files[0] || new File([htmlCode], 'document.html', { type: 'text/html' });
      const baseName = primaryFile.name.replace(/\.[^/.]+$/, '');

      switch (tool.id) {
        case 'merge': {
          if (files.length < 2) {
            throw new Error('Please add at least 2 PDF files to merge.');
          }
          setStatusText('Merging PDF documents...');
          const mergedBlob = await mergePdfFiles(files, {
            onProgress: (current, total) => setProgressDetail(`Processing document ${current} of ${total}`),
          });
          setResult({
            blob: mergedBlob,
            filename: `${baseName}_merged.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'split': {
          setStatusText('Splitting PDF document...');
          let splitBlob: Blob;
          if (splitRange.trim()) {
            splitBlob = await splitPdfFile(primaryFile, {
              pageRangeString: splitRange,
              onProgress: (cur, tot) => setProgressDetail(`Exporting page ${cur} of ${tot}`),
            });
          } else {
            const selectedIndices = pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
            if (selectedIndices.length === 0) {
              throw new Error('Please specify a page range or select pages.');
            }
            splitBlob = await splitPdfFile(primaryFile, {
              pageIndices: selectedIndices,
              onProgress: (cur, tot) => setProgressDetail(`Exporting page ${cur} of ${tot}`),
            });
          }
          setResult({
            blob: splitBlob,
            filename: `${baseName}_split.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'organize': {
          setStatusText('Saving organized PDF...');
          const pageConfigs: PageReorderItem[] = pages.map((p) => ({
            originalIndex: p.pageNumber - 1,
            rotation: p.rotation,
          }));
          const organizedBlob = await organizePdfFile(primaryFile, {
            pages: pageConfigs,
            onProgress: (cur, tot) => setProgressDetail(`Rebuilding page ${cur} of ${tot}`),
          });
          setResult({
            blob: organizedBlob,
            filename: `${baseName}_organized.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'rotate': {
          setStatusText('Rotating PDF pages...');
          const rotatedBlob = await rotatePdfFile(primaryFile, {
            angle: globalRotation,
            onProgress: (cur, tot) => setProgressDetail(`Rotating page ${cur} of ${tot}`),
          });
          setResult({
            blob: rotatedBlob,
            filename: `${baseName}_rotated.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'remove-pages': {
          setStatusText('Removing pages from PDF...');
          const keepIndices = pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
          if (keepIndices.length === 0) {
            throw new Error('You cannot remove all pages. Please keep at least one page.');
          }
          const cleanedBlob = await splitPdfFile(primaryFile, {
            pageIndices: keepIndices,
            onProgress: (cur, tot) => setProgressDetail(`Copying page ${cur} of ${tot}`),
          });
          setResult({
            blob: cleanedBlob,
            filename: `${baseName}_removed_pages.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'extract-pages': {
          setStatusText('Extracting chosen pages...');
          const extractIndices = pages.filter((p) => p.selected).map((p) => p.pageNumber - 1);
          if (extractIndices.length === 0 && !splitRange.trim()) {
            throw new Error('Please select at least one page to extract.');
          }
          const extractedBlob = await splitPdfFile(primaryFile, {
            pageIndices: extractIndices.length > 0 ? extractIndices : undefined,
            pageRangeString: extractIndices.length === 0 ? splitRange : undefined,
            onProgress: (cur, tot) => setProgressDetail(`Extracting page ${cur} of ${tot}`),
          });
          setResult({
            blob: extractedBlob,
            filename: `${baseName}_extracted.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'remove-blank-pages': {
          setStatusText('Removing blank pages...');
          const pagesToRemove = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          if (pagesToRemove.length === 0) {
            throw new Error('No blank pages selected for removal.');
          }
          const cleanedBlob = await removeBlankPagesFromPdf(primaryFile, pagesToRemove, (cur, tot) => {
            setProgressDetail(`Processing page removal ${cur} of ${tot}`);
          });
          setResult({
            blob: cleanedBlob,
            filename: `${baseName}_no_blanks.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'booklet-maker': {
          setStatusText('Generating booklet imposition...');
          const bookletBlob = await createBookletPdf(primaryFile, {
            paperSize: bookletPaper,
            margin: bookletMargin,
            gutter: bookletGutter,
            onProgress: (cur, tot) => setProgressDetail(`Arranging sheet ${cur} of ${tot}`),
          });
          setResult({
            blob: bookletBlob,
            filename: `${baseName}_booklet.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'jpg-to-pdf': {
          setStatusText('Converting images to PDF...');
          const pdfBlob = await convertJpgToPdf(files, {
            orientation: jpgOrientation,
            margin: jpgMargin,
            onProgress: (cur, tot) => setProgressDetail(`Converting image ${cur} of ${tot}`),
          });
          setResult({
            blob: pdfBlob,
            filename: `${files[0]?.name.replace(/\.[^/.]+$/, '') || 'document'}_converted.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'pdf-to-jpg': {
          setStatusText('Rendering PDF pages to JPG...');
          const { blob, filename } = await convertPdfToJpg(primaryFile, (cur, tot) => {
            setProgressDetail(`Rendering page ${cur} of ${tot}`);
          });
          setResult({
            blob,
            filename,
            downloadUrl: '',
          });
          break;
        }

        case 'pdf-to-png': {
          setStatusText('Rendering PDF pages to PNG...');
          const selectedPageNums = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          const conversionResult = await convertPdfToImages(primaryFile, {
            format: 'png',
            scale: pngScale,
            pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
            onProgress: (cur, tot) => setProgressDetail(`Converting page ${cur} of ${tot} to PNG`),
          });
          setResult({
            blob: conversionResult.zipBlob || conversionResult.items[0]!.blob,
            filename: conversionResult.zipFilename || conversionResult.items[0]!.filename,
            downloadUrl: '',
            imageItems: conversionResult.items,
          });
          break;
        }

        case 'pdf-to-webp': {
          setStatusText('Compressing PDF pages to WebP...');
          const selectedPageNums = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          const conversionResult = await convertPdfToImages(primaryFile, {
            format: 'webp',
            quality: webpQuality,
            pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
            onProgress: (cur, tot) => setProgressDetail(`Compressing page ${cur} of ${tot} to WebP`),
          });
          setResult({
            blob: conversionResult.zipBlob || conversionResult.items[0]!.blob,
            filename: conversionResult.zipFilename || conversionResult.items[0]!.filename,
            downloadUrl: '',
            imageItems: conversionResult.items,
          });
          break;
        }

        case 'html-to-pdf': {
          setStatusText('Rendering HTML to PDF...');
          const pdfBlob = await convertHtmlToPdf(htmlCode, {
            pageSize: htmlPageSize,
            orientation: htmlOrientation,
            margin: htmlMargin,
            onProgress: (cur, tot) => setProgressDetail(`Rendering document slice ${cur} of ${tot}`),
          });
          setResult({
            blob: pdfBlob,
            filename: `${baseName || 'document'}.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'word-to-pdf': {
          setStatusText('Converting Word document to PDF...');
          const pdfBlob = await convertWordToPdf(primaryFile, {
            orientation: wordOrientation,
            margin: wordMargin,
            onProgress: (cur, tot) => setProgressDetail(`Rendering Word page ${cur} of ${tot}`),
          });
          setResult({
            blob: pdfBlob,
            filename: `${baseName}.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'excel-to-pdf': {
          setStatusText('Converting Excel spreadsheet to PDF...');
          const pdfBlob = await convertExcelToPdf(primaryFile, {
            sheetNames: selectedSheets.length > 0 ? selectedSheets : undefined,
            orientation: excelOrientation,
            pageSize: excelPageSize,
            fitToWidth: excelFitToWidth,
            onProgress: (cur, tot) => setProgressDetail(`Rendering worksheet ${cur} of ${tot}`),
          });
          setResult({
            blob: pdfBlob,
            filename: `${baseName}.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'powerpoint-to-pdf': {
          setStatusText('Extracting and rendering PowerPoint slides...');
          const pdfBlob = await convertPowerPointToPdf(primaryFile, (cur, tot) => {
            setProgressDetail(`Rendering slide ${cur} of ${tot}`);
          });
          setResult({
            blob: pdfBlob,
            filename: `${baseName}.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'pdf-to-text': {
          setStatusText('Extracting text content...');
          const selectedPageNums = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          const textResult = await extractTextFromPdf(primaryFile, {
            pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
            onProgress: (cur, tot) => setProgressDetail(`Extracting text from page ${cur} of ${tot}`),
          });
          const textBlob = new Blob([textResult.fullText], { type: 'text/plain;charset=utf-8' });
          setResult({
            blob: textBlob,
            filename: `${baseName}_text.txt`,
            downloadUrl: '',
            textOutput: textResult.fullText,
          });
          break;
        }

        case 'ocr-pdf': {
          setStatusText('Recognizing text with OCR...');
          const selectedPageNums = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          const ocrRes = await runOcrOnPdf(primaryFile, {
            language: ocrLanguage,
            generateSearchablePdf: ocrSearchablePdf,
            pageNumbers: selectedPageNums.length > 0 ? selectedPageNums : undefined,
            onProgress: (st, pr) => {
              setStatusText(st);
              setProgressDetail(`${Math.round(pr * 100)}% completed`);
            },
          });
          setResult({
            blob: ocrRes.searchablePdfBlob || new Blob([ocrRes.fullText], { type: 'text/plain;charset=utf-8' }),
            filename: ocrRes.searchablePdfBlob ? `${baseName}_searchable.pdf` : `${baseName}_ocr.txt`,
            downloadUrl: '',
            textOutput: ocrRes.fullText,
          });
          break;
        }

        case 'grayscale-pdf': {
          setStatusText('Converting document to grayscale...');
          const grayBlob = await convertPdfToGrayscale(primaryFile, {
            mode: grayscaleMode,
            onProgress: (cur, tot) => setProgressDetail(`Converting page ${cur} of ${tot} to grayscale`),
          });
          setResult({
            blob: grayBlob,
            filename: `${baseName}_grayscale.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'annotate-pdf': {
          if (annotations.length === 0) {
            throw new Error('Please add at least one annotation or drawing to the document.');
          }
          setStatusText('Applying annotations to PDF...');
          const annotatedBlob = await applyAnnotationsToPdf(primaryFile, annotations, (cur, tot) => {
            setProgressDetail(`Saving annotations on page ${cur} of ${tot}`);
          });
          setResult({
            blob: annotatedBlob,
            filename: `${baseName}_annotated.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'redact-pdf': {
          if (redactions.length === 0) {
            throw new Error('Please define at least one redaction box on the document.');
          }
          setStatusText('Applying permanent redactions...');
          const redactRes = await applyPermanentRedaction(primaryFile, redactions, (cur, tot) => {
            setProgressDetail(`Rasterizing and permanently redacting page ${cur} of ${tot}`);
          });
          setResult({
            blob: redactRes.blob,
            filename: `${baseName}_redacted.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'fill-forms': {
          setStatusText('Saving filled form values...');
          const filledBlob = await saveFilledPdfForm(primaryFile, formFieldValues, {
            flatten: flattenOnSave,
          });
          setResult({
            blob: filledBlob,
            filename: `${baseName}_filled.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'flatten-pdf': {
          setStatusText('Flattening PDF form fields and annotations...');
          const flatBlob = await flattenPdfDocument(primaryFile);
          setResult({
            blob: flatBlob,
            filename: `${baseName}_flattened.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'deskew-pdf': {
          setStatusText('Deskewing pages...');
          const deskewBlob = await deskewPdfDocument(primaryFile, {
            manualAngle: deskewManualAngle,
            onProgress: (cur, tot) => setProgressDetail(`Deskewing page ${cur} of ${tot}`),
          });
          setResult({
            blob: deskewBlob,
            filename: `${baseName}_deskewed.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'watermark': {
          if (!watermarkText.trim()) {
            throw new Error('Please enter watermark text.');
          }
          setStatusText('Applying watermark...');
          const watermarkedBlob = await addWatermarkToPdf(primaryFile, {
            text: watermarkText,
            fontSize: watermarkSize,
            color: watermarkColor,
            position: watermarkPosition,
            opacity: watermarkOpacity,
            onProgress: (cur, tot) => setProgressDetail(`Watermarking page ${cur} of ${tot}`),
          });
          setResult({
            blob: watermarkedBlob,
            filename: `${baseName}_watermarked.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'page-numbers': {
          setStatusText('Inserting page numbers...');
          const numberedBlob = await addPageNumbersToPdf(primaryFile, {
            position: pageNumberPosition,
            format: pageNumberFormat,
            onProgress: (cur, tot) => setProgressDetail(`Numbering page ${cur} of ${tot}`),
          });
          setResult({
            blob: numberedBlob,
            filename: `${baseName}_numbered.pdf`,
            downloadUrl: '',
          });
          break;
        }

        case 'protect': {
          if (!protectPassword) {
            throw new Error('Please enter a password.');
          }
          if (protectPassword !== protectConfirm) {
            throw new Error('Passwords do not match. Please verify your password.');
          }
          if (protectPassword.length < 4) {
            throw new Error('Password must be at least 4 characters.');
          }
          setStatusText('Encrypting PDF document...');
          const protectedBlob = await protectPdfFile(primaryFile, {
            password: protectPassword,
            onProgress: (cur, tot) => setProgressDetail(`Encrypting block ${cur} of ${tot}`),
          });
          setResult({
            blob: protectedBlob,
            filename: `${baseName}_protected.pdf`,
            downloadUrl: '',
          });
          break;
        }

        default:
          throw new Error('Unsupported tool operation.');
      }

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

              {/* Special quick action for HTML to PDF */}
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
                {/* Multi-file list for Merge or JPG-to-PDF */}
                {(tool.id === 'merge' || tool.id === 'jpg-to-pdf') && (
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
                          {tool.id === 'jpg-to-pdf' ? (
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
                    tool.id === 'ocr-pdf' ||
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
                            tool.id === 'ocr-pdf') &&
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
                                tool.id === 'ocr-pdf' ||
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

                {/* Interactive Overlay Workspace for Annotate, Redact, Deskew */}
                {pdfDoc && (tool.id === 'annotate-pdf' || tool.id === 'redact-pdf' || tool.id === 'deskew-pdf') && (
                  <div>
                    {/* Navigation Bar for Active Page */}
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
                      <span className="form-label">
                        {tool.id === 'redact-pdf' && 'Draw Black Boxes over Sensitive Text'}
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

                        {/* Redaction box overlays for this active page */}
                        {tool.id === 'redact-pdf' &&
                          redactions
                            .filter((r) => r.pageNumber === activeInteractivePage)
                            .map((r, rIdx) => (
                              <div
                                key={rIdx}
                                className="redaction-layer-box"
                                style={{
                                  left: `${r.x * 100}%`,
                                  top: `${r.y * 100}%`,
                                  width: `${r.width * 100}%`,
                                  height: `${r.height * 100}%`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRedactions((prev) => prev.filter((_, idx) => idx !== rIdx));
                                }}
                                title="Click to remove redaction"
                              />
                            ))}

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
                                tool.id === 'redact-pdf'
                                  ? 'rgba(0,0,0,0.7)'
                                  : activeAnnotationTool === 'highlight'
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
                            {formatBytes(files[0]?.size || 0)} • {pptxInspection.slideCount} slides
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
                      Extracted Presentation Slides ({pptxInspection.slideCount})
                    </span>

                    <div className="doc-preview-box">
                      {pptxInspection.slides.map((s) => (
                        <div
                          key={s.slideNumber}
                          style={{
                            padding: '12px',
                            borderBottom: '1px solid #e8eaed',
                            display: 'flex',
                            gap: '12px',
                          }}
                        >
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
                        </div>
                      ))}
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

                {/* OCR PDF Configuration */}
                {tool.id === 'ocr-pdf' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">OCR Language</label>
                      <select
                        className="form-select"
                        value={ocrLanguage}
                        onChange={(e) => setOcrLanguage(e.target.value as any)}
                      >
                        <option value="eng">English</option>
                        <option value="hin">Hindi (हिंदी)</option>
                        <option value="spa">Spanish (Español)</option>
                        <option value="fra">French (Français)</option>
                        <option value="deu">German (Deutsch)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={ocrSearchablePdf}
                          onChange={(e) => setOcrSearchablePdf(e.target.checked)}
                        />
                        <span className="text-sm font-medium">Generate Searchable PDF</span>
                      </label>
                      <span className="form-hint">
                        Embeds an invisible selectable text layer over the scanned image.
                      </span>
                    </div>
                  </>
                )}

                {/* Redact PDF Configuration */}
                {tool.id === 'redact-pdf' && (
                  <>
                    <div className="form-group">
                      <span className="form-label">Applied Redactions ({redactions.length})</span>
                      <p className="text-xs text-secondary">
                        Drag boxes over text on the preview to add redactions. Click a box to delete it.
                      </p>
                    </div>

                    <div className="conversion-hint-box" style={{ borderLeftColor: '#ea4335' }}>
                      <span style={{ fontWeight: 600, color: '#ea4335' }}>Security Verification:</span>
                      <p style={{ margin: '4px 0 0', fontSize: '11px' }}>
                        Redacted pages are rasterized to eliminate all underlying text stream bytes. Sensitive content cannot be recovered via copy-paste or text extraction.
                      </p>
                    </div>
                  </>
                )}

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

                {/* JPG to PDF Configuration */}
                {tool.id === 'jpg-to-pdf' && (
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
