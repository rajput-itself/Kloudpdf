/**
 * KloudPDF Visual PDF Editor — Type Definitions
 * 100% Client-Side In-Browser PDF Editing
 */

export type EditorToolMode =
  | 'select'
  | 'edit-content'
  | 'text'
  | 'image'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'drawing'
  | 'highlight'
  | 'note'
  | 'signature';

export type StandardFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier';

export interface BaseEditorObject {
  id: string;
  pageNumber: number; // 1-indexed
  type: string;
  x: number; // PDF points (1/72 inch) from page top-left
  y: number; // PDF points (1/72 inch) from page top-left
  width: number; // PDF points
  height: number; // PDF points
  rotation?: number; // In degrees (0 - 360)
  opacity?: number; // 0 - 1
  isLocked?: boolean;
}

export interface TextEditorObject extends BaseEditorObject {
  type: 'text';
  text: string;
  fontFamily: StandardFontFamily;
  fontSize: number; // in PDF points
  color: string; // Hex color e.g. '#202124'
  isBold: boolean;
  isItalic: boolean;
  lineHeight: number; // Multiplier, e.g. 1.25
  textAlign?: 'left' | 'center' | 'right';
}

export interface ImageEditorObject extends BaseEditorObject {
  type: 'image';
  dataUrl: string; // Base64 data URL
  mimeType: 'image/jpeg' | 'image/png';
  aspectRatio: number; // width / height
}

export interface ShapeEditorObject extends BaseEditorObject {
  type: 'rectangle' | 'circle' | 'line' | 'arrow';
  strokeColor: string;
  strokeWidth: number; // in PDF points
  fillColor: string; // 'transparent' or hex color
}

export interface Point2D {
  x: number;
  y: number;
}

export interface DrawingEditorObject extends BaseEditorObject {
  type: 'drawing';
  points: Point2D[]; // Relative to object bounding box (or page points)
  strokeColor: string;
  strokeWidth: number;
}

export interface HighlightEditorObject extends BaseEditorObject {
  type: 'highlight';
  color: string; // Default #ffeb3b
}

export interface NoteEditorObject extends BaseEditorObject {
  type: 'note';
  text: string;
  bgColor: string; // e.g. '#fef3c7'
  textColor: string;
  isOpen: boolean;
}

export interface SignatureEditorObject extends BaseEditorObject {
  type: 'signature';
  dataUrl: string; // PNG data URL
  strokeColor: string;
}

export type EditorObject =
  | TextEditorObject
  | ImageEditorObject
  | ShapeEditorObject
  | DrawingEditorObject
  | HighlightEditorObject
  | NoteEditorObject
  | SignatureEditorObject;

export interface PageDimension {
  pageNumber: number;
  width: number; // in PDF points
  height: number; // in PDF points
  rotation: number; // 0, 90, 180, 270
}

/**
 * Phase 2: True PDF Content Editing Types
 */
export interface ExistingTextItem {
  id: string; // e.g. "p1-t3"
  pageNumber: number; // 1-indexed
  text: string;
  originalText: string;
  x: number; // PDF points from page top-left
  y: number; // PDF points from page top-left
  width: number;
  height: number;
  fontName: string;
  fontFamily: StandardFontFamily;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  transform: number[]; // [a, b, c, d, e, f]
  isSubsetted: boolean;
  isDeleted: boolean;
  isModified: boolean;
  unsupportedReason?: string;
}

export interface ExistingImageItem {
  id: string; // e.g. "p1-img0"
  pageNumber: number;
  name: string; // XObject name e.g. "/Im1"
  x: number; // PDF points from page top-left
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
  isDeleted: boolean;
  isModified: boolean;
  replacementDataUrl?: string;
  replacementMimeType?: 'image/jpeg' | 'image/png';
}

export interface ContentEditState {
  modifiedTexts: Record<string, ExistingTextItem>;
  modifiedImages: Record<string, ExistingImageItem>;
}

export interface EditorHistoryState {
  objects: EditorObject[];
  selectedObjectId: string | null;
  contentEdits?: ContentEditState;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
