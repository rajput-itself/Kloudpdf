import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { RotateCw, Trash2, Check } from 'lucide-react';
import { renderPageToCanvas } from '../../services/pdf/render';
import './PDFPreview.css';

interface PDFPageThumbnailProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number; // 1-indexed
  rotation?: number; // 0, 90, 180, 270
  selected?: boolean;
  selectable?: boolean;
  showRotate?: boolean;
  showDelete?: boolean;
  onSelect?: (pageNumber: number) => void;
  onRotate?: (pageNumber: number) => void;
  onDelete?: (pageNumber: number) => void;
}

export const PDFPageThumbnail: React.FC<PDFPageThumbnailProps> = ({
  pdfDoc,
  pageNumber,
  rotation = 0,
  selected = false,
  selectable = false,
  showRotate = false,
  showDelete = false,
  onSelect,
  onRotate,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function renderThumbnail() {
      if (!canvasRef.current) return;
      setIsLoading(true);
      setRenderError(false);

      try {
        await renderPageToCanvas(pdfDoc, pageNumber, canvasRef.current, {
          scale: 0.35,
          rotation,
        });
        if (!isCancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error(`Failed to render thumbnail for page ${pageNumber}:`, err);
        if (!isCancelled) {
          setRenderError(true);
          setIsLoading(false);
        }
      }
    }

    renderThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNumber, rotation]);

  return (
    <div
      className={`page-thumbnail-card ${selected ? 'is-selected' : ''} ${selectable ? 'is-selectable' : ''}`}
      onClick={() => selectable && onSelect && onSelect(pageNumber)}
      role={selectable ? 'checkbox' : undefined}
      aria-checked={selectable ? selected : undefined}
      aria-label={`Page ${pageNumber}`}
    >
      <div className="thumbnail-canvas-container">
        {isLoading && <div className="thumbnail-skeleton" />}
        {renderError ? (
          <div className="thumbnail-error">Page {pageNumber}</div>
        ) : (
          <canvas ref={canvasRef} className="thumbnail-canvas" />
        )}

        {selectable && (
          <div className={`thumbnail-checkbox ${selected ? 'checked' : ''}`}>
            {selected && <Check size={12} strokeWidth={3} />}
          </div>
        )}
      </div>

      <div className="thumbnail-footer">
        <span className="thumbnail-page-number">{pageNumber}</span>

        <div className="thumbnail-actions" onClick={(e) => e.stopPropagation()}>
          {showRotate && onRotate && (
            <button
              type="button"
              className="thumbnail-action-btn"
              onClick={() => onRotate(pageNumber)}
              title="Rotate page 90°"
              aria-label={`Rotate page ${pageNumber}`}
            >
              <RotateCw size={14} />
            </button>
          )}

          {showDelete && onDelete && (
            <button
              type="button"
              className="thumbnail-action-btn thumbnail-delete-btn"
              onClick={() => onDelete(pageNumber)}
              title="Delete page"
              aria-label={`Delete page ${pageNumber}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
