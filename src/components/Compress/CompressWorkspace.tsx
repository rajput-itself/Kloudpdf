import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Sliders,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  FileText,
  Clock,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { Button } from '../common/Button/Button';
import { FileUpload } from '../FileUpload/FileUpload';
import { formatBytes, downloadBlob } from '../../utils/file';
import { loadPdfDocument, renderPageToCanvas } from '../../services/pdf/render';
import {
  compressPdfDocument,
  CompressionLevel,
  CustomCompressionSettings,
  CompressionResult,
} from '../../services/pdf/compress';
import './CompressWorkspace.css';

interface CompressWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  initialFile?: File;
}

export const CompressWorkspace: React.FC<CompressWorkspaceProps> = ({
  tool,
  onBack,
  initialFile,
}) => {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [level, setLevel] = useState<CompressionLevel>('recommended');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom Settings
  const [customSettings, setCustomSettings] = useState<CustomCompressionSettings>({
    imageQuality: 0.65,
    maxImageDimension: 1600,
    resolutionDpi: 150,
    convertToGrayscale: false,
    removeMetadata: true,
    losslessOptimization: true,
  });

  const [targetSizePreset, setTargetSizePreset] = useState<string>('none');
  const [customTargetKb, setCustomTargetKb] = useState<string>('');
  const [activePreviewTab, setActivePreviewTab] = useState<'compare' | 'compressed' | 'original'>('compare');

  // Preview canvas references
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileBytesRef = useRef<Uint8Array | null>(null);

  // Load initial file bytes
  useEffect(() => {
    if (file) {
      file.arrayBuffer().then((buf) => {
        fileBytesRef.current = new Uint8Array(buf);
        renderOriginalPreview();
      });
    } else {
      fileBytesRef.current = null;
      setResult(null);
    }
  }, [file]);

  // Render original page 1 preview
  const renderOriginalPreview = useCallback(async () => {
    if (!fileBytesRef.current || !origCanvasRef.current) return;
    try {
      const pdfDoc = await loadPdfDocument(fileBytesRef.current.slice());
      if (origCanvasRef.current) {
        await renderPageToCanvas(pdfDoc, 1, origCanvasRef.current, { scale: 0.75 });
      }
    } catch {
      // Ignore preview errors
    }
  }, []);

  // Render compressed page 1 preview
  const renderCompressedPreview = useCallback(async (resBlob: Blob) => {
    if (!compCanvasRef.current) return;
    try {
      const arrayBuffer = await resBlob.arrayBuffer();
      const pdfDoc = await loadPdfDocument(arrayBuffer);
      if (compCanvasRef.current) {
        await renderPageToCanvas(pdfDoc, 1, compCanvasRef.current, { scale: 0.75 });
      }
    } catch {
      // Ignore preview errors
    }
  }, []);

  // Trigger compression
  const handleCompress = async () => {
    if (!file || !fileBytesRef.current) return;

    setIsProcessing(true);
    setError(null);
    setProgressText('Initializing optimization engine...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let targetKb: number | undefined;
      if (targetSizePreset === 'custom' && customTargetKb) {
        targetKb = parseInt(customTargetKb, 10);
      } else if (targetSizePreset !== 'none') {
        targetKb = parseInt(targetSizePreset, 10);
      }

      const res = await compressPdfDocument(fileBytesRef.current, {
        level,
        customSettings,
        targetFileSizeKb: targetKb,
        signal: controller.signal,
        onProgress: (_curr, _tot, msg) => {
          if (msg) setProgressText(msg);
        },
      });

      setResult(res);
      setTimeout(() => {
        renderCompressedPreview(res.blob);
      }, 50);
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setProgressText('Cancelled.');
      } else {
        setError(err.message || 'Compression failed. Please check the document format.');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleDownloadCompressed = () => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    downloadBlob(result.blob, `${baseName}_compressed.pdf`);
  };

  const handleDownloadOriginal = () => {
    if (!file) return;
    downloadBlob(file, file.name);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    fileBytesRef.current = null;
  };

  return (
    <div className="compress-workspace">
      {/* Top Navigation Bar */}
      <header className="compress-topbar">
        <div className="compress-topbar-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            icon={<ArrowLeft size={16} />}
            aria-label="Back to tools"
          >
            Tools
          </Button>
          <div className="compress-doc-info">
            <h1 className="compress-doc-title">
              {file ? file.name : 'Compress PDF'}
            </h1>
            {file && (
              <span className="compress-size-pill">
                {formatBytes(file.size)}
              </span>
            )}
          </div>
        </div>

        <div className="compress-topbar-right">
          {file && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              icon={<RotateCcw size={15} />}
              disabled={isProcessing}
            >
              Reset
            </Button>
          )}

          {result && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadCompressed}
              icon={<Download size={15} />}
            >
              Download PDF ({formatBytes(result.compressedSize)})
            </Button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      {!file ? (
        <div className="compress-upload-container">
          <div className="compress-hero-box">
            <h2>Compress PDF</h2>
            <p>
              Reduce PDF file size locally inside your browser without uploading files
            </p>
          </div>
          <FileUpload
            tool={tool}
            onFilesSelected={(files) => {
              if (files.length > 0 && files[0]) {
                setFile(files[0]);
              }
            }}
          />
        </div>
      ) : (
        <div className="compress-body">
          {/* Left Controls Panel */}
          <aside className="compress-sidebar">
            <h2 className="compress-sidebar-title">Compression Level</h2>

            <div className="compress-level-tabs" role="tablist">
              <button
                type="button"
                className={`compress-level-tab ${level === 'extreme' ? 'active' : ''}`}
                onClick={() => setLevel('extreme')}
                disabled={isProcessing}
              >
                <div className="tab-header">
                  <span className="tab-name">Extreme</span>
                  <span className="tab-badge">Smallest</span>
                </div>
                <p className="tab-desc">Maximum reduction. Acceptable quality reduction.</p>
              </button>

              <button
                type="button"
                className={`compress-level-tab ${level === 'recommended' ? 'active' : ''}`}
                onClick={() => setLevel('recommended')}
                disabled={isProcessing}
              >
                <div className="tab-header">
                  <span className="tab-name">Recommended</span>
                  <span className="tab-badge popular">Popular</span>
                </div>
                <p className="tab-desc">Balanced file size and high document quality.</p>
              </button>

              <button
                type="button"
                className={`compress-level-tab ${level === 'low' ? 'active' : ''}`}
                onClick={() => setLevel('low')}
                disabled={isProcessing}
              >
                <div className="tab-header">
                  <span className="tab-name">Low</span>
                  <span className="tab-badge">Crisp</span>
                </div>
                <p className="tab-desc">Maximum quality preservation with stream cleanup.</p>
              </button>

              <button
                type="button"
                className={`compress-level-tab ${level === 'custom' ? 'active' : ''}`}
                onClick={() => setLevel('custom')}
                disabled={isProcessing}
              >
                <div className="tab-header">
                  <span className="tab-name">Custom</span>
                  <Sliders size={14} />
                </div>
                <p className="tab-desc">Fine-tune image quality, dimensions, DPI and targets.</p>
              </button>
            </div>

            {/* Custom Settings Accordion */}
            {level === 'custom' && (
              <div className="compress-custom-card">
                <h3 className="custom-card-heading">Custom Optimization</h3>

                {/* Image Quality */}
                <div className="custom-field">
                  <div className="custom-field-label">
                    <span>Image Quality</span>
                    <span className="field-val">{Math.round(customSettings.imageQuality * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="95"
                    step="5"
                    value={Math.round(customSettings.imageQuality * 100)}
                    onChange={(e) =>
                      setCustomSettings({
                        ...customSettings,
                        imageQuality: Number(e.target.value) / 100,
                      })
                    }
                    disabled={isProcessing}
                    aria-label="Image Quality Percentage"
                  />
                </div>

                {/* Max Image Dimension */}
                <div className="custom-field">
                  <label htmlFor="compress-max-dimension" className="custom-field-label">
                    Max Image Dimensions
                  </label>
                  <select
                    id="compress-max-dimension"
                    value={customSettings.maxImageDimension}
                    onChange={(e) =>
                      setCustomSettings({
                        ...customSettings,
                        maxImageDimension: Number(e.target.value),
                      })
                    }
                    disabled={isProcessing}
                  >
                    <option value="0">Original (No limit)</option>
                    <option value="2400">2400px (Print / High Res)</option>
                    <option value="1600">1600px (Desktop Full HD)</option>
                    <option value="1200">1200px (Standard Web)</option>
                    <option value="800">800px (Email / Compact)</option>
                  </select>
                </div>

                {/* DPI Target */}
                <div className="custom-field">
                  <label htmlFor="compress-dpi-target" className="custom-field-label">
                    Resolution (DPI)
                  </label>
                  <select
                    id="compress-dpi-target"
                    value={customSettings.resolutionDpi}
                    onChange={(e) =>
                      setCustomSettings({
                        ...customSettings,
                        resolutionDpi: Number(e.target.value),
                      })
                    }
                    disabled={isProcessing}
                  >
                    <option value="300">300 DPI (Print Quality)</option>
                    <option value="200">200 DPI (High Detail)</option>
                    <option value="150">150 DPI (Balanced)</option>
                    <option value="96">96 DPI (Web Standard)</option>
                    <option value="72">72 DPI (Screen Optimized)</option>
                  </select>
                </div>

                {/* Target File Size */}
                <div className="custom-field">
                  <label htmlFor="compress-target-size" className="custom-field-label">
                    Target File Size (Best Effort)
                  </label>
                  <select
                    id="compress-target-size"
                    value={targetSizePreset}
                    onChange={(e) => setTargetSizePreset(e.target.value)}
                    disabled={isProcessing}
                  >
                    <option value="none">No specific target</option>
                    <option value="100">Under 100 KB</option>
                    <option value="200">Under 200 KB</option>
                    <option value="500">Under 500 KB</option>
                    <option value="1024">Under 1 MB</option>
                    <option value="2048">Under 2 MB</option>
                    <option value="custom">Custom KB...</option>
                  </select>
                  {targetSizePreset === 'custom' && (
                    <input
                      type="number"
                      placeholder="e.g. 350"
                      value={customTargetKb}
                      onChange={(e) => setCustomTargetKb(e.target.value)}
                      className="custom-kb-input"
                      min="50"
                      max="100000"
                      aria-label="Custom Target Size in KB"
                    />
                  )}
                  <p className="field-hint">
                    Uses iterative compression. If the document cannot reach the target size without extreme distortion, best effort is delivered.
                  </p>
                </div>

                {/* Toggles */}
                <div className="custom-toggles">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={customSettings.convertToGrayscale}
                      onChange={(e) =>
                        setCustomSettings({
                          ...customSettings,
                          convertToGrayscale: e.target.checked,
                        })
                      }
                      disabled={isProcessing}
                    />
                    <span>Convert Images to Grayscale</span>
                  </label>

                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={customSettings.removeMetadata}
                      onChange={(e) =>
                        setCustomSettings({
                          ...customSettings,
                          removeMetadata: e.target.checked,
                        })
                      }
                      disabled={isProcessing}
                    />
                    <span>Remove Document Metadata</span>
                  </label>

                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={customSettings.losslessOptimization}
                      onChange={(e) =>
                        setCustomSettings({
                          ...customSettings,
                          losslessOptimization: e.target.checked,
                        })
                      }
                      disabled={isProcessing}
                    />
                    <span>Lossless PDF Stream Packaging</span>
                  </label>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="compress-action-box">
              {isProcessing ? (
                <div className="processing-indicator">
                  <div className="processing-row">
                    <Loader2 size={18} className="spin-icon" />
                    <span>{progressText || 'Compressing document…'}</span>
                  </div>
                  <Button variant="danger" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleCompress}
                  icon={<Zap size={18} />}
                  style={{ width: '100%' }}
                >
                  {result ? 'Recompress PDF' : 'Compress PDF'}
                </Button>
              )}
            </div>
          </aside>

          {/* Right Preview & Result Area */}
          <main className="compress-content">
            {error && (
              <div className="compress-alert error">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {result?.warning && (
              <div className="compress-alert warning">
                <AlertTriangle size={18} />
                <span>{result.warning}</span>
              </div>
            )}

            {/* Result Metrics Banner */}
            {result && (
              <div className="compress-metrics-card">
                <div className="metrics-grid">
                  <div className="metric-item">
                    <span className="metric-label">Original Size</span>
                    <span className="metric-val">{formatBytes(result.originalSize)}</span>
                  </div>

                  <div className="metric-arrow">
                    <ArrowRight size={20} />
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Compressed Size</span>
                    <span className="metric-val highlight">
                      {formatBytes(result.compressedSize)}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Savings</span>
                    <span className={`savings-badge ${result.isAlreadyOptimized ? 'neutral' : 'success'}`}>
                      <TrendingDown size={14} />
                      {result.savingsPercentage > 0
                        ? `-${result.savingsPercentage}%`
                        : '0%'}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Processing Time</span>
                    <span className="metric-val duration">
                      <Clock size={13} /> {(result.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                {result.message && (
                  <div className="result-status-msg">
                    {result.isAlreadyOptimized ? (
                      <Info size={16} className="status-icon info" />
                    ) : (
                      <CheckCircle2 size={16} className="status-icon success" />
                    )}
                    <span>{result.message}</span>
                  </div>
                )}

                <div className="result-actions">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleDownloadCompressed}
                    icon={<Download size={16} />}
                  >
                    Download Compressed PDF
                  </Button>

                  {result.isAlreadyOptimized && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={handleDownloadOriginal}
                      icon={<FileText size={16} />}
                    >
                      Keep Original File
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Visual Quality Preview Section */}
            <section className="compress-preview-section">
              <div className="preview-header">
                <div className="preview-heading-row">
                  <h3>Document Visual Quality Preview</h3>
                  <div className="privacy-pill">
                    <ShieldCheck size={13} />
                    <span>Processed 100% locally</span>
                  </div>
                </div>

                <div className="preview-view-toggle">
                  <button
                    type="button"
                    className={`view-btn ${activePreviewTab === 'compare' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('compare')}
                  >
                    Side-by-Side
                  </button>
                  <button
                    type="button"
                    className={`view-btn ${activePreviewTab === 'compressed' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('compressed')}
                  >
                    Compressed Only
                  </button>
                  <button
                    type="button"
                    className={`view-btn ${activePreviewTab === 'original' ? 'active' : ''}`}
                    onClick={() => setActivePreviewTab('original')}
                  >
                    Original Only
                  </button>
                </div>
              </div>

              <div className={`preview-canvas-container mode-${activePreviewTab}`}>
                {/* Original Preview Box */}
                {(activePreviewTab === 'compare' || activePreviewTab === 'original') && (
                  <div className="preview-box">
                    <div className="preview-box-header">
                      <span>Original Document (Page 1)</span>
                      <span className="badge-orig">{formatBytes(file.size)}</span>
                    </div>
                    <div className="canvas-wrapper">
                      <canvas ref={origCanvasRef} className="preview-canvas" />
                    </div>
                  </div>
                )}

                {/* Compressed Preview Box */}
                {(activePreviewTab === 'compare' || activePreviewTab === 'compressed') && (
                  <div className="preview-box">
                    <div className="preview-box-header">
                      <span>Compressed Document (Page 1)</span>
                      {result ? (
                        <span className="badge-comp">{formatBytes(result.compressedSize)}</span>
                      ) : (
                        <span className="badge-pending">Pending</span>
                      )}
                    </div>
                    <div className="canvas-wrapper">
                      {result ? (
                        <canvas ref={compCanvasRef} className="preview-canvas" />
                      ) : (
                        <div className="empty-preview-placeholder">
                          <Zap size={28} />
                          <p>Click &quot;Compress PDF&quot; to preview optimized output</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      )}
    </div>
  );
};
