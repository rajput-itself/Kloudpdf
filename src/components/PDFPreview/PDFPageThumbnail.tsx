import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { RotateCw, Trash2, Check } from 'lucide-react';
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
    // Track active render task to cancel safely on rapid rotation or unmount
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null;

    async function renderThumbnail() {
      if (!canvasRef.current) return;
      setIsLoading(true);
      setRenderError(false);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const scale = 0.35;
        const viewport = page.getViewport({
          scale,
          rotation: (page.rotate + rotation) % 360,
        });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Cap devicePixelRatio at 2 to maximize performance & reduce RAM on high-DPI mobile screens
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.save();
        context.scale(outputScale, outputScale);

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });

        await renderTask.promise;
        context.restore();

        if (!isCancelled) {
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          err.name === 'RenderingCancelledException'
        ) {
          // Expected cancellation when rotating or re-rendering
          return;
        }
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
      if (renderTask) {
        renderTask.cancel();
      }
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
