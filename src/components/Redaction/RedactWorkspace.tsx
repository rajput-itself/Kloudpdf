import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldAlert,
  Download,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { Button } from '../common/Button/Button';
import { FileUpload } from '../FileUpload/FileUpload';
import { loadPdfDocument, renderPageToCanvas } from '../../services/pdf/render';
import {
  applyPermanentRedaction,
  RedactionArea,
  RedactionResult,
} from '../../services/pdf/redaction';
import { downloadBlob } from '../../utils/file';
import './RedactWorkspace.css';

interface RedactWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  initialFile?: File;
  onOpenInEditor?: (file: File) => void;
}

export const RedactWorkspace: React.FC<RedactWorkspaceProps> = ({
  tool,
  onBack,
  initialFile,
}) => {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const fileBytesRef = useRef<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }[]>([]);
  const [redactions, setRedactions] = useState<RedactionArea[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragRect, setCurrentDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Execution & Output state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [result, setResult] = useState<RedactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [redactionMode, setRedactionMode] = useState<'raster-guaranteed' | 'auto'>('raster-guaranteed');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Load document
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError(null);
    setRedactions([]);
    setCurrentPage(1);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      fileBytesRef.current = bytes.slice();
      const pdf = await loadPdfDocument(bytes.slice());
      setPdfDoc(pdf);
      setPageCount(pdf.numPages);

      const dims: { width: number; height: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const vp = p.getViewport({ scale: 1 });
        dims.push({ width: vp.width, height: vp.height });
      }
      setPageDimensions(dims);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read PDF';
      setError(`File load error: ${msg}`);
    }
  }, []);

  useEffect(() => {
    if (initialFile && !file) {
      handleFileSelected(initialFile);
    }
  }, [initialFile, file, handleFileSelected]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isMounted = true;
    (async () => {
      try {
        if (!isMounted || !canvasRef.current) return;
        // Render at 1.5x scale for clear readability
        await renderPageToCanvas(pdfDoc, currentPage, canvasRef.current, { scale: 1.5 });
      } catch (err) {
        console.warn('Page render failed:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, currentPage]);

  const activeDim = pageDimensions[currentPage - 1] || { width: 612, height: 792 };

  // Mouse / Drawing Events
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (result) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();

    const scaleX = activeDim.width / rect.width;
    const scaleY = activeDim.height / rect.height;

    const startX = (e.clientX - rect.left) * scaleX;
    const startY = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setDragStart({ x: startX, y: startY });
    setCurrentDragRect({ x: startX, y: startY, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragStart) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();

    const scaleX = activeDim.width / rect.width;
    const scaleY = activeDim.height / rect.height;

    const curX = Math.max(0, Math.min(activeDim.width, (e.clientX - rect.left) * scaleX));
    const curY = Math.max(0, Math.min(activeDim.height, (e.clientY - rect.top) * scaleY));

    const x = Math.min(dragStart.x, curX);
    const y = Math.min(dragStart.y, curY);
    const width = Math.abs(curX - dragStart.x);
    const height = Math.abs(curY - dragStart.y);

    setCurrentDragRect({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentDragRect) {
      setIsDrawing(false);
      return;
    }

    if (currentDragRect.width > 8 && currentDragRect.height > 8) {
      const newRedaction: RedactionArea = {
        id: `redact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: currentPage,
        x: Math.round(currentDragRect.x),
        y: Math.round(currentDragRect.y),
        width: Math.round(currentDragRect.width),
        height: Math.round(currentDragRect.height),
      };
      setRedactions((prev) => [...prev, newRedaction]);
    }

    setIsDrawing(false);
    setDragStart(null);
    setCurrentDragRect(null);
  };

  const handleDeleteRedaction = (id: string) => {
    setRedactions((prev) => prev.filter((r) => r.id !== id));
  };

  const handleApplyRedactions = async () => {
    if (!file || redactions.length === 0) return;
    setShowConfirmModal(false);
    setIsProcessing(true);
    setError(null);
    setProgressText('Permanently destroying underlying content...');

    try {
      const source = fileBytesRef.current ? fileBytesRef.current.slice() : file;
      const res = await applyPermanentRedaction(source, redactions, {
        mode: redactionMode,
        onProgress: (cur, total) => {
          setProgressText(`Processing page ${cur} of ${total}...`);
        },
      });

      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Redaction failed';
      setError(`Redaction error: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result?.blob || !file) return;
    const base = file.name.replace(/\.pdf$/i, '');
    downloadBlob(result.blob, `${base}-redacted.pdf`);
  };

  // 1. Initial State: Upload
  if (!file) {
    return (
      <div className="redact-screen">
        <div className="container redact-container">
          <button type="button" className="redact-back-link" onClick={onBack} aria-label="Back">
            ← Back to PDF Tools
          </button>

          <div className="redact-upload-header">
            <h1 className="redact-title">{tool.name}</h1>
            <p className="redact-subtitle">
              Permanently remove sensitive text, graphics, and image regions from PDF pages in your browser
            </p>
          </div>

          <div className="redact-dropzone-wrapper">
            <FileUpload
              tool={tool}
              onFilesSelected={(files) => {
                if (files.length > 0) handleFileSelected(files[0]!);
              }}
            />
          </div>

          <div className="redact-security-checklist">
            <div className="redact-security-card">
              <ShieldAlert size={18} className="text-danger" />
              <div>
                <strong>Content elimination</strong>
                <p>Removes underlying text glyphs and stream operators so redacted text cannot be searched or copied</p>
              </div>
            </div>
            <div className="redact-security-card">
              <Lock size={18} className="text-primary" />
              <div>
                <strong>Local sanitization</strong>
                <p>Metadata stripping and export validation run directly in browser memory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentPageRedactions = redactions.filter((r) => r.pageNumber === currentPage);

  // 2. Active Redaction Workspace
  return (
    <div className="redact-workspace-layout">
      {/* Top Bar */}
      <header className="redact-topbar">
        <div className="redact-topbar-left">
          <button type="button" className="redact-nav-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
          <div className="redact-doc-tag">
            <ShieldAlert size={16} className="text-danger" />
            <span className="redact-doc-name" title={file.name}>
              {file.name}
            </span>
          </div>
        </div>

        <div className="redact-topbar-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFile(null);
              setRedactions([]);
              setResult(null);
            }}
            icon={<RotateCcw size={14} />}
          >
            New Document
          </Button>

          {result ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              icon={<Download size={16} />}
            >
              Download Redacted PDF
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowConfirmModal(true)}
              disabled={redactions.length === 0 || isProcessing}
              isLoading={isProcessing}
              icon={<Lock size={15} />}
            >
              Apply Permanent Redactions ({redactions.length})
            </Button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="redact-body">
        {/* Left Sidebar */}
        <aside className="redact-sidebar">
          <div className="redact-sidebar-section">
            <h4 className="redact-sidebar-title">
              <ShieldAlert size={15} className="text-danger" />
              <span>Redaction Areas ({redactions.length})</span>
            </h4>
            <p className="redact-instruction">
              Click and drag a box across any sensitive text or image on the document to mark for redaction.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="redact-mode-selector">
            <span className="redact-mode-label">Security Mode:</span>
            <label className="redact-mode-radio">
              <input
                type="radio"
                name="redactionMode"
                checked={redactionMode === 'raster-guaranteed'}
                onChange={() => setRedactionMode('raster-guaranteed')}
                disabled={isProcessing || Boolean(result)}
              />
              <div>
                <strong>Physical Raster Baking (Guaranteed)</strong>
                <p>Destroys underlying image pixels and vector text permanently at 2x resolution.</p>
              </div>
            </label>
            <label className="redact-mode-radio">
              <input
                type="radio"
                name="redactionMode"
                checked={redactionMode === 'auto'}
                onChange={() => setRedactionMode('auto')}
                disabled={isProcessing || Boolean(result)}
              />
              <div>
                <strong>Vector Stream Excision</strong>
                <p>Removes text operators directly from PDF content streams.</p>
              </div>
            </label>
          </div>

          {/* Ledger of defined redactions */}
          <div className="redact-ledger">
            {redactions.length === 0 ? (
              <div className="redact-ledger-empty">
                <Plus size={20} className="text-muted mb-2" />
                <span>No redaction areas defined yet. Drag a rectangle on the document preview.</span>
              </div>
            ) : (
              <div className="redact-ledger-items">
                {redactions.map((r, idx) => (
                  <div key={r.id} className="redact-item-row">
                    <div className="redact-item-info">
                      <span className="redact-item-num">#{idx + 1}</span>
                      <span>
                        Page {r.pageNumber} ({r.width} × {r.height} pt)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="redact-item-del-btn"
                      onClick={() => handleDeleteRedaction(r.id)}
                      title="Remove redaction box"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {redactions.length > 0 && !result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRedactions([])}
              icon={<RotateCcw size={13} />}
            >
              Clear All Redactions
            </Button>
          )}

          {/* Verification Badge upon completion */}
          {result && (
            <div className="redact-verified-card">
              <CheckCircle2 size={24} className="text-success" />
              <div>
                <strong>Security Verified</strong>
                <p>Underlying content permanently destroyed across {result.redactedPagesCount} pages.</p>
              </div>
            </div>
          )}
        </aside>

        {/* Center Stage: Interactive Page & Overlay */}
        <main className="redact-stage">
          {error && (
            <div className="redact-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isProcessing && (
            <div className="redact-processing-card">
              <div className="redact-spinner" />
              <span>{progressText}</span>
            </div>
          )}

          {/* Page Pagination Strip */}
          {pageCount > 1 && (
            <div className="redact-pagination">
              <button
                type="button"
                className="redact-page-nav-btn"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1 || isProcessing}
              >
                Previous
              </button>
              <span className="redact-page-counter">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                className="redact-page-nav-btn"
                onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount || isProcessing}
              >
                Next
              </button>
            </div>
          )}

          {/* Canvas Wrapper & Interactive Drawing Overlay */}
          <div
            ref={stageRef}
            className="redact-canvas-stage"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <canvas ref={canvasRef} className="redact-rendered-canvas" />

            {/* Existing Redaction Boxes on Active Page */}
            {currentPageRedactions.map((r) => {
              const leftPct = (r.x / activeDim.width) * 100;
              const topPct = (r.y / activeDim.height) * 100;
              const widthPct = (r.width / activeDim.width) * 100;
              const heightPct = (r.height / activeDim.height) * 100;

              return (
                <div
                  key={r.id}
                  className="redact-box-overlay"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                >
                  <span className="redact-box-label">REDACT</span>
                  {!result && (
                    <button
                      type="button"
                      className="redact-box-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRedaction(r.id);
                      }}
                      title="Delete this redaction"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Currently Dragging Box */}
            {isDrawing && currentDragRect && (
              <div
                className="redact-box-overlay drawing"
                style={{
                  left: `${(currentDragRect.x / activeDim.width) * 100}%`,
                  top: `${(currentDragRect.y / activeDim.height) * 100}%`,
                  width: `${(currentDragRect.width / activeDim.width) * 100}%`,
                  height: `${(currentDragRect.height / activeDim.height) * 100}%`,
                }}
              >
                <span className="redact-box-label">MARKING...</span>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Security Confirmation Warning Modal */}
      {showConfirmModal && (
        <div className="redact-modal-backdrop" onClick={() => setShowConfirmModal(false)}>
          <div className="redact-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="redact-modal-header">
              <ShieldAlert size={24} className="text-danger" />
              <h3>Permanent Redaction Warning</h3>
            </div>
            <div className="redact-modal-body">
              <p>
                You are about to permanently apply <strong>{redactions.length} redactions</strong> across this document.
              </p>
              <div className="redact-warning-box">
                <strong>Irreversible Action:</strong> The underlying text characters, vector paths, and image pixels in the selected areas will be permanently destroyed. Redacted data cannot be extracted, unmasked, or searched in the exported PDF.
              </div>
              <p className="redact-confirm-sub">Are you sure you want to proceed with permanent destruction?</p>
            </div>
            <div className="redact-modal-footer">
              <Button variant="secondary" size="md" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleApplyRedactions}
                icon={<Lock size={15} />}
              >
                Permanently Destroy & Redact
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
