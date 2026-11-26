import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Download,
  Trash2,
  Plus,
  Play,
  RotateCw,
  Stamp,
  Hash,
  Images,
  ScanText,
  FileText,
  Contrast,
  Layers,
  Lock,
  Unlock,
  Archive,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileMinus,
  Save,
  Sliders,
  Loader2,
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { Button } from '../common/Button/Button';
import { formatBytes, downloadBlob } from '../../utils/file';
import { getDeviceCapabilities } from '../../utils/deviceLimits';
import { ingestUserFiles } from '../../services/security/ingestFile';
import {
  BatchItem,
  BatchProcessingOptions,
  executeBatchQueue,
  createBatchZip,
  inspectPdfPageCount,
} from '../../services/pdf/batch';
import {
  BatchOperationType,
  BatchPreset,
  getBatchPresets,
  saveBatchPreset,
  deleteBatchPreset,
} from '../../services/pdf/presets';
import './BatchWorkspace.css';

interface BatchWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
}

export const BatchWorkspace: React.FC<BatchWorkspaceProps> = ({
  onBack,
}) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [operation, setOperation] = useState<BatchOperationType>('compress');
  const [config, setConfig] = useState<Record<string, any>>({
    level: 'recommended',
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [overallProgress, setOverallProgress] = useState<{
    completed: number;
    total: number;
    percent: number;
  }>({ completed: 0, total: 0, percent: 0 });

  // Presets State
  const [presets, setPresets] = useState<BatchPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [showSavePresetModal, setShowSavePresetModal] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [newPresetDesc, setNewPresetDesc] = useState<string>('');

  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load Presets on Mount
  useEffect(() => {
    const loaded = getBatchPresets();
    setPresets(loaded);
  }, []);

  // Handle Preset Selection
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const found = presets.find((p) => p.id === presetId);
    if (found) {
      setOperation(found.operation);
      setConfig({ ...found.config });
    }
  };

  // Add files to batch queue
  const handleAddFiles = async (files: FileList | File[]) => {
    const { validFiles } = await ingestUserFiles(files, '.pdf');
    const newItems: BatchItem[] = validFiles.map((f) => ({
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending',
      progress: 0,
      statusMessage: 'Ready',
    }));

    if (newItems.length === 0) return;

    setItems((prev) => [...prev, ...newItems]);

    // Asynchronously determine page counts
    for (const it of newItems) {
      inspectPdfPageCount(it.file).then((count) => {
        setItems((current) =>
          current.map((curr) => (curr.id === it.id ? { ...curr, pageCount: count } : curr))
        );
      });
    }
  };

  // Start Batch Execution
  const handleStartBatch = async () => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset pending/failed items for execution
    setItems((prev) =>
      prev.map((item) =>
        item.status === 'completed'
          ? item
          : { ...item, status: 'pending', progress: 0, statusMessage: 'Waiting in queue...' }
      )
    );

    const { recommendedMaxConcurrency } = getDeviceCapabilities();
    const options: BatchProcessingOptions = {
      operation,
      config,
      concurrency: recommendedMaxConcurrency,
      signal: controller.signal,
      onItemUpdate: (updated) => {
        setItems((prev) =>
          prev.map((curr) => (curr.id === updated.id ? { ...updated } : curr))
        );
      },
      onOverallProgress: (completed, total, percent) => {
        setOverallProgress({ completed, total, percent });
      },
    };

    try {
      await executeBatchQueue(items, options);
    } catch (err) {
      console.warn('Batch processing stopped:', err);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel Execution
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Retry an individual failed item
  const handleRetryItem = async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || isProcessing) return;

    const resetItem: BatchItem = {
      ...item,
      status: 'pending',
      progress: 0,
      errorMessage: undefined,
      statusMessage: 'Waiting in queue...',
    };

    setItems((prev) => prev.map((i) => (i.id === itemId ? resetItem : i)));

    const options: BatchProcessingOptions = {
      operation,
      config,
      concurrency: 1,
      onItemUpdate: (updated) => {
        setItems((prev) =>
          prev.map((curr) => (curr.id === updated.id ? { ...updated } : curr))
        );
      },
    };

    await executeBatchQueue([resetItem], options);
  };

  // Remove individual item
  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Clear completed jobs
  const handleClearCompleted = () => {
    setItems((prev) => prev.filter((i) => i.status !== 'completed'));
    setOverallProgress({ completed: 0, total: 0, percent: 0 });
  };

  // Download individual result
  const handleDownloadItem = (item: BatchItem) => {
    if (item.resultBlob && item.resultFilename) {
      downloadBlob(item.resultBlob, item.resultFilename);
    }
  };

  // Download all completed items as ZIP
  const handleDownloadZip = async () => {
    const completedItems = items.filter((i) => i.status === 'completed');
    if (completedItems.length === 0) return;

    setIsZipping(true);
    try {
      const zipBlob = await createBatchZip(completedItems);
      const zipName = `KloudPDF_Batch_${operation}_${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(zipBlob, zipName);
    } catch (err: any) {
      alert(`Failed to generate ZIP archive: ${err.message}`);
    } finally {
      setIsZipping(false);
    }
  };

  // Save Current Config as Preset
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    const saved = saveBatchPreset({
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      description: newPresetDesc.trim() || 'Custom batch preset',
      operation,
      config,
      isBuiltIn: false,
    });

    const updated = getBatchPresets();
    setPresets(updated);
    setSelectedPresetId(saved.id);
    setShowSavePresetModal(false);
    setNewPresetName('');
    setNewPresetDesc('');
  };

  const handleDeleteCustomPreset = (presetId: string) => {
    deleteBatchPreset(presetId);
    setPresets(getBatchPresets());
    setSelectedPresetId('');
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;

  return (
    <div className="batch-workspace">
      {/* Top Header */}
      <header className="batch-topbar">
        <div className="batch-topbar-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            icon={<ArrowLeft size={16} />}
            aria-label="Back to tools"
          >
            Tools
          </Button>
          <div className="batch-title-box">
            <h1 className="batch-title">Batch PDF Processing</h1>
            <span className="batch-badge">{items.length} Files</span>
          </div>
        </div>

        <div className="batch-topbar-right">
          {completedCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadZip}
              disabled={isZipping}
              icon={isZipping ? <Loader2 size={15} className="spin-icon" /> : <Archive size={15} />}
            >
              {isZipping ? 'Archiving…' : `Download ZIP (${completedCount})`}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            icon={<Plus size={15} />}
            disabled={isProcessing}
          >
            Add Files
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            accept=".pdf"
            onChange={(e) => {
              if (e.target.files) handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {/* Main Container */}
      <div className="batch-body">
        {/* Left Operation & Preset Configuration Sidebar */}
        <aside className="batch-sidebar">
          {/* Preset Selector */}
          <div className="batch-preset-section">
            <div className="preset-header">
              <label htmlFor="batch-preset-select" className="sidebar-section-label">
                Processing Presets
              </label>
              <button
                type="button"
                className="save-preset-btn"
                onClick={() => setShowSavePresetModal(true)}
                title="Save current settings as preset"
              >
                <Save size={13} /> Save Preset
              </button>
            </div>

            <select
              id="batch-preset-select"
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="preset-select"
              disabled={isProcessing}
            >
              <option value="">Select a preset</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isBuiltIn ? '' : '(Custom)'}
                </option>
              ))}
            </select>

            {selectedPresetId && !presets.find((p) => p.id === selectedPresetId)?.isBuiltIn && (
              <button
                type="button"
                className="delete-preset-btn"
                onClick={() => handleDeleteCustomPreset(selectedPresetId)}
              >
                Delete Selected Preset
              </button>
            )}
          </div>

          {/* Operation Selector */}
          <div className="batch-operation-section">
            <span className="sidebar-section-label">Batch Operation</span>
            <div className="operation-tabs">
              <button
                type="button"
                className={`op-tab ${operation === 'compress' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('compress');
                  setConfig({ level: 'recommended' });
                }}
                disabled={isProcessing}
              >
                <Sliders size={16} /> Compress
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'rotate' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('rotate');
                  setConfig({ angle: 90 });
                }}
                disabled={isProcessing}
              >
                <RotateCw size={16} /> Rotate
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'watermark' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('watermark');
                  setConfig({ text: 'CONFIDENTIAL', opacity: 0.25, color: 'gray' });
                }}
                disabled={isProcessing}
              >
                <Stamp size={16} /> Watermark
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'page-numbers' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('page-numbers');
                  setConfig({ position: 'bottom-center', format: 'Page {n} of {total}' });
                }}
                disabled={isProcessing}
              >
                <Hash size={16} /> Numbers
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'pdf-to-images' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('pdf-to-images');
                  setConfig({ format: 'png', scale: 1.5 });
                }}
                disabled={isProcessing}
              >
                <Images size={16} /> To Images
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'ocr' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('ocr');
                  setConfig({ language: 'eng', generateSearchablePdf: true });
                }}
                disabled={isProcessing}
              >
                <ScanText size={16} /> Run OCR
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'grayscale' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('grayscale');
                  setConfig({ mode: 'standard' });
                }}
                disabled={isProcessing}
              >
                <Contrast size={16} /> Grayscale
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'remove-metadata' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('remove-metadata');
                  setConfig({});
                }}
                disabled={isProcessing}
              >
                <FileMinus size={16} /> Scrub Info
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'flatten' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('flatten');
                  setConfig({});
                }}
                disabled={isProcessing}
              >
                <Layers size={16} /> Flatten
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'protect' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('protect');
                  setConfig({ password: '' });
                }}
                disabled={isProcessing}
              >
                <Lock size={16} /> Protect
              </button>

              <button
                type="button"
                className={`op-tab ${operation === 'unlock' ? 'active' : ''}`}
                onClick={() => {
                  setOperation('unlock');
                  setConfig({ password: '' });
                }}
                disabled={isProcessing}
              >
                <Unlock size={16} /> Unlock
              </button>
            </div>
          </div>

          {/* Operation Parameters */}
          <div className="batch-config-card">
            <span className="sidebar-section-label">Operation Parameters</span>

            {operation === 'compress' && (
              <div className="config-fields">
                <label htmlFor="batch-compression-level" className="cfg-label">
                  Compression Level
                </label>
                <select
                  id="batch-compression-level"
                  value={config.level || 'recommended'}
                  onChange={(e) => setConfig({ ...config, level: e.target.value })}
                  disabled={isProcessing}
                >
                  <option value="extreme">Extreme (Smallest Size)</option>
                  <option value="recommended">Recommended (Balanced)</option>
                  <option value="low">Low (High Quality)</option>
                </select>

                <label htmlFor="batch-target-size" className="cfg-label">
                  Target File Size (Best Effort)
                </label>
                <select
                  id="batch-target-size"
                  value={config.targetFileSizeKb || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      targetFileSizeKb: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  disabled={isProcessing}
                >
                  <option value="">No target size</option>
                  <option value="200">Under 200 KB</option>
                  <option value="500">Under 500 KB</option>
                  <option value="1024">Under 1 MB</option>
                  <option value="2048">Under 2 MB</option>
                </select>
              </div>
            )}

            {operation === 'rotate' && (
              <div className="config-fields">
                <label htmlFor="batch-rotate-angle" className="cfg-label">
                  Rotation Angle
                </label>
                <select
                  id="batch-rotate-angle"
                  value={config.angle || 90}
                  onChange={(e) => setConfig({ ...config, angle: Number(e.target.value) })}
                  disabled={isProcessing}
                >
                  <option value="90">90° Clockwise</option>
                  <option value="180">180° Inverted</option>
                  <option value="270">270° Counter-Clockwise</option>
                </select>
              </div>
            )}

            {operation === 'watermark' && (
              <div className="config-fields">
                <label htmlFor="batch-watermark-text" className="cfg-label">
                  Watermark Text
                </label>
                <input
                  id="batch-watermark-text"
                  type="text"
                  value={config.text || ''}
                  onChange={(e) => setConfig({ ...config, text: e.target.value })}
                  placeholder="CONFIDENTIAL"
                  disabled={isProcessing}
                />
                <label htmlFor="batch-watermark-color" className="cfg-label">
                  Color
                </label>
                <select
                  id="batch-watermark-color"
                  value={config.color || 'gray'}
                  onChange={(e) => setConfig({ ...config, color: e.target.value })}
                  disabled={isProcessing}
                >
                  <option value="gray">Subtle Gray</option>
                  <option value="red">Urgent Red</option>
                  <option value="blue">Corporate Blue</option>
                  <option value="black">Bold Black</option>
                </select>
              </div>
            )}

            {operation === 'page-numbers' && (
              <div className="config-fields">
                <label htmlFor="batch-page-position" className="cfg-label">
                  Position
                </label>
                <select
                  id="batch-page-position"
                  value={config.position || 'bottom-center'}
                  onChange={(e) => setConfig({ ...config, position: e.target.value })}
                  disabled={isProcessing}
                >
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-center">Top Center</option>
                </select>
              </div>
            )}

            {operation === 'ocr' && (
              <div className="config-fields">
                <label htmlFor="batch-ocr-language" className="cfg-label">
                  OCR Language
                </label>
                <select
                  id="batch-ocr-language"
                  value={config.language || 'eng'}
                  onChange={(e) => setConfig({ ...config, language: e.target.value })}
                  disabled={isProcessing}
                >
                  <option value="eng">English</option>
                  <option value="hin">Hindi (हिन्दी)</option>
                  <option value="spa">Spanish (Español)</option>
                  <option value="fra">French (Français)</option>
                  <option value="deu">German (Deutsch)</option>
                </select>
              </div>
            )}

            {(operation === 'protect' || operation === 'unlock') && (
              <div className="config-fields">
                <label htmlFor="batch-password-input" className="cfg-label">
                  {operation === 'protect' ? 'Encryption Password' : 'Authorized Document Password'}
                </label>
                <input
                  id="batch-password-input"
                  type="password"
                  placeholder="Enter password..."
                  value={config.password || ''}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  disabled={isProcessing}
                />
              </div>
            )}

            {(operation === 'grayscale' ||
              operation === 'remove-metadata' ||
              operation === 'flatten' ||
              operation === 'pdf-to-images') && (
              <p className="cfg-info-note">
                Standard options active. Ready to apply to all selected documents.
              </p>
            )}
          </div>

          {/* Action Trigger */}
          <div className="batch-action-panel">
            {isProcessing ? (
              <Button
                variant="danger"
                size="lg"
                onClick={handleCancel}
                style={{ width: '100%' }}
                icon={<XCircle size={18} />}
              >
                Cancel Processing
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleStartBatch}
                disabled={items.length === 0}
                style={{ width: '100%' }}
                icon={<Play size={18} />}
              >
                Process Batch ({items.length})
              </Button>
            )}
          </div>
        </aside>

        {/* Right Batch File Queue Management Area */}
        <main
          className={`batch-main ${isDraggingOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
          }}
        >
          {/* Queue Overview & Progress Bar */}
          <div className="batch-progress-card">
            <div className="progress-top-row">
              <div className="progress-stats">
                <span className="stats-label">Batch Progress:</span>
                <span className="stats-val">
                  {overallProgress.completed} of {items.length} Completed
                </span>
              </div>
              {completedCount > 0 && !isProcessing && (
                <button
                  type="button"
                  className="clear-completed-link"
                  onClick={handleClearCompleted}
                >
                  Clear Completed
                </button>
              )}
            </div>

            <div className="overall-progress-bar-bg">
              <div
                className="overall-progress-bar-fill"
                style={{ width: `${overallProgress.percent}%` }}
              />
            </div>
          </div>

          {/* Files List Table */}
          {items.length === 0 ? (
            <div
              className="batch-empty-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={44} className="drop-icon" />
              <h3>Drag and drop multiple PDF files here</h3>
              <p>Or click to browse from your device. 100% private in-browser batch processing.</p>
            </div>
          ) : (
            <div className="batch-items-container">
              {items.map((item, idx) => (
                <div key={item.id} className={`batch-item-card status-${item.status}`}>
                  <div className="item-num">{idx + 1}</div>

                  <div className="item-details">
                    <div className="item-name-row">
                      <span className="item-filename" title={item.name}>
                        {item.name}
                      </span>
                      <span className="item-size-badge">{formatBytes(item.size)}</span>
                      {item.pageCount && (
                        <span className="item-pages-badge">{item.pageCount} pgs</span>
                      )}
                    </div>

                    {/* Progress Bar for Active Processing */}
                    {item.status === 'processing' && (
                      <div className="item-progress-track">
                        <div
                          className="item-progress-fill"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Status & Error Messages */}
                    <div className="item-status-row">
                      <span className={`status-badge ${item.status}`}>
                        {item.status === 'completed' && <CheckCircle2 size={13} />}
                        {item.status === 'failed' && <AlertCircle size={13} />}
                        {item.status === 'processing' && (
                          <Loader2 size={13} className="spin-icon" />
                        )}
                        {item.statusMessage || item.status}
                      </span>

                      {item.durationMs && (
                        <span className="item-duration">
                          <Clock size={12} /> {(item.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}

                      {item.processedSize && (
                        <span className="item-processed-size">
                          Output: {formatBytes(item.processedSize)}
                        </span>
                      )}

                      {item.errorMessage && (
                        <span className="item-error-msg" title={item.errorMessage}>
                          {item.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="item-actions">
                    {item.status === 'completed' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleDownloadItem(item)}
                        icon={<Download size={14} />}
                      >
                        Download
                      </Button>
                    )}

                    {item.status === 'failed' && !isProcessing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryItem(item.id)}
                        icon={<RefreshCw size={14} />}
                      >
                        Retry
                      </Button>
                    )}

                    {!isProcessing && (
                      <button
                        type="button"
                        className="remove-item-btn"
                        onClick={() => handleRemoveItem(item.id)}
                        title="Remove file"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="modal-backdrop">
          <div className="preset-modal-card">
            <h3>Save Configuration as Preset</h3>
            <p className="modal-desc">
              Reusable presets store non-sensitive preferences locally in your browser.
            </p>

            <label htmlFor="new-preset-name-input" className="modal-label">
              Preset Name
            </label>
            <input
              id="new-preset-name-input"
              type="text"
              placeholder="e.g. Invoicing Compression"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="modal-input"
            />

            <label htmlFor="new-preset-desc-input" className="modal-label">
              Description (Optional)
            </label>
            <input
              id="new-preset-desc-input"
              type="text"
              placeholder="e.g. Under 500KB with standard watermark"
              value={newPresetDesc}
              onChange={(e) => setNewPresetDesc(e.target.value)}
              className="modal-input"
            />

            <div className="modal-buttons">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSavePresetModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
              >
                Save Preset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
