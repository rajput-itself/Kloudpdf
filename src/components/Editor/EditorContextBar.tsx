import React, { useRef } from 'react';
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  RotateCw,
  Upload,
  Info,
} from 'lucide-react';
import {
  EditorObject,
  TextEditorObject,
  ImageEditorObject,
  ShapeEditorObject,
  DrawingEditorObject,
  HighlightEditorObject,
  NoteEditorObject,
  SignatureEditorObject,
  StandardFontFamily,
  ExistingTextItem,
  ExistingImageItem,
} from '../../types/editor';
import './EditorContextBar.css';

interface EditorContextBarProps {
  selectedObject: EditorObject | null;
  onUpdateObject: (updated: EditorObject) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  selectedExistingText?: ExistingTextItem | null;
  onUpdateExistingText?: (updated: ExistingTextItem) => void;
  onDeleteExistingText?: (id: string) => void;
  selectedExistingImage?: ExistingImageItem | null;
  onReplaceExistingImage?: (id: string, file: File) => void;
  onDeleteExistingImage?: (id: string) => void;
}

const COLOR_PALETTE = [
  { hex: '#202124', label: 'Black' },
  { hex: '#1a73e8', label: 'Blue' },
  { hex: '#d93025', label: 'Red' },
  { hex: '#137333', label: 'Green' },
  { hex: '#f9ab00', label: 'Yellow' },
  { hex: '#ffffff', label: 'White' },
];

const HIGHLIGHT_PALETTE = [
  { hex: '#ffeb3b', label: 'Yellow' },
  { hex: '#a7f3d0', label: 'Green' },
  { hex: '#bfdbfe', label: 'Blue' },
  { hex: '#fbcfe8', label: 'Pink' },
  { hex: '#fed7aa', label: 'Orange' },
];

const NOTE_PALETTE = [
  { hex: '#fef3c7', label: 'Yellow' },
  { hex: '#dbeafe', label: 'Blue' },
  { hex: '#fee2e2', label: 'Pink' },
  { hex: '#dcfce7', label: 'Green' },
];

export const EditorContextBar: React.FC<EditorContextBarProps> = ({
  selectedObject,
  onUpdateObject,
  onDeleteObject,
  onDuplicateObject,
  selectedExistingText,
  onUpdateExistingText,
  onDeleteExistingText,
  selectedExistingImage,
  onReplaceExistingImage,
  onDeleteExistingImage,
}) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Existing PDF Text Selected (Phase 2)
  if (selectedExistingText && onUpdateExistingText && onDeleteExistingText) {
    return (
      <div className="editor-context-bar context-bar-existing" role="toolbar" aria-label="Edit Existing PDF Text">
        <span className="context-label existing-badge">Original Text:</span>

        {/* Inline Text Content Input */}
        <input
          type="text"
          className="context-text-input"
          value={selectedExistingText.text}
          onChange={(e) =>
            onUpdateExistingText({
              ...selectedExistingText,
              text: e.target.value,
              isModified: true,
            })
          }
          placeholder="Edit text content..."
          title="Edit existing text"
        />

        {/* Font Family Fallback */}
        <select
          className="context-select"
          value={selectedExistingText.fontFamily}
          onChange={(e) =>
            onUpdateExistingText({
              ...selectedExistingText,
              fontFamily: e.target.value as StandardFontFamily,
              isModified: true,
            })
          }
          title="Font Family"
        >
          <option value="Helvetica">Helvetica</option>
          <option value="TimesRoman">Times Roman</option>
          <option value="Courier">Courier</option>
        </select>

        {/* Font Size */}
        <select
          className="context-select"
          value={selectedExistingText.fontSize}
          onChange={(e) =>
            onUpdateExistingText({
              ...selectedExistingText,
              fontSize: parseInt(e.target.value, 10),
              isModified: true,
            })
          }
          title="Font Size"
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40].map((s) => (
            <option key={s} value={s}>
              {s} pt
            </option>
          ))}
        </select>

        {/* Bold / Italic */}
        <button
          type="button"
          className={`context-icon-btn ${selectedExistingText.isBold ? 'active' : ''}`}
          onClick={() =>
            onUpdateExistingText({
              ...selectedExistingText,
              isBold: !selectedExistingText.isBold,
              isModified: true,
            })
          }
          title="Bold"
        >
          <Bold size={15} />
        </button>

        <button
          type="button"
          className={`context-icon-btn ${selectedExistingText.isItalic ? 'active' : ''}`}
          onClick={() =>
            onUpdateExistingText({
              ...selectedExistingText,
              isItalic: !selectedExistingText.isItalic,
              isModified: true,
            })
          }
          title="Italic"
        >
          <Italic size={15} />
        </button>

        {/* Color Palette */}
        <div className="context-color-dots">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={`color-dot ${selectedExistingText.color === c.hex ? 'selected' : ''}`}
              style={{ backgroundColor: c.hex }}
              onClick={() =>
                onUpdateExistingText({
                  ...selectedExistingText,
                  color: c.hex,
                  isModified: true,
                })
              }
              title={c.label}
            />
          ))}
        </div>

        {/* Font subsetting note */}
        {selectedExistingText.isSubsetted && (
          <span className="context-hint-pill" title="Original font is subsetted. Standard embedded font is used for clean replacement.">
            <Info size={13} /> Font subsetted
          </span>
        )}

        <div className="context-divider" />

        {/* Delete Text Button (True Stream Removal) */}
        <button
          type="button"
          className="context-btn-danger"
          onClick={() => onDeleteExistingText(selectedExistingText.id)}
          title="Permanently delete this text from the PDF content stream"
        >
          <Trash2 size={14} />
          <span>Delete Text</span>
        </button>
      </div>
    );
  }

  // 2. Existing PDF Image Selected (Phase 2)
  if (selectedExistingImage && onReplaceExistingImage && onDeleteExistingImage) {
    return (
      <div className="editor-context-bar context-bar-existing" role="toolbar" aria-label="Edit Existing PDF Image">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onReplaceExistingImage(selectedExistingImage.id, file);
              e.target.value = '';
            }
          }}
        />

        <span className="context-label existing-badge">Embedded Image:</span>
        <span className="context-dim-text">
          {selectedExistingImage.width} × {selectedExistingImage.height} pt
        </span>

        <button
          type="button"
          className="context-btn-action"
          onClick={() => imageInputRef.current?.click()}
          title="Replace with new PNG or JPG image"
        >
          <Upload size={14} />
          <span>Replace Image</span>
        </button>

        <div className="context-divider" />

        <button
          type="button"
          className="context-btn-danger"
          onClick={() => onDeleteExistingImage(selectedExistingImage.id)}
          title="Permanently remove image from PDF stream"
        >
          <Trash2 size={14} />
          <span>Delete Image</span>
        </button>
      </div>
    );
  }

  if (!selectedObject) return null;

  return (
    <div className="editor-context-bar" role="toolbar" aria-label="Selected Object Properties">
      {/* TEXT CONTROLS */}
      {selectedObject.type === 'text' && (() => {
        const textObj = selectedObject as TextEditorObject;
        return (
          <>
            {/* Font Family */}
            <select
              className="context-select"
              value={textObj.fontFamily}
              onChange={(e) =>
                onUpdateObject({
                  ...textObj,
                  fontFamily: e.target.value as StandardFontFamily,
                })
              }
              title="Font Family"
            >
              <option value="Helvetica">Helvetica</option>
              <option value="TimesRoman">Times Roman</option>
              <option value="Courier">Courier</option>
            </select>

            {/* Font Size */}
            <select
              className="context-select"
              value={textObj.fontSize}
              onChange={(e) =>
                onUpdateObject({
                  ...textObj,
                  fontSize: parseInt(e.target.value, 10),
                })
              }
              title="Font Size"
            >
              {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((s) => (
                <option key={s} value={s}>
                  {s}pt
                </option>
              ))}
            </select>

            <div className="context-divider" />

            {/* Bold */}
            <button
              type="button"
              className={`context-icon-btn ${textObj.isBold ? 'active' : ''}`}
              onClick={() =>
                onUpdateObject({
                  ...textObj,
                  isBold: !textObj.isBold,
                })
              }
              title="Bold"
            >
              <Bold size={15} />
            </button>

            {/* Italic */}
            <button
              type="button"
              className={`context-icon-btn ${textObj.isItalic ? 'active' : ''}`}
              onClick={() =>
                onUpdateObject({
                  ...textObj,
                  isItalic: !textObj.isItalic,
                })
              }
              title="Italic"
            >
              <Italic size={15} />
            </button>

            {/* Text Alignment */}
            <button
              type="button"
              className={`context-icon-btn ${textObj.textAlign === 'left' || !textObj.textAlign ? 'active' : ''}`}
              onClick={() => onUpdateObject({ ...textObj, textAlign: 'left' })}
              title="Align Left"
            >
              <AlignLeft size={15} />
            </button>
            <button
              type="button"
              className={`context-icon-btn ${textObj.textAlign === 'center' ? 'active' : ''}`}
              onClick={() => onUpdateObject({ ...textObj, textAlign: 'center' })}
              title="Align Center"
            >
              <AlignCenter size={15} />
            </button>
            <button
              type="button"
              className={`context-icon-btn ${textObj.textAlign === 'right' ? 'active' : ''}`}
              onClick={() => onUpdateObject({ ...textObj, textAlign: 'right' })}
              title="Align Right"
            >
              <AlignRight size={15} />
            </button>

            <div className="context-divider" />

            {/* Colors */}
            <div className="context-colors-row">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`context-color-dot ${textObj.color.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                  style={{
                    backgroundColor: c.hex,
                    border: c.hex === '#ffffff' ? '1px solid #ccc' : 'none',
                  }}
                  onClick={() => onUpdateObject({ ...textObj, color: c.hex })}
                  title={c.label}
                />
              ))}
            </div>
          </>
        );
      })()}

      {/* IMAGE CONTROLS */}
      {selectedObject.type === 'image' && (() => {
        const imgObj = selectedObject as ImageEditorObject;
        return (
          <>
            <span className="context-label">Opacity:</span>
            <select
              className="context-select"
              value={imgObj.opacity ?? 1}
              onChange={(e) =>
                onUpdateObject({
                  ...imgObj,
                  opacity: parseFloat(e.target.value),
                })
              }
            >
              <option value="1">100%</option>
              <option value="0.75">75%</option>
              <option value="0.5">50%</option>
              <option value="0.25">25%</option>
            </select>

            <button
              type="button"
              className="context-icon-btn"
              onClick={() =>
                onUpdateObject({
                  ...imgObj,
                  rotation: ((imgObj.rotation || 0) + 90) % 360,
                })
              }
              title="Rotate 90° Clockwise"
            >
              <RotateCw size={15} />
              <span className="btn-label-sm">Rotate</span>
            </button>
          </>
        );
      })()}

      {/* SHAPES CONTROLS */}
      {(selectedObject.type === 'rectangle' ||
        selectedObject.type === 'circle' ||
        selectedObject.type === 'line' ||
        selectedObject.type === 'arrow') && (() => {
        const shapeObj = selectedObject as ShapeEditorObject;
        return (
          <>
            <span className="context-label">Line:</span>
            <div className="context-colors-row">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`context-color-dot ${shapeObj.strokeColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                  style={{
                    backgroundColor: c.hex,
                    border: c.hex === '#ffffff' ? '1px solid #ccc' : 'none',
                  }}
                  onClick={() => onUpdateObject({ ...shapeObj, strokeColor: c.hex })}
                  title={`Stroke ${c.label}`}
                />
              ))}
            </div>

            <select
              className="context-select"
              value={shapeObj.strokeWidth}
              onChange={(e) =>
                onUpdateObject({
                  ...shapeObj,
                  strokeWidth: parseInt(e.target.value, 10),
                })
              }
              title="Stroke Width"
            >
              <option value={1}>1px</option>
              <option value={2}>2px</option>
              <option value={4}>4px</option>
              <option value={6}>6px</option>
            </select>

            {/* Fill Color for Rectangle & Circle */}
            {(shapeObj.type === 'rectangle' || shapeObj.type === 'circle') && (
              <>
                <div className="context-divider" />
                <span className="context-label">Fill:</span>
                <select
                  className="context-select"
                  value={shapeObj.fillColor}
                  onChange={(e) =>
                    onUpdateObject({
                      ...shapeObj,
                      fillColor: e.target.value,
                    })
                  }
                  title="Fill Color"
                >
                  <option value="transparent">None</option>
                  <option value="#ffffff">White</option>
                  <option value="#e8f0fe">Soft Blue</option>
                  <option value="#fef7e0">Soft Yellow</option>
                  <option value="#e6f4ea">Soft Green</option>
                  <option value="#fce8e6">Soft Red</option>
                </select>
              </>
            )}
          </>
        );
      })()}

      {/* FREEHAND DRAWING CONTROLS */}
      {selectedObject.type === 'drawing' && (() => {
        const drawObj = selectedObject as DrawingEditorObject;
        return (
          <>
            <span className="context-label">Ink:</span>
            <div className="context-colors-row">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`context-color-dot ${drawObj.strokeColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                  style={{
                    backgroundColor: c.hex,
                    border: c.hex === '#ffffff' ? '1px solid #ccc' : 'none',
                  }}
                  onClick={() => onUpdateObject({ ...drawObj, strokeColor: c.hex })}
                  title={c.label}
                />
              ))}
            </div>

            <select
              className="context-select"
              value={drawObj.strokeWidth}
              onChange={(e) =>
                onUpdateObject({
                  ...drawObj,
                  strokeWidth: parseInt(e.target.value, 10),
                })
              }
              title="Stroke Width"
            >
              <option value={1}>Fine (1px)</option>
              <option value={2}>Regular (2px)</option>
              <option value={4}>Medium (4px)</option>
              <option value={6}>Bold (6px)</option>
            </select>
          </>
        );
      })()}

      {/* HIGHLIGHT CONTROLS */}
      {selectedObject.type === 'highlight' && (() => {
        const hlObj = selectedObject as HighlightEditorObject;
        return (
          <>
            <span className="context-label">Highlight:</span>
            <div className="context-colors-row">
              {HIGHLIGHT_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`context-color-dot ${hlObj.color.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => onUpdateObject({ ...hlObj, color: c.hex })}
                  title={c.label}
                />
              ))}
            </div>

            <select
              className="context-select"
              value={hlObj.opacity ?? 0.35}
              onChange={(e) =>
                onUpdateObject({
                  ...hlObj,
                  opacity: parseFloat(e.target.value),
                })
              }
              title="Highlight Intensity"
            >
              <option value="0.25">Subtle (25%)</option>
              <option value="0.35">Standard (35%)</option>
              <option value="0.55">Vibrant (55%)</option>
            </select>
          </>
        );
      })()}

      {/* NOTE CONTROLS */}
      {selectedObject.type === 'note' && (() => {
        const noteObj = selectedObject as NoteEditorObject;
        return (
          <>
            <span className="context-label">Note Color:</span>
            <div className="context-colors-row">
              {NOTE_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`context-color-dot ${noteObj.bgColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => onUpdateObject({ ...noteObj, bgColor: c.hex })}
                  title={c.label}
                />
              ))}
            </div>
          </>
        );
      })()}

      {/* SIGNATURE CONTROLS */}
      {selectedObject.type === 'signature' && (() => {
        const sigObj = selectedObject as SignatureEditorObject;
        return (
          <>
            <span className="context-label">Signature:</span>
            <select
              className="context-select"
              value={sigObj.opacity ?? 1}
              onChange={(e) =>
                onUpdateObject({
                  ...sigObj,
                  opacity: parseFloat(e.target.value),
                })
              }
            >
              <option value="1">100%</option>
              <option value="0.8">80%</option>
              <option value="0.6">60%</option>
            </select>
          </>
        );
      })()}

      <div className="context-divider" />

      {/* Duplicate Button */}
      <button
        type="button"
        className="context-icon-btn"
        onClick={() => onDuplicateObject(selectedObject.id)}
        title="Duplicate Element"
      >
        <Copy size={15} />
      </button>

      {/* Delete Button */}
      <button
        type="button"
        className="context-icon-btn danger"
        onClick={() => onDeleteObject(selectedObject.id)}
        title="Delete Element (Delete / Backspace)"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};
