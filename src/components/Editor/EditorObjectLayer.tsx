import React, { useRef } from 'react';
import {
  EditorObject,
  TextEditorObject,
  ImageEditorObject,
  ShapeEditorObject,
  DrawingEditorObject,
  HighlightEditorObject,
  NoteEditorObject,
  SignatureEditorObject,
  ResizeHandle,
} from '../../types/editor';
import { pdfToScreen } from '../../services/pdf/editorCoordinates';
import './EditorObjectLayer.css';

interface EditorObjectLayerProps {
  pageNumber: number;
  zoom: number;
  objects: EditorObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string, e: React.MouseEvent) => void;
  onUpdateObject: (updated: EditorObject) => void;
  onStartDrag: (id: string, clientX: number, clientY: number) => void;
  onStartResize: (id: string, handle: ResizeHandle, clientX: number, clientY: number) => void;
  editingTextId: string | null;
  setEditingTextId: (id: string | null) => void;
}

export const EditorObjectLayer: React.FC<EditorObjectLayerProps> = ({
  pageNumber,
  zoom,
  objects,
  selectedObjectId,
  onSelectObject,
  onUpdateObject,
  onStartDrag,
  onStartResize,
  editingTextId,
  setEditingTextId,
}) => {
  const pageObjects = objects.filter((o) => o.pageNumber === pageNumber);
  const layerRef = useRef<HTMLDivElement | null>(null);

  const handlePointerDown = (
    e: React.MouseEvent | React.TouchEvent,
    objId: string,
    isHandle: boolean = false,
    handleType?: ResizeHandle
  ) => {
    e.stopPropagation();
    onSelectObject(objId, e as React.MouseEvent);

    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

    if (isHandle && handleType) {
      onStartResize(objId, handleType, clientX, clientY);
    } else {
      onStartDrag(objId, clientX, clientY);
    }
  };

  return (
    <div ref={layerRef} className="editor-object-layer" style={{ pointerEvents: 'none' }}>
      {pageObjects.map((obj) => {
        const isSelected = selectedObjectId === obj.id;
        const left = pdfToScreen(obj.x, zoom);
        const top = pdfToScreen(obj.y, zoom);
        const width = pdfToScreen(obj.width, zoom);
        const height = pdfToScreen(obj.height, zoom);

        return (
          <div
            key={obj.id}
            className={`editor-object-wrapper ${isSelected ? 'selected' : ''}`}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${Math.max(12, width)}px`,
              height: `${Math.max(12, height)}px`,
              pointerEvents: 'auto',
              transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            }}
            onMouseDown={(e) => handlePointerDown(e, obj.id)}
            onTouchStart={(e) => handlePointerDown(e, obj.id)}
          >
            {/* 1. TEXT OBJECT */}
            {obj.type === 'text' && (() => {
              const textObj = obj as TextEditorObject;
              const isEditing = editingTextId === obj.id;

              return isEditing ? (
                <textarea
                  className="editor-inline-textarea"
                  autoFocus
                  value={textObj.text}
                  onChange={(e) => onUpdateObject({ ...textObj, text: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  style={{
                    fontFamily: textObj.fontFamily,
                    fontSize: `${textObj.fontSize * zoom}px`,
                    color: textObj.color,
                    fontWeight: textObj.isBold ? 'bold' : 'normal',
                    fontStyle: textObj.isItalic ? 'italic' : 'normal',
                    textAlign: textObj.textAlign || 'left',
                    lineHeight: textObj.lineHeight || 1.25,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="editor-rendered-text"
                  onDoubleClick={() => setEditingTextId(obj.id)}
                  style={{
                    fontFamily: textObj.fontFamily,
                    fontSize: `${textObj.fontSize * zoom}px`,
                    color: textObj.color,
                    fontWeight: textObj.isBold ? 'bold' : 'normal',
                    fontStyle: textObj.isItalic ? 'italic' : 'normal',
                    textAlign: textObj.textAlign || 'left',
                    lineHeight: textObj.lineHeight || 1.25,
                    opacity: textObj.opacity ?? 1,
                  }}
                >
                  {textObj.text.split('\n').map((line, i) => (
                    <div key={i}>{line || '\u00A0'}</div>
                  ))}
                </div>
              );
            })()}

            {/* 2. IMAGE OBJECT */}
            {obj.type === 'image' && (() => {
              const imgObj = obj as ImageEditorObject;
              return (
                <img
                  src={imgObj.dataUrl}
                  alt="Inserted Element"
                  className="editor-rendered-image"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    opacity: imgObj.opacity ?? 1,
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                  draggable={false}
                />
              );
            })()}

            {/* 3. SHAPE OBJECT */}
            {(obj.type === 'rectangle' ||
              obj.type === 'circle' ||
              obj.type === 'line' ||
              obj.type === 'arrow') && (() => {
              const shapeObj = obj as ShapeEditorObject;
              const strokeW = Math.max(1, (shapeObj.strokeWidth || 2) * zoom);
              const isFilled = shapeObj.fillColor && shapeObj.fillColor !== 'transparent';

              return (
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${width} ${height}`}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  {shapeObj.type === 'rectangle' && (
                    <rect
                      x={strokeW / 2}
                      y={strokeW / 2}
                      width={Math.max(1, width - strokeW)}
                      height={Math.max(1, height - strokeW)}
                      stroke={shapeObj.strokeColor}
                      strokeWidth={strokeW}
                      fill={isFilled ? shapeObj.fillColor : 'none'}
                      opacity={shapeObj.opacity ?? 1}
                    />
                  )}

                  {shapeObj.type === 'circle' && (
                    <ellipse
                      cx={width / 2}
                      cy={height / 2}
                      rx={Math.max(1, (width - strokeW) / 2)}
                      ry={Math.max(1, (height - strokeW) / 2)}
                      stroke={shapeObj.strokeColor}
                      strokeWidth={strokeW}
                      fill={isFilled ? shapeObj.fillColor : 'none'}
                      opacity={shapeObj.opacity ?? 1}
                    />
                  )}

                  {shapeObj.type === 'line' && (
                    <line
                      x1={0}
                      y1={0}
                      x2={width}
                      y2={height}
                      stroke={shapeObj.strokeColor}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      opacity={shapeObj.opacity ?? 1}
                    />
                  )}

                  {shapeObj.type === 'arrow' && (
                    <g opacity={shapeObj.opacity ?? 1}>
                      <line
                        x1={0}
                        y1={0}
                        x2={width}
                        y2={height}
                        stroke={shapeObj.strokeColor}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                      />
                      {/* Arrowhead */}
                      {(() => {
                        const angle = Math.atan2(height, width);
                        const headLen = Math.max(8, strokeW * 3.5);
                        const a1 = angle - Math.PI / 6;
                        const a2 = angle + Math.PI / 6;
                        return (
                          <>
                            <line
                              x1={width}
                              y1={height}
                              x2={width - headLen * Math.cos(a1)}
                              y2={height - headLen * Math.sin(a1)}
                              stroke={shapeObj.strokeColor}
                              strokeWidth={strokeW}
                              strokeLinecap="round"
                            />
                            <line
                              x1={width}
                              y1={height}
                              x2={width - headLen * Math.cos(a2)}
                              y2={height - headLen * Math.sin(a2)}
                              stroke={shapeObj.strokeColor}
                              strokeWidth={strokeW}
                              strokeLinecap="round"
                            />
                          </>
                        );
                      })()}
                    </g>
                  )}
                </svg>
              );
            })()}

            {/* 4. FREEHAND DRAWING */}
            {obj.type === 'drawing' && (() => {
              const drawObj = obj as DrawingEditorObject;
              const strokeW = Math.max(1, (drawObj.strokeWidth || 2) * zoom);

              const pathData = drawObj.points
                .map((pt, i) => {
                  const ptX = pdfToScreen(pt.x - drawObj.x, zoom);
                  const ptY = pdfToScreen(pt.y - drawObj.y, zoom);
                  return `${i === 0 ? 'M' : 'L'} ${ptX} ${ptY}`;
                })
                .join(' ');

              return (
                <svg
                  width="100%"
                  height="100%"
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  <path
                    d={pathData}
                    fill="none"
                    stroke={drawObj.strokeColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={drawObj.opacity ?? 1}
                  />
                </svg>
              );
            })()}

            {/* 5. HIGHLIGHT OBJECT */}
            {obj.type === 'highlight' && (() => {
              const hlObj = obj as HighlightEditorObject;
              return (
                <div
                  className="editor-rendered-highlight"
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: hlObj.color || '#ffeb3b',
                    opacity: hlObj.opacity ?? 0.35,
                    mixBlendMode: 'multiply',
                  }}
                />
              );
            })()}

            {/* 6. NOTE OBJECT */}
            {obj.type === 'note' && (() => {
              const noteObj = obj as NoteEditorObject;
              const isEditing = editingTextId === obj.id;

              return (
                <div
                  className="editor-rendered-note"
                  style={{
                    backgroundColor: noteObj.bgColor || '#fef3c7',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  <div className="note-pin-bar">Sticky Note</div>
                  {isEditing ? (
                    <textarea
                      className="note-inline-textarea"
                      autoFocus
                      value={noteObj.text}
                      onChange={(e) => onUpdateObject({ ...noteObj, text: e.target.value })}
                      onBlur={() => setEditingTextId(null)}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="note-text-body"
                      onDoubleClick={() => setEditingTextId(obj.id)}
                    >
                      {noteObj.text || 'Double click to edit note...'}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 7. SIGNATURE OBJECT */}
            {obj.type === 'signature' && (() => {
              const sigObj = obj as SignatureEditorObject;
              return (
                <img
                  src={sigObj.dataUrl}
                  alt="Signature"
                  className="editor-rendered-signature"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    opacity: sigObj.opacity ?? 1,
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                  draggable={false}
                />
              );
            })()}

            {/* 8. REDACTION OBJECT */}
            {obj.type === 'redaction' && (
              <div
                className="editor-rendered-redaction"
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#000000',
                  border: isSelected ? '2px dashed #ef4444' : '1px solid #222222',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: `${Math.max(9, Math.round(11 * zoom))}px`,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  userSelect: 'none',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                REDACTED
              </div>
            )}

            {/* SELECTION BOUNDING BOX & 8 RESIZE HANDLES */}
            {isSelected && (
              <div className="selection-frame">
                {/* Handles: nw, n, ne, e, se, s, sw, w */}
                <div
                  className="handle nw"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'nw')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'nw')}
                />
                <div
                  className="handle n"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'n')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'n')}
                />
                <div
                  className="handle ne"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'ne')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'ne')}
                />
                <div
                  className="handle e"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'e')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'e')}
                />
                <div
                  className="handle se"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'se')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'se')}
                />
                <div
                  className="handle s"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 's')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 's')}
                />
                <div
                  className="handle sw"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'sw')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'sw')}
                />
                <div
                  className="handle w"
                  onMouseDown={(e) => handlePointerDown(e, obj.id, true, 'w')}
                  onTouchStart={(e) => handlePointerDown(e, obj.id, true, 'w')}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
