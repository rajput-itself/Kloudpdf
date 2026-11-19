/**
 * KloudPDF Visual PDF Editor — Type Definitions
 * 100% Client-Side In-Browser PDF Editing
 */

export type EditorToolMode =
  | 'select'
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

export interface EditorHistoryState {
  objects: EditorObject[];
  selectedObjectId: string | null;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
