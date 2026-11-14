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
} from 'lucide-react';
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

import './ToolWorkspace.css';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
}

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
        // By default, for extract/split/remove, selected flag can represent intent
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

      if (single.name.toLowerCase().endsWith('.pdf')) {
        await loadSinglePdfDoc(single);
      }
    }
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
  };

  // Execute PDF action
  const handleExecute = async () => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setProcessingState('processing');

    try {
      const primaryFile = files[0]!;
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
            // Split selected pages
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
          // Selected pages are the ones to KEEP, or unselected ones to REMOVE
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
            <FileUpload tool={tool} onFilesSelected={handleFilesSelected} />
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

                {/* Single file PDF preview thumbnail grid for page-based tools */}
                {pdfDoc && (tool.id === 'organize' || tool.id === 'rotate' || tool.id === 'remove-pages' || tool.id === 'extract-pages') && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                      <span className="form-label">
                        Pages ({pageCount}) {tool.id === 'remove-pages' && '— Click a page to keep or remove'}
                        {tool.id === 'extract-pages' && '— Click pages to select for extraction'}
                      </span>
                      {tool.id === 'remove-pages' && (
                        <span className="text-xs text-secondary">
                          Keeping {pages.filter((p) => p.selected).length} of {pageCount} pages
                        </span>
                      )}
                      {tool.id === 'extract-pages' && (
                        <span className="text-xs text-primary font-medium">
                          Selected: {pages.filter((p) => p.selected).length} pages
                        </span>
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
                          selectable={tool.id === 'remove-pages' || tool.id === 'extract-pages'}
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

                {/* For single file preview tools (watermark, page-numbers, pdf-to-jpg, protect) */}
                {pdfDoc && (tool.id === 'watermark' || tool.id === 'page-numbers' || tool.id === 'pdf-to-jpg' || tool.id === 'protect' || tool.id === 'split') && (
                  <div className="file-list-group">
                    <div className="file-list-item">
                      <div className="file-item-left">
                        <FileText size={20} className="file-item-icon" />
                        <div className="file-item-details">
                          <span className="file-item-name">{files[0]?.name}</span>
                          <span className="file-item-size">
                            {formatBytes(files[0]?.size || 0)} • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
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

                    {/* Show first page thumbnail as visual confirmation */}
                    <div style={{ maxWidth: '240px', margin: '1rem auto' }}>
                      <PDFPageThumbnail
                        pdfDoc={pdfDoc}
                        pageNumber={1}
                        rotation={0}
                      />
                      <p className="text-xs text-secondary text-center" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                        Preview: Page 1 of {pageCount}
                      </p>
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

                {/* Tool-specific configuration controls */}

                {/* Split Configuration */}
                {tool.id === 'split' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="split-range-input">Page Ranges to Extract</label>
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
                      <label className="form-label" htmlFor="watermark-text-input">Watermark Text</label>
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
                        <label className="form-label" htmlFor="watermark-color-select">Color</label>
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
                        <label className="form-label" htmlFor="watermark-opacity-select">Opacity</label>
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
                      <label className="form-label" htmlFor="watermark-size-select">Font Size</label>
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
                      <label className="form-label" htmlFor="page-number-position-select">Position</label>
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
                      <label className="form-label" htmlFor="page-number-format-select">Format</label>
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
                      <label className="form-label" htmlFor="protect-password-input">Document Password</label>
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
                          style={{ position: 'absolute', right: '10px', color: 'var(--color-text-secondary)' }}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="protect-confirm-input">Confirm Password</label>
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
                      Your PDF will be protected with AES client-side encryption. The password will be required every time the document is opened.
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
