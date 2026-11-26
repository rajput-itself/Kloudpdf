import React, { useState } from 'react';
import { Columns, X, RotateCcw, Check, AlertTriangle, Layers, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '../common/Button/Button';
import { ContentEditState, EditorObject } from '../../types/editor';
import './BeforeAfterModal.css';

interface BeforeAfterModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalThumbnail?: string;
  editedThumbnail?: string;
  currentPage: number;
  contentEdits: ContentEditState;
  objects: EditorObject[];
  onRevertAllChanges: () => void;
}

export const BeforeAfterModal: React.FC<BeforeAfterModalProps> = ({
  isOpen,
  onClose,
  originalThumbnail,
  editedThumbnail,
  currentPage,
  contentEdits,
  objects,
  onRevertAllChanges,
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'original' | 'edited'>('split');

  if (!isOpen) return null;

  const modifiedTextsList = Object.values(contentEdits.modifiedTexts);
  const modifiedImagesList = Object.values(contentEdits.modifiedImages);

  const deletedTexts = modifiedTextsList.filter((t) => t.isDeleted);
  const replacedTexts = modifiedTextsList.filter((t) => t.isModified && !t.isDeleted);
  const deletedImages = modifiedImagesList.filter((img) => img.isDeleted);
  const replacedImages = modifiedImagesList.filter((img) => img.replacementDataUrl);

  const totalModifications =
    deletedTexts.length + replacedTexts.length + deletedImages.length + replacedImages.length + objects.length;

  return (
    <div className="diff-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="diff-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <div className="diff-modal-title">
            <Columns size={18} className="text-primary" />
            <span>Before & After Preview (Page {currentPage})</span>
          </div>
          <button className="diff-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* View Mode Switcher */}
        <div className="diff-view-switcher">
          <button
            type="button"
            className={`diff-switch-tab ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Side by Side
          </button>
          <button
            type="button"
            className={`diff-switch-tab ${viewMode === 'original' ? 'active' : ''}`}
            onClick={() => setViewMode('original')}
          >
            Original
          </button>
          <button
            type="button"
            className={`diff-switch-tab ${viewMode === 'edited' ? 'active' : ''}`}
            onClick={() => setViewMode('edited')}
          >
            Edited Version
          </button>
        </div>

        {/* Preview Canvas Area */}
        <div className="diff-preview-container">
          {(viewMode === 'split' || viewMode === 'original') && (
            <div className="diff-preview-pane">
              <span className="diff-pane-badge badge-orig">Original</span>
              <div className="diff-img-wrapper">
                {originalThumbnail ? (
                  <img src={originalThumbnail} alt="Original Page Preview" />
                ) : (
                  <div className="diff-placeholder">Loading original page preview...</div>
                )}
              </div>
            </div>
          )}

          {(viewMode === 'split' || viewMode === 'edited') && (
            <div className="diff-preview-pane">
              <span className="diff-pane-badge badge-edited">Edited</span>
              <div className="diff-img-wrapper">
                {editedThumbnail || originalThumbnail ? (
                  <img src={editedThumbnail || originalThumbnail} alt="Edited Page Preview" />
                ) : (
                  <div className="diff-placeholder">Loading edited preview...</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Changes Summary Ledger */}
        <div className="diff-summary-panel">
          <h4 className="diff-summary-title">Summary of Document Changes:</h4>
          <div className="diff-chips-row">
            <div className="diff-chip">
              <FileText size={14} className="text-primary" />
              <span>{replacedTexts.length} text{replacedTexts.length === 1 ? '' : 's'} replaced</span>
            </div>
            <div className="diff-chip">
              <AlertTriangle size={14} className="text-danger" />
              <span>{deletedTexts.length} text{deletedTexts.length === 1 ? '' : 's'} removed</span>
            </div>
            <div className="diff-chip">
              <ImageIcon size={14} className="text-primary" />
              <span>
                {replacedImages.length + deletedImages.length} image modification
                {replacedImages.length + deletedImages.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="diff-chip">
              <Layers size={14} className="text-primary" />
              <span>{objects.length} overlay element{objects.length === 1 ? '' : 's'} added</span>
            </div>
          </div>

          {/* List specific modifications */}
          <div className="diff-detail-list">
            {replacedTexts.slice(0, 3).map((item) => (
              <div key={item.id} className="diff-detail-item">
                <span className="diff-action-tag tag-replace">Replaced:</span>
                <span className="diff-text-old">&quot;{item.originalText}&quot;</span>
                <span className="diff-arrow">→</span>
                <span className="diff-text-new">&quot;{item.text}&quot;</span>
              </div>
            ))}
            {deletedTexts.slice(0, 3).map((item) => (
              <div key={item.id} className="diff-detail-item">
                <span className="diff-action-tag tag-delete">Deleted:</span>
                <span className="diff-text-old">&quot;{item.originalText}&quot;</span>
              </div>
            ))}
          </div>
        </div>

        <div className="diff-modal-footer">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm('Are you sure you want to revert all text and content changes?')) {
                onRevertAllChanges();
                onClose();
              }
            }}
            disabled={totalModifications === 0}
            icon={<RotateCcw size={14} />}
          >
            Revert All Changes
          </Button>

          <Button variant="primary" size="sm" onClick={onClose} icon={<Check size={14} />}>
            Continue Editing
          </Button>
        </div>
      </div>
    </div>
  );
};
