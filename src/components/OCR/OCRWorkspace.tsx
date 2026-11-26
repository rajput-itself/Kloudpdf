import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScanText,
  FileText,
  Download,
  RotateCcw,
  AlertCircle,
  Check,
  Copy,
  Languages,
  Eye,
  Sliders,
  XCircle,
  FileEdit,
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { Button } from '../common/Button/Button';
import { FileUpload } from '../FileUpload/FileUpload';
import {
  runOcrOnImageOrPdf,
  OcrResult,
  OcrLanguage,
} from '../../services/pdf/ocr';
import { loadPdfDocument, renderPageToDataUrl } from '../../services/pdf/render';
import { downloadBlob } from '../../utils/file';
import './OCRWorkspace.css';

interface OCRWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  initialFile?: File;
  onOpenInEditor?: (file: File) => void;
}

const SUPPORTED_LANGUAGES: { id: OcrLanguage; name: string; nativeName: string }[] = [
  { id: 'eng', name: 'English', nativeName: 'English' },
  { id: 'hin', name: 'Hindi', nativeName: 'हिन्दी' },
  { id: 'spa', name: 'Spanish', nativeName: 'Español' },
  { id: 'fra', name: 'French', nativeName: 'Français' },
  { id: 'deu', name: 'German', nativeName: 'Deutsch' },
];

export const OCRWorkspace: React.FC<OCRWorkspaceProps> = ({
  tool,
  onBack,
  initialFile,
  onOpenInEditor,
}) => {
  // Document state
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [pageCount, setPageCount] = useState<number>(1);
  const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});
  const [isPdf, setIsPdf] = useState<boolean>(true);

  // Configuration options
  const [language, setLanguage] = useState<OcrLanguage>('eng');
  const [pageRangeMode, setPageRangeMode] = useState<'all' | 'custom'>('all');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [generateSearchablePdf, setGenerateSearchablePdf] = useState<boolean>(true);

  // Execution & Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(1);
  const [totalTargetPages, setTotalTargetPages] = useState<number>(1);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Results & Preview
  const [result, setResult] = useState<OcrResult | null>(null);
  const [activeTab, setActiveTab] = useState<'searchable' | 'text'>('searchable');
  const [activePreviewPage, setActivePreviewPage] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load document information on file selection
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setErrorMessage(null);
    setPageThumbnails({});

    const isPdfFile =
      selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    setIsPdf(isPdfFile);

    if (isPdfFile) {
      try {
        const buffer = await selectedFile.arrayBuffer();
        const pdf = await loadPdfDocument(buffer.slice(0));
        setPageCount(pdf.numPages);
        setSelectedPages(Array.from({ length: pdf.numPages }, (_, i) => i + 1));

        // Render first few thumbnails for page preview
        for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
          try {
            const thumbUrl = await renderPageToDataUrl(pdf, i, 0.25);
            setPageThumbnails((prev) => ({ ...prev, [i]: thumbUrl }));
          } catch {
            // Ignore thumbnail failure
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not read PDF';
        setErrorMessage(`Failed to read document: ${msg}`);
      }
    } else {
      // Raster image file
      setPageCount(1);
      setSelectedPages([1]);
      const imgUrl = URL.createObjectURL(selectedFile);
      setPageThumbnails({ 1: imgUrl });
    }
  }, []);

  useEffect(() => {
    if (initialFile && !file) {
      handleFileSelected(initialFile);
    }
  }, [initialFile, file, handleFileSelected]);

  // Start OCR Recognition
  const handleStartOcr = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setProgressPercent(0);
    setProgressStatus('Initializing OCR Web Worker...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const targetPageNumbers = pageRangeMode === 'all' ? undefined : selectedPages;
      const ocrResult = await runOcrOnImageOrPdf(file, {
        language,
        generateSearchablePdf,
        pageNumbers: targetPageNumbers,
        signal: controller.signal,
        onProgress: (status, progress, curPage, totalPages) => {
          setProgressStatus(status);
          setProgressPercent(Math.round(progress * 100));
          if (curPage) setCurrentPageIndex(curPage);
          if (totalPages) setTotalTargetPages(totalPages);
        },
      });

      setResult(ocrResult);
      setActivePreviewPage(1);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setProgressStatus('OCR processing was canceled.');
      } else {
        const msg = err instanceof Error ? err.message : 'OCR recognition failed';
        setErrorMessage(`OCR failed: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel OCR Recognition
  const handleCancelOcr = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
  };

  // Download Searchable PDF
  const handleDownloadSearchablePdf = () => {
    if (!result?.searchablePdfBlob || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(result.searchablePdfBlob, `${base}-searchable.pdf`);
  };

  // Download Extracted Text (.txt)
  const handleDownloadTxt = () => {
    if (!result?.fullText || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    const txtBlob = new Blob([result.fullText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(txtBlob, `${base}-ocr.txt`);
  };

  // Copy Full Extracted Text
  const handleCopyText = async () => {
    if (!result?.fullText) return;
    try {
      await navigator.clipboard.writeText(result.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Transfer Searchable PDF to Visual Editor
  const handleTransferToEditor = () => {
    if (!result?.searchablePdfBlob || !onOpenInEditor || !file) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    const editorFile = new File([result.searchablePdfBlob], `${base}-searchable.pdf`, {
      type: 'application/pdf',
    });
    onOpenInEditor(editorFile);
  };

  // 1. Initial State: No file uploaded
  if (!file) {
    return (
      <div className="ocr-workspace-screen">
        <div className="container ocr-container">
          <button type="button" className="ocr-back-link" onClick={onBack} aria-label="Back to tools">
            ← Back to PDF Tools
          </button>

          <div className="ocr-upload-header">
            <h1 className="ocr-upload-title">{tool.name}</h1>
            <p className="ocr-upload-description">
              Genuinely recognize and extract text from scanned PDFs and JPG/PNG documents using browser Web Workers.
            </p>
          </div>

          {errorMessage && (
            <div className="ocr-error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="ocr-dropzone-wrapper">
            <FileUpload
              tool={tool}
              onFilesSelected={(selected) => {
                if (selected.length > 0) handleFileSelected(selected[0]!);
              }}
            />
          </div>

          <div className="ocr-features-strip">
            <div className="ocr-feature-item">
              <Languages size={18} className="text-primary" />
              <div>
                <strong>Multi-Language OCR</strong>
                <p>Support for English, Hindi (हिन्दी), Spanish, French, and German.</p>
              </div>
            </div>
            <div className="ocr-feature-item">
              <ScanText size={18} className="text-primary" />
              <div>
                <strong>Searchable PDF Generation</strong>
                <p>Embeds transparent selectable text matching original page coordinates.</p>
              </div>
            </div>
            <div className="ocr-feature-item">
              <FileEdit size={18} className="text-primary" />
              <div>
                <strong>Editable in PDF Editor</strong>
                <p>Seamlessly transfer recognized documents into KloudPDF&apos;s Visual Editor.</p>
              </div>
            </div>
          </div>

          <div className="ocr-privacy-note">
            <span className="privacy-badge-pill">100% In-Browser Privacy</span>
            <span>Documents never leave your device. Language traineddata is cached locally.</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active OCR Workspace
  return (
    <div className="ocr-workspace-layout">
      {/* Top Header */}
      <header className="ocr-top-bar">
        <div className="ocr-top-left">
          <button type="button" className="ocr-nav-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
          <div className="ocr-doc-badge">
            <ScanText size={16} className="text-primary" />
            <span className="ocr-doc-name" title={file.name}>
              {file.name}
            </span>
          </div>
        </div>

        <div className="ocr-top-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFile(null);
              setResult(null);
            }}
            icon={<RotateCcw size={14} />}
          >
            New Document
          </Button>

          {result?.searchablePdfBlob && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadTxt}
                icon={<FileText size={14} />}
              >
                Download TXT
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadSearchablePdf}
                icon={<Download size={14} />}
              >
                Download Searchable PDF
              </Button>
              {onOpenInEditor && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTransferToEditor}
                  icon={<FileEdit size={14} />}
                >
                  Edit in Visual Editor
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="ocr-body">
        {/* Left Settings Sidebar */}
        <aside className="ocr-sidebar">
          <h3 className="ocr-sidebar-heading">
            <Sliders size={16} />
            <span>OCR Options</span>
          </h3>

          {/* Language Selector */}
          <div className="ocr-control-group">
            <label className="ocr-label">
              <Languages size={14} />
              <span>Recognition Language:</span>
            </label>
            <select
              className="ocr-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
              disabled={isProcessing}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
          </div>

          {/* Page Selection (if multipage PDF) */}
          {isPdf && pageCount > 1 && (
            <div className="ocr-control-group">
              <label className="ocr-label">
                <span>Pages to Process ({pageCount} total):</span>
              </label>
              <div className="ocr-radio-group">
                <label className="ocr-radio-label">
                  <input
                    type="radio"
                    name="pageRange"
                    checked={pageRangeMode === 'all'}
                    onChange={() => setPageRangeMode('all')}
                    disabled={isProcessing}
                  />
                  <span>All Pages (1 - {pageCount})</span>
                </label>
                <label className="ocr-radio-label">
                  <input
                    type="radio"
                    name="pageRange"
                    checked={pageRangeMode === 'custom'}
                    onChange={() => setPageRangeMode('custom')}
                    disabled={isProcessing}
                  />
                  <span>Selected Pages ({selectedPages.length})</span>
                </label>
              </div>

              {pageRangeMode === 'custom' && (
                <div className="ocr-pages-grid">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
                    const isSelected = selectedPages.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`ocr-page-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPages(selectedPages.filter((n) => n !== p));
                          } else {
                            setSelectedPages([...selectedPages, p].sort((a, b) => a - b));
                          }
                        }}
                        disabled={isProcessing}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Searchable PDF Toggle */}
          <div className="ocr-control-group">
            <label className="ocr-checkbox-label">
              <input
                type="checkbox"
                checked={generateSearchablePdf}
                onChange={(e) => setGenerateSearchablePdf(e.target.checked)}
                disabled={isProcessing}
              />
              <span>Generate Searchable PDF</span>
            </label>
            <p className="ocr-hint-text">
              Embeds invisible selectable text over scanned images so text can be searched and copied in PDF viewers.
            </p>
          </div>

          {/* Primary Action Button */}
          {!result && (
            <div className="ocr-action-card">
              <Button
                variant="primary"
                size="lg"
                onClick={handleStartOcr}
                disabled={isProcessing || (pageRangeMode === 'custom' && selectedPages.length === 0)}
                isLoading={isProcessing}
                icon={<ScanText size={18} />}
              >
                {isProcessing ? 'Recognizing...' : 'Start OCR Recognition'}
              </Button>
            </div>
          )}

          {/* Cancellation Control */}
          {isProcessing && (
            <Button
              variant="danger"
              size="md"
              onClick={handleCancelOcr}
              icon={<XCircle size={16} />}
            >
              Cancel Recognition
            </Button>
          )}

          {/* Privacy Footnote */}
          <div className="ocr-sidebar-privacy">
            <span className="privacy-badge-pill">Private</span>
            <p>100% Client-Side. No images are sent to any cloud server.</p>
          </div>
        </aside>

        {/* Center Main Stage */}
        <main className="ocr-stage">
          {/* Error Banner */}
          {errorMessage && (
            <div className="ocr-error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Processing Progress View */}
          {isProcessing && (
            <div className="ocr-progress-card">
              <div className="ocr-progress-spinner" />
              <h3 className="ocr-progress-title">Performing Optical Character Recognition</h3>
              <p className="ocr-progress-status">{progressStatus}</p>

              <div className="ocr-progress-bar-track">
                <div
                  className="ocr-progress-bar-fill"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>

              <div className="ocr-progress-meta">
                <span>{progressPercent}% completed</span>
                {totalTargetPages > 1 && (
                  <span>
                    Page {currentPageIndex} of {totalTargetPages}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Results View */}
          {!isProcessing && result && (
            <div className="ocr-results-wrapper">
              {/* Tab Navigation */}
              <div className="ocr-results-tabs">
                <button
                  type="button"
                  className={`ocr-tab-btn ${activeTab === 'searchable' ? 'active' : ''}`}
                  onClick={() => setActiveTab('searchable')}
                >
                  <Eye size={15} />
                  <span>Searchable Page Preview</span>
                </button>
                <button
                  type="button"
                  className={`ocr-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                  onClick={() => setActiveTab('text')}
                >
                  <FileText size={15} />
                  <span>Extracted Text</span>
                </button>
              </div>

              {/* Tab 1: Searchable Page Preview */}
              {activeTab === 'searchable' && (
                <div className="ocr-preview-pane">
                  {/* Page selector strip if multiple pages */}
                  {result.pages.length > 1 && (
                    <div className="ocr-pages-strip">
                      {result.pages.map((p) => (
                        <button
                          key={p.pageNumber}
                          type="button"
                          className={`ocr-thumb-btn ${activePreviewPage === p.pageNumber ? 'active' : ''}`}
                          onClick={() => setActivePreviewPage(p.pageNumber)}
                        >
                          <div className="ocr-thumb-img-wrapper">
                            {pageThumbnails[p.pageNumber] ? (
                              <img src={pageThumbnails[p.pageNumber]} alt={`Page ${p.pageNumber}`} />
                            ) : (
                              <span>Page {p.pageNumber}</span>
                            )}
                          </div>
                          <span className="ocr-confidence-tag">{p.confidence}%</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active Page View */}
                  {(() => {
                    const currentPageDetail =
                      result.pages.find((p) => p.pageNumber === activePreviewPage) || result.pages[0];
                    if (!currentPageDetail) return null;

                    return (
                      <div className="ocr-page-inspection-card">
                        <div className="ocr-page-inspection-header">
                          <span className="ocr-page-title">
                            Page {currentPageDetail.pageNumber} Analysis
                          </span>
                          <span className="ocr-badge-confidence">
                            Confidence: {currentPageDetail.confidence}%
                          </span>
                        </div>

                        {/* Interactive recognized lines */}
                        <div className="ocr-lines-ledger">
                          <h4 className="ocr-lines-heading">Recognized Text Lines ({currentPageDetail.lines.length}):</h4>
                          {currentPageDetail.lines.length === 0 ? (
                            <p className="ocr-no-lines">No text detected on this page.</p>
                          ) : (
                            <div className="ocr-lines-list">
                              {currentPageDetail.lines.map((l) => (
                                <div key={l.id} className="ocr-line-row">
                                  <span className="ocr-line-text">{l.text}</span>
                                  <span className="ocr-line-conf">{l.confidence}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tab 2: Plain Text View */}
              {activeTab === 'text' && (
                <div className="ocr-text-pane">
                  <div className="ocr-text-header">
                    <span className="ocr-text-stats">
                      Total Recognized Pages: {result.totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyText}
                      icon={copied ? <Check size={14} /> : <Copy size={14} />}
                    >
                      {copied ? 'Copied!' : 'Copy All Text'}
                    </Button>
                  </div>
                  <textarea
                    className="ocr-textarea-output"
                    value={result.fullText}
                    readOnly
                    rows={18}
                  />
                </div>
              )}
            </div>
          )}

          {/* Idle Document Loaded View (Awaiting Start) */}
          {!isProcessing && !result && (
            <div className="ocr-ready-card">
              <ScanText size={48} className="text-primary mb-3" />
              <h2 className="ocr-ready-title">Ready for Text Recognition</h2>
              <p className="ocr-ready-desc">
                Document contains {pageCount} {pageCount === 1 ? 'page' : 'pages'}. Select your recognition language on the left and click <strong>Start OCR Recognition</strong> to begin.
              </p>
              <div className="ocr-ready-thumbs">
                {Object.entries(pageThumbnails)
                  .slice(0, 4)
                  .map(([pNum, url]) => (
                    <div key={pNum} className="ocr-ready-thumb-card">
                      <img src={url} alt={`Page ${pNum}`} />
                      <span>Page {pNum}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
