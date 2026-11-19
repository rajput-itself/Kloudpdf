import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  EditorObject,
  EditorToolMode,
  PageDimension,
  Point2D,
  ResizeHandle,
} from '../../types/editor';
import { EditorObjectLayer } from './EditorObjectLayer';
import {
  getPdfPointFromEvent,
  pdfToScreen,
  calculatePointsBoundingBox,
} from '../../services/pdf/editorCoordinates';
import { renderPageToCanvas } from '../../services/pdf/render';
import './EditorCanvas.css';

interface EditorCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageDimensions: PageDimension[];
  zoom: number;
  activeMode: EditorToolMode;
  objects: EditorObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onAddObject: (newObj: EditorObject) => void;
  onUpdateObject: (updated: EditorObject) => void;
  currentPage: number;
  onPageVisible: (pageNumber: number) => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  pdfDoc,
  pageDimensions,
  zoom,
  activeMode,
  objects,
  selectedObjectId,
  onSelectObject,
  onAddObject,
  onUpdateObject,
  onPageVisible,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Interaction State
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Dragging existing object
  const [dragState, setDragState] = useState<{
    objId: string;
    startClientX: number;
    startClientY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  // Resizing existing object
  const [resizeState, setResizeState] = useState<{
    objId: string;
    handle: ResizeHandle;
    startClientX: number;
    startClientY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    aspectRatio?: number;
  } | null>(null);

  // Live drawing / dragging for creating new elements
  const [creationState, setCreationState] = useState<{
    pageNumber: number;
    startPt: Point2D;
    currentPt: Point2D;
    points?: Point2D[];
  } | null>(null);

  // Render PDF pages on canvas whenever zoom or document changes
  useEffect(() => {
    let isCancelled = false;

    pageDimensions.forEach(async (dim) => {
      const canvas = canvasRefs.current.get(dim.pageNumber);
      if (!canvas) return;

      try {
        await renderPageToCanvas(pdfDoc, dim.pageNumber, canvas, {
          scale: zoom,
        });
      } catch (err) {
        if (!isCancelled) {
          console.error(`Failed to render page ${dim.pageNumber}:`, err);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageDimensions, zoom]);

  // Track page scroll to update active page thumbnail indicator
  const handleScroll = () => {
    if (!containerRef.current) return;
    const containerTop = containerRef.current.scrollTop + 100;

    for (const dim of pageDimensions) {
      const pageEl = document.getElementById(`editor-page-${dim.pageNumber}`);
      if (pageEl) {
        const offsetTop = pageEl.offsetTop;
        const height = pageEl.offsetHeight;
        if (containerTop >= offsetTop && containerTop <= offsetTop + height) {
          onPageVisible(dim.pageNumber);
          break;
        }
      }
    }
  };

  // Drag Start for Object Movement
  const handleStartDrag = (objId: string, clientX: number, clientY: number) => {
    const obj = objects.find((o) => o.id === objId);
    if (!obj) return;

    setDragState({
      objId,
      startClientX: clientX,
      startClientY: clientY,
      originalX: obj.x,
      originalY: obj.y,
    });
  };

  // Start Resizing Object
  const handleStartResize = (
    objId: string,
    handle: ResizeHandle,
    clientX: number,
    clientY: number
  ) => {
    const obj = objects.find((o) => o.id === objId);
    if (!obj) return;

    setResizeState({
      objId,
      handle,
      startClientX: clientX,
      startClientY: clientY,
      originalX: obj.x,
      originalY: obj.y,
      originalWidth: obj.width,
      originalHeight: obj.height,
      aspectRatio: obj.type === 'image' ? obj.width / obj.height : undefined,
    });
  };

  // Helper to extract clientX/clientY from Mouse or Touch events
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { clientX: e.touches[0]!.clientX, clientY: e.touches[0]!.clientY };
    }
    const me = e as React.MouseEvent;
    return { clientX: me.clientX, clientY: me.clientY };
  };

  // Creation: Pointer Down on Page
  const handlePagePointerDown = (
    pageNumber: number,
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (activeMode === 'select') {
      onSelectObject(null);
      setEditingTextId(null);
      return;
    }

    const { clientX, clientY } = getCoords(e);
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = getPdfPointFromEvent(clientX, clientY, rect, zoom);

    if (activeMode === 'text') {
      const newId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      onAddObject({
        id: newId,
        pageNumber,
        type: 'text',
        x: pt.x,
        y: pt.y,
        width: 180,
        height: 36,
        text: 'Add heading or text',
        fontFamily: 'Helvetica',
        fontSize: 16,
        color: '#202124',
        isBold: false,
        isItalic: false,
        lineHeight: 1.25,
      });
      setEditingTextId(newId);
      return;
    }

    if (activeMode === 'note') {
      const newId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      onAddObject({
        id: newId,
        pageNumber,
        type: 'note',
        x: pt.x,
        y: pt.y,
        width: 140,
        height: 90,
        text: 'Note text...',
        bgColor: '#fef3c7',
        textColor: '#202124',
        isOpen: true,
      });
      setEditingTextId(newId);
      return;
    }

    // Shapes, drawing, highlight: start drag creation
    setCreationState({
      pageNumber,
      startPt: pt,
      currentPt: pt,
      points: activeMode === 'drawing' ? [pt] : undefined,
    });
  };

  // Global Pointer Move
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getCoords(e);

    // 1. Moving Object
    if (dragState) {
      const deltaX = (clientX - dragState.startClientX) / zoom;
      const deltaY = (clientY - dragState.startClientY) / zoom;
      const obj = objects.find((o) => o.id === dragState.objId);
      if (obj) {
        onUpdateObject({
          ...obj,
          x: Math.round(dragState.originalX + deltaX),
          y: Math.round(dragState.originalY + deltaY),
        });
      }
      return;
    }

    // 2. Resizing Object
    if (resizeState) {
      const deltaX = (clientX - resizeState.startClientX) / zoom;
      const deltaY = (clientY - resizeState.startClientY) / zoom;
      const obj = objects.find((o) => o.id === resizeState.objId);
      if (!obj) return;

      let newX = resizeState.originalX;
      let newY = resizeState.originalY;
      let newW = resizeState.originalWidth;
      let newH = resizeState.originalHeight;

      const handle = resizeState.handle;

      if (handle.includes('e')) newW = Math.max(15, resizeState.originalWidth + deltaX);
      if (handle.includes('s')) newH = Math.max(15, resizeState.originalHeight + deltaY);
      if (handle.includes('w')) {
        const potentialW = resizeState.originalWidth - deltaX;
        if (potentialW > 15) {
          newW = potentialW;
          newX = resizeState.originalX + deltaX;
        }
      }
      if (handle.includes('n')) {
        const potentialH = resizeState.originalHeight - deltaY;
        if (potentialH > 15) {
          newH = potentialH;
          newY = resizeState.originalY + deltaY;
        }
      }

      // Aspect ratio lock for images
      if (resizeState.aspectRatio) {
        if (handle.includes('e') || handle.includes('w')) {
          newH = newW / resizeState.aspectRatio;
        } else {
          newW = newH * resizeState.aspectRatio;
        }
      }

      onUpdateObject({
        ...obj,
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
      return;
    }

    // 3. Creating New Element
    if (creationState) {
      const pageEl = document.getElementById(`editor-page-${creationState.pageNumber}`);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const pt = getPdfPointFromEvent(clientX, clientY, rect, zoom);

      if (activeMode === 'drawing') {
        setCreationState((prev) => (prev ? {
          ...prev,
          currentPt: pt,
          points: [...(prev.points || []), pt],
        } : null));
      } else {
        setCreationState((prev) => (prev ? { ...prev, currentPt: pt } : null));
      }
    }
  };

  // Global Pointer Up
  const handlePointerUp = () => {
    if (dragState) {
      setDragState(null);
    }

    if (resizeState) {
      setResizeState(null);
    }

    if (creationState) {
      const { pageNumber, startPt, currentPt, points } = creationState;
      const newId = `${activeMode}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (activeMode === 'drawing' && points && points.length > 1) {
        const bbox = calculatePointsBoundingBox(points);
        onAddObject({
          id: newId,
          pageNumber,
          type: 'drawing',
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          points,
          strokeColor: '#1a73e8',
          strokeWidth: 2.5,
        });
      } else if (activeMode === 'rectangle' || activeMode === 'circle') {
        const x = Math.min(startPt.x, currentPt.x);
        const y = Math.min(startPt.y, currentPt.y);
        const width = Math.max(20, Math.abs(currentPt.x - startPt.x));
        const height = Math.max(20, Math.abs(currentPt.y - startPt.y));

        onAddObject({
          id: newId,
          pageNumber,
          type: activeMode,
          x,
          y,
          width,
          height,
          strokeColor: '#1a73e8',
          strokeWidth: 2,
          fillColor: 'transparent',
        });
      } else if (activeMode === 'line' || activeMode === 'arrow') {
        const x = Math.min(startPt.x, currentPt.x);
        const y = Math.min(startPt.y, currentPt.y);
        const width = Math.max(20, Math.abs(currentPt.x - startPt.x));
        const height = Math.max(10, Math.abs(currentPt.y - startPt.y));

        onAddObject({
          id: newId,
          pageNumber,
          type: activeMode,
          x,
          y,
          width,
          height,
          strokeColor: '#1a73e8',
          strokeWidth: 2.5,
          fillColor: 'transparent',
        });
      } else if (activeMode === 'highlight') {
        const x = Math.min(startPt.x, currentPt.x);
        const y = Math.min(startPt.y, currentPt.y);
        const width = Math.max(30, Math.abs(currentPt.x - startPt.x));
        const height = Math.max(14, Math.abs(currentPt.y - startPt.y));

        onAddObject({
          id: newId,
          pageNumber,
          type: 'highlight',
          x,
          y,
          width,
          height,
          color: '#ffeb3b',
          opacity: 0.35,
        });
      }

      setCreationState(null);
    }
  };

  return (
    <main
      ref={containerRef}
      className={`editor-canvas-viewport ${activeMode !== 'select' ? 'mode-active' : ''}`}
      onScroll={handleScroll}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      tabIndex={0}
      aria-label="PDF Document Pages Canvas"
    >
      <div className="editor-pages-scroll-stack">
        {pageDimensions.map((dim) => {
          const widthPx = pdfToScreen(dim.width, zoom);
          const heightPx = pdfToScreen(dim.height, zoom);

          return (
            <div
              key={dim.pageNumber}
              id={`editor-page-${dim.pageNumber}`}
              className="editor-page-card"
              style={{
                width: `${widthPx}px`,
                height: `${heightPx}px`,
              }}
              onMouseDown={(e) => handlePagePointerDown(dim.pageNumber, e)}
              onTouchStart={(e) => handlePagePointerDown(dim.pageNumber, e)}
            >
              {/* Page Number Tag */}
              <div className="editor-page-tag" aria-hidden="true">
                Page {dim.pageNumber}
              </div>

              {/* Underlying rendered PDF page canvas */}
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(dim.pageNumber, el);
                }}
                className="pdf-page-canvas"
                style={{
                  width: `${widthPx}px`,
                  height: `${heightPx}px`,
                }}
              />

              {/* Interactive Object Layer */}
              <EditorObjectLayer
                pageNumber={dim.pageNumber}
                zoom={zoom}
                objects={objects}
                selectedObjectId={selectedObjectId}
                onSelectObject={(id) => onSelectObject(id)}
                onUpdateObject={onUpdateObject}
                onStartDrag={handleStartDrag}
                onStartResize={handleStartResize}
                editingTextId={editingTextId}
                setEditingTextId={setEditingTextId}
              />

              {/* Live creation preview overlay */}
              {creationState && creationState.pageNumber === dim.pageNumber && (
                <div className="editor-creation-overlay" style={{ pointerEvents: 'none' }}>
                  {activeMode === 'drawing' && creationState.points && (
                    <svg
                      width="100%"
                      height="100%"
                      style={{ position: 'absolute', top: 0, left: 0 }}
                    >
                      <path
                        d={creationState.points
                          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pdfToScreen(pt.x, zoom)} ${pdfToScreen(pt.y, zoom)}`)
                          .join(' ')}
                        fill="none"
                        stroke="#1a73e8"
                        strokeWidth={2.5 * zoom}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}

                  {activeMode !== 'drawing' && (
                    <div
                      className="creation-box-preview"
                      style={{
                        position: 'absolute',
                        left: `${pdfToScreen(Math.min(creationState.startPt.x, creationState.currentPt.x), zoom)}px`,
                        top: `${pdfToScreen(Math.min(creationState.startPt.y, creationState.currentPt.y), zoom)}px`,
                        width: `${pdfToScreen(Math.abs(creationState.currentPt.x - creationState.startPt.x), zoom)}px`,
                        height: `${pdfToScreen(Math.abs(creationState.currentPt.y - creationState.startPt.y), zoom)}px`,
                        backgroundColor: activeMode === 'highlight' ? 'rgba(255, 235, 59, 0.35)' : 'rgba(26, 115, 232, 0.08)',
                        border: '1.5px dashed var(--color-primary)',
                        borderRadius: activeMode === 'circle' ? '50%' : '2px',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
};
