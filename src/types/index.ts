export type ToolCategory = 'organize' | 'convert' | 'edit' | 'protect';

export type ToolId =
  | 'edit-pdf'
  | 'merge'
  | 'split'
  | 'organize'
  | 'rotate'
  | 'remove-pages'
  | 'extract-pages'
  | 'remove-blank-pages'
  | 'booklet-maker'
  | 'jpg-to-pdf'
  | 'pdf-to-jpg'
  | 'pdf-to-png'
  | 'pdf-to-webp'
  | 'html-to-pdf'
  | 'word-to-pdf'
  | 'excel-to-pdf'
  | 'powerpoint-to-pdf'
  | 'pdf-to-text'
  | 'ocr-pdf'
  | 'grayscale-pdf'
  | 'watermark'
  | 'page-numbers'
  | 'annotate-pdf'
  | 'redact-pdf'
  | 'fill-forms'
  | 'flatten-pdf'
  | 'deskew-pdf'
  | 'protect';

export interface ConvertedImagePageItem {
  pageNumber: number;
  blob: Blob;
  filename: string;
  url: string;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  tagline: string;
  description: string;
  category: ToolCategory;
  acceptedFileTypes: string; // e.g. ".pdf" or ".jpg,.jpeg,.png"
  acceptMultiple: boolean;
  actionButtonText: string;
}

export type ProcessingState = 'idle' | 'configured' | 'processing' | 'completed' | 'error';

export interface ProcessedResult {
  blob: Blob;
  filename: string;
  downloadUrl: string;
  fileCount?: number;
  imageItems?: ConvertedImagePageItem[];
  textOutput?: string;
}

export interface PDFPageInfo {
  pageNumber: number; // 1-indexed
  rotation: number; // 0, 90, 180, 270
  selected?: boolean;
}
