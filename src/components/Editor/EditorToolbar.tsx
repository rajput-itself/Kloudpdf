import React, { useRef, useState } from 'react';
import {
  MousePointer,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Highlighter,
  PenTool,
  StickyNote,
  FileSignature,
  ChevronDown,
  Edit3,
  Search,
  Columns,
} from 'lucide-react';
import { EditorToolMode } from '../../types/editor';
import './EditorToolbar.css';

interface EditorToolbarProps {
  activeMode: EditorToolMode;
  onSelectMode: (mode: EditorToolMode) => void;
  onInsertImage: (file: File) => void;
  onOpenSignatureModal: () => void;
  onOpenFindReplace?: () => void;
  onOpenBeforeAfter?: () => void;
  hasContentModifications?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  activeMode,
  onSelectMode,
  onInsertImage,
  onOpenSignatureModal,
  onOpenFindReplace,
  onOpenBeforeAfter,
  hasContentModifications = false,
}) => {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onInsertImage(file);
      // Reset input value so same image can be reselected
      e.target.value = '';
    }
  };

  const isShapeActive =
    activeMode === 'rectangle' ||
    activeMode === 'circle' ||
    activeMode === 'line' ||
    activeMode === 'arrow';

  return (
    <div className="editor-floating-toolbar" role="toolbar" aria-label="PDF Editing Tools">
      {/* Hidden file input for images */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleImageFileChange}
      />

      {/* 1. Select / Pointer */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'select' ? 'active' : ''}`}
        onClick={() => onSelectMode('select')}
        title="Select & Move Objects (V)"
        aria-label="Select tool"
      >
        <MousePointer size={18} />
        <span className="toolbar-btn-text">Select</span>
      </button>

      {/* 1b. Phase 2: Edit Existing Content */}
      <button
        type="button"
        className={`toolbar-btn toolbar-btn-content ${activeMode === 'edit-content' ? 'active' : ''}`}
        onClick={() => onSelectMode('edit-content')}
        title="Edit Existing PDF Text & Images"
        aria-label="Edit Content tool"
      >
        <Edit3 size={18} />
        <span className="toolbar-btn-text">Edit Content</span>
      </button>

      <div className="toolbar-separator" />

      {/* 2. Text */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'text' ? 'active' : ''}`}
        onClick={() => onSelectMode('text')}
        title="Add Text (T)"
        aria-label="Text tool"
      >
        <Type size={18} />
        <span className="toolbar-btn-text">Text</span>
      </button>

      {/* 3. Image */}
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => imageInputRef.current?.click()}
        title="Insert Image (JPG/PNG)"
        aria-label="Insert image"
      >
        <ImageIcon size={18} />
        <span className="toolbar-btn-text">Image</span>
      </button>

      {/* 4. Shapes (Dropdown / Menu) */}
      <div className="toolbar-dropdown-container">
        <button
          type="button"
          className={`toolbar-btn ${isShapeActive ? 'active' : ''}`}
          onClick={() => setShapeMenuOpen(!shapeMenuOpen)}
          title="Shapes (Rectangle, Circle, Line, Arrow)"
          aria-label="Shapes"
          aria-expanded={shapeMenuOpen}
        >
          {activeMode === 'circle' ? (
            <Circle size={18} />
          ) : activeMode === 'line' ? (
            <Minus size={18} />
          ) : activeMode === 'arrow' ? (
            <ArrowUpRight size={18} />
          ) : (
            <Square size={18} />
          )}
          <span className="toolbar-btn-text">Shape</span>
          <ChevronDown size={12} className="chevron" />
        </button>

        {shapeMenuOpen && (
          <div className="toolbar-dropdown-menu">
            <button
              type="button"
              className={`dropdown-item ${activeMode === 'rectangle' ? 'active' : ''}`}
              onClick={() => {
                onSelectMode('rectangle');
                setShapeMenuOpen(false);
              }}
            >
              <Square size={16} />
              <span>Rectangle</span>
            </button>
            <button
              type="button"
              className={`dropdown-item ${activeMode === 'circle' ? 'active' : ''}`}
              onClick={() => {
                onSelectMode('circle');
                setShapeMenuOpen(false);
              }}
            >
              <Circle size={16} />
              <span>Circle</span>
            </button>
            <button
              type="button"
              className={`dropdown-item ${activeMode === 'line' ? 'active' : ''}`}
              onClick={() => {
                onSelectMode('line');
                setShapeMenuOpen(false);
              }}
            >
              <Minus size={16} />
              <span>Line</span>
            </button>
            <button
              type="button"
              className={`dropdown-item ${activeMode === 'arrow' ? 'active' : ''}`}
              onClick={() => {
                onSelectMode('arrow');
                setShapeMenuOpen(false);
              }}
            >
              <ArrowUpRight size={16} />
              <span>Arrow</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. Highlight */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'highlight' ? 'active' : ''}`}
        onClick={() => onSelectMode('highlight')}
        title="Highlight Box (H)"
        aria-label="Highlight tool"
      >
        <Highlighter size={18} />
        <span className="toolbar-btn-text">Highlight</span>
      </button>

      {/* 6. Freehand Draw */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'drawing' ? 'active' : ''}`}
        onClick={() => onSelectMode('drawing')}
        title="Freehand Draw (D)"
        aria-label="Draw tool"
      >
        <PenTool size={18} />
        <span className="toolbar-btn-text">Draw</span>
      </button>

      {/* 7. Note */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'note' ? 'active' : ''}`}
        onClick={() => onSelectMode('note')}
        title="Add Sticky Note (N)"
        aria-label="Note tool"
      >
        <StickyNote size={18} />
        <span className="toolbar-btn-text">Note</span>
      </button>

      {/* 8. Signature */}
      <button
        type="button"
        className={`toolbar-btn ${activeMode === 'signature' ? 'active' : ''}`}
        onClick={onOpenSignatureModal}
        title="Insert Signature (S)"
        aria-label="Signature tool"
      >
        <FileSignature size={18} />
        <span className="toolbar-btn-text">Sign</span>
      </button>

      {(onOpenFindReplace || onOpenBeforeAfter) && <div className="toolbar-separator" />}

      {/* 9. Find & Replace */}
      {onOpenFindReplace && (
        <button
          type="button"
          className="toolbar-btn"
          onClick={onOpenFindReplace}
          title="Find & Replace in Document"
          aria-label="Find & Replace"
        >
          <Search size={18} />
          <span className="toolbar-btn-text">Find</span>
        </button>
      )}

      {/* 10. Before / After Preview */}
      {onOpenBeforeAfter && (
        <button
          type="button"
          className={`toolbar-btn ${hasContentModifications ? 'has-badge' : ''}`}
          onClick={onOpenBeforeAfter}
          title="Before & After Diff Preview"
          aria-label="Before/After Diff Preview"
        >
          <Columns size={18} />
          <span className="toolbar-btn-text">Compare</span>
        </button>
      )}
    </div>
  );
};
