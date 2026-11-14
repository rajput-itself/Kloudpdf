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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ToolDefinition, ProcessingState, ProcessedResult, PDFPageInfo } from '../../types';
import { FileUpload } from '../../components/FileUpload/FileUpload';
import { PDFPageThumbnail } from '../../components/PDFPreview/PDFPageThumbnail';
import { ProcessingView } from './ProcessingView';
import { CompletedView } from './CompletedView';
import { Button } from '../../components/common/Button/Button';
import { formatBytes, isValidFileType } from '../../utils/file';
import { loadPdfDocument } from '../../services/pdf/render';

// Service operations
import { mergePdfFiles } from '../../services/pdf/merge';
import { splitPdfFile } from '../../services/pdf/split';
import { organizePdfFile, PageReorderItem } from '../../services/pdf/organize';
import { rotatePdfFile } from '../../services/pdf/rotate';
import { convertJpgToPdf, convertPdfToJpg } from '../../services/pdf/convert';
import { addWatermarkToPdf } from '../../services/pdf/watermark';
import { addPageNumbersToPdf, PageNumberPosition } from '../../services/pdf/pageNumbers';
import { protectPdfFile } from '../../services/pdf/protect';

// New conversion services
import { convertPdfToImages } from '../../services/conversion/pdfToImages';
import { convertHtmlToPdf, HtmlPageSize, HtmlOrientation, sanitizeHtml } from '../../services/conversion/htmlToPdf';
import { convertWordToPdf, renderDocxPreview } from '../../services/conversion/wordToPdf';
import { convertExcelToPdf, parseExcelWorkbook, getSheetHtmlTable } from '../../services/conversion/excelToPdf';
import { convertPowerPointToPdf, inspectPptx, PptxInspectionResult } from '../../services/conversion/powerpointToPdf';

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
  const [pngScale, setPngScale] = useState<number>(2); // 1, 1.5, 2

  // PDF to WebP options
  const [webpQuality, setWebpQuality] = useState<number>(0.85); // 0.7, 0.85, 0.95

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

  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount or reset
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [pdfDoc]);

  // Load PDF.js document when a PDF file is chosen
  const loadSinglePdfDoc = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const doc = await loadPdfDocument(buffer);
      setPdfDoc(doc);
      setPageCount(doc.numPages);

      const initialPages: PDFPageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        initialPages.push({
          pageNumber: i,
          rotation: 0,
          selected: tool.id === 'extract-pages' ? false : true,
        });
      }
      setPages(initialPages);
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

  // Reorder / Rotate / Delete pages in Organize
  const handleRotatePage = (pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === pageNumber
          ? { ...p, rotation: (p.rotation + 90) % 360 }
          : p
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
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((s) => s !== sheetName);
      }
      return [...prev, sheetName];
    });
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
            onProgress: (current, total) => {
              setProgressDetail(`Processing document ${current} of ${total}`);
            },
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
            const selectedIndices = pages
              .filter((p) => p.selected)
              .map((p) => p.pageNumber - 1);
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
          const keepIndices = pages
            .filter((p) => p.selected)
            .map((p) => p.pageNumber - 1);
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
          const extractIndices = pages
            .filter((p) => p.selected)
            .map((p) => p.pageNumber - 1);
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

                {/* PDF Page Thumbnail Grid (for Organize, Rotate, Remove, Extract, PDF to PNG, PDF to WebP) */}
                {pdfDoc &&
                  (tool.id === 'organize' ||
                    tool.id === 'rotate' ||
                    tool.id === 'remove-pages' ||
                    tool.id === 'extract-pages' ||
                    tool.id === 'pdf-to-png' ||
                    tool.id === 'pdf-to-webp') && (
                    <div>
                      <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span className="form-label">
                          Pages ({pageCount})
                          {(tool.id === 'pdf-to-png' || tool.id === 'pdf-to-webp') &&
                            ` — Converting ${pages.filter((p) => p.selected).length} of ${pageCount} pages`}
                        </span>

                        {(tool.id === 'pdf-to-png' || tool.id === 'pdf-to-webp') && (
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
                        )}
                      </div>

                      <div className="pages-grid">
                        {pages.map((p) => (
                          <PDFPageThumbnail
                            key={p.pageNumber}
                            pdfDoc={pdfDoc}
                            pageNumber={p.pageNumber}
                            rotation={p.rotation + (tool.id === 'rotate' ? globalRotation : 0)}
                            selected={p.selected}
                            selectable={
                              tool.id === 'remove-pages' ||
                              tool.id === 'extract-pages' ||
                              tool.id === 'pdf-to-png' ||
                              tool.id === 'pdf-to-webp'
                            }
                            showRotate={tool.id === 'organize'}
                            showDelete={tool.id === 'organize'}
                            onSelect={handleToggleSelectPage}
                            onRotate={handleRotatePage}
                            onDelete={handleDeletePage}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                {/* Single file PDF preview thumbnail for Watermark, Page-numbers, PDF to JPG, Protect, Split */}
                {pdfDoc &&
                  (tool.id === 'watermark' ||
                    tool.id === 'page-numbers' ||
                    tool.id === 'pdf-to-jpg' ||
                    tool.id === 'protect' ||
                    tool.id === 'split') && (
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

                    {/* Worksheet Selection Tabs */}
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

                    {/* Active Sheet Table Preview */}
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

                    <div className="conversion-hint-box">
                      <Info size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      <span>
                        <strong>Browser-Based Processing Notice:</strong> KloudPDF extracts slides, typography, and embedded images client-side. For 100% vector shape animation fidelity, consider using PowerPoint or Google Slides native "Download as PDF".
                      </span>
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

                {/* PDF to PNG Configuration */}
                {tool.id === 'pdf-to-png' && (
                  <>
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

                    <p className="text-xs text-secondary">
                      Lossless PNG format. Multi-page documents provide individual page downloads and a unified ZIP archive.
                    </p>
                  </>
                )}

                {/* PDF to WebP Configuration */}
                {tool.id === 'pdf-to-webp' && (
                  <>
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

                    <p className="text-xs text-secondary">
                      Modern WebP provides 25-35% smaller file sizes than JPEG with identical visual quality.
                    </p>
                  </>
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
                      <label className="form-label">Page Margin</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${htmlMargin === 0 ? 'active' : ''}`}
                          onClick={() => setHtmlMargin(0)}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${htmlMargin === 20 ? 'active' : ''}`}
                          onClick={() => setHtmlMargin(20)}
                        >
                          Small (20pt)
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${htmlMargin === 40 ? 'active' : ''}`}
                          onClick={() => setHtmlMargin(40)}
                        >
                          Standard (40pt)
                        </button>
                      </div>
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
                      <label className="form-label">Margins</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${wordMargin === 0 ? 'active' : ''}`}
                          onClick={() => setWordMargin(0)}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${wordMargin === 20 ? 'active' : ''}`}
                          onClick={() => setWordMargin(20)}
                        >
                          Standard
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${wordMargin === 40 ? 'active' : ''}`}
                          onClick={() => setWordMargin(40)}
                        >
                          Wide
                        </button>
                      </div>
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
                        <option value="a4">A4 (Standard)</option>
                        <option value="letter">Letter</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Fit to Page Width</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${excelFitToWidth ? 'active' : ''}`}
                          onClick={() => setExcelFitToWidth(true)}
                        >
                          Auto Fit
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${!excelFitToWidth ? 'active' : ''}`}
                          onClick={() => setExcelFitToWidth(false)}
                        >
                          Original Width
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* PowerPoint to PDF Configuration */}
                {tool.id === 'powerpoint-to-pdf' && (
                  <div className="form-group">
                    <span className="form-label">Output Aspect Ratio</span>
                    <p className="text-sm text-secondary">
                      16:9 Widescreen Landscape (960 × 540 pt). Matches modern presentation displays.
                    </p>
                  </div>
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
                    <span className="form-hint">
                      Leave empty to select pages visually or extract all.
                    </span>
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
                      <label className="form-label">Page Margin</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${jpgMargin === 0 ? 'active' : ''}`}
                          onClick={() => setJpgMargin(0)}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${jpgMargin === 20 ? 'active' : ''}`}
                          onClick={() => setJpgMargin(20)}
                        >
                          Small
                        </button>
                        <button
                          type="button"
                          className={`options-pill ${jpgMargin === 40 ? 'active' : ''}`}
                          onClick={() => setJpgMargin(40)}
                        >
                          Big
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* PDF to JPG Info */}
                {tool.id === 'pdf-to-jpg' && (
                  <div className="form-group">
                    <span className="form-label">Output Format</span>
                    <p className="text-sm text-secondary">
                      High-resolution JPEG (92% quality).
                      {pageCount > 1
                        ? ` Pages will be downloaded as a ZIP containing all ${pageCount} images.`
                        : ' Page will be downloaded as a high-resolution JPG.'}
                    </p>
                  </div>
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
                      <label className="form-label">Position</label>
                      <div className="options-pill-group">
                        <button
                          type="button"
                          className={`options-pill ${watermarkPosition === 'center' ? 'active' : ''}`}
                          onClick={() => setWatermarkPosition('center')}
                        >
                          Center (Diagonal)
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

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="watermark-color-select">
                          Color
                        </label>
                        <select
                          id="watermark-color-select"
                          className="form-select"
                          value={watermarkColor}
                          onChange={(e) => setWatermarkColor(e.target.value as any)}
                        >
                          <option value="gray">Gray</option>
                          <option value="red">Red</option>
                          <option value="blue">Blue</option>
                          <option value="black">Black</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="watermark-opacity-select">
                          Opacity
                        </label>
                        <select
                          id="watermark-opacity-select"
                          className="form-select"
                          value={watermarkOpacity}
                          onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                        >
                          <option value={0.15}>Light (15%)</option>
                          <option value={0.25}>Standard (25%)</option>
                          <option value={0.5}>Dark (50%)</option>
                          <option value={0.8}>Opaque (80%)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="watermark-size-select">
                        Font Size
                      </label>
                      <select
                        id="watermark-size-select"
                        className="form-select"
                        value={watermarkSize}
                        onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))}
                      >
                        <option value={28}>Small (28pt)</option>
                        <option value={48}>Medium (48pt)</option>
                        <option value={72}>Large (72pt)</option>
                      </select>
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
                      <label className="form-label" htmlFor="page-number-format-select">
                        Format
                      </label>
                      <select
                        id="page-number-format-select"
                        className="form-select"
                        value={pageNumberFormat}
                        onChange={(e) => setPageNumberFormat(e.target.value as any)}
                      >
                        <option value="Page {n} of {total}">Page 1 of {pageCount || 10}</option>
                        <option value="Page {n}">Page 1</option>
                        <option value="{n} of {total}">1 of {pageCount || 10}</option>
                        <option value="{n}">1</option>
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

                    <p className="text-xs text-secondary">
                      Your PDF will be protected with AES client-side encryption. The password will be
                      required every time the document is opened.
                    </p>
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
