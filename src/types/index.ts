export type ToolCategory = 'organize' | 'convert' | 'edit' | 'protect';

export type ToolId =
  | 'merge'
  | 'split'
  | 'organize'
  | 'rotate'
  | 'remove-pages'
  | 'extract-pages'
  | 'jpg-to-pdf'
  | 'pdf-to-jpg'
  | 'watermark'
  | 'page-numbers'
  | 'protect';

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
}

export interface PDFPageInfo {
  pageNumber: number; // 1-indexed
  rotation: number; // 0, 90, 180, 270
  selected?: boolean;
}
