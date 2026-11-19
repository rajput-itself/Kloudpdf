import React from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../common/Button/Button';
import './EditorTopBar.css';

interface EditorTopBarProps {
  documentName: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number; // 0.5 to 2.0
  onZoomChange: (newZoom: number) => void;
  onFitWidth: () => void;
  onResetZoom: () => void;
  onDownload: () => void;
  onBack: () => void;
  onResetEdits: () => void;
  isExporting: boolean;
  hasEdits: boolean;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  documentName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onFitWidth,
  onResetZoom,
  onDownload,
  onBack,
  onResetEdits,
  isExporting,
  hasEdits,
}) => {
  const zoomPercentage = Math.round(zoom * 100);

  const handleZoomIn = () => {
    onZoomChange(Math.min(2.5, zoom + 0.15));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(0.4, zoom - 0.15));
  };

  return (
    <header className="editor-topbar">
      {/* Left section: Back navigation & document title */}
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-back-btn"
          onClick={onBack}
          title="Back to PDF Tools"
          aria-label="Back to PDF Tools"
        >
          <ArrowLeft size={18} />
          <span className="back-text">Tools</span>
        </button>

        <div className="topbar-divider" />

        <div className="topbar-doc-info" title={documentName}>
          <FileText size={18} className="doc-icon text-primary" />
          <span className="doc-title">{documentName || 'Document.pdf'}</span>
          {hasEdits && <span className="doc-unsaved-badge">Modified</span>}
        </div>
      </div>

      {/* Middle section: History & Zoom controls */}
      <div className="topbar-center">
        {/* Undo / Redo */}
        <div className="topbar-history-group">
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z / ⌘Z)"
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z / ⌘Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={17} />
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Zoom controls */}
        <div className="topbar-zoom-group">
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={handleZoomOut}
            disabled={zoom <= 0.45}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>

          <button
            type="button"
            className="topbar-zoom-label-btn"
            onClick={onResetZoom}
            title="Click to reset to 100%"
          >
            {zoomPercentage}%
          </button>

          <button
            type="button"
            className="topbar-icon-btn"
            onClick={handleZoomIn}
            disabled={zoom >= 2.45}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onFitWidth}
            title="Fit to Page Width"
            aria-label="Fit to Width"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* Right section: Reset edits & Download PDF */}
      <div className="topbar-right">
        {hasEdits && (
          <button
            type="button"
            className="topbar-reset-btn"
            onClick={onResetEdits}
            title="Clear all inserted elements"
          >
            <RotateCcw size={14} />
            <span className="reset-text">Reset Edits</span>
          </button>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={onDownload}
          disabled={isExporting}
          icon={<Download size={16} />}
          isLoading={isExporting}
        >
          {isExporting ? (
            'Exporting...'
          ) : (
            <>
              <span className="download-text-full">Download PDF</span>
              <span className="download-text-short">Export</span>
            </>
          )}
        </Button>
      </div>
    </header>
  );
};
