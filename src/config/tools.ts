import { ToolDefinition, ToolCategory } from '../types';

export interface CategoryInfo {
  id: ToolCategory;
  name: string;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'organize',
    name: 'Organize PDF',
    description: 'Merge, split, rotate and manage pages in your documents.',
  },
  {
    id: 'convert',
    name: 'Convert PDF',
    description: 'Convert image files to PDF or render PDF pages as high-quality JPGs.',
  },
  {
    id: 'edit',
    name: 'Edit PDF',
    description: 'Add page numbers, stamps, or watermarks to your pages.',
  },
  {
    id: 'protect',
    name: 'Protect PDF',
    description: 'Secure your PDF documents with industry-standard encryption.',
  },
];

export const TOOLS: ToolDefinition[] = [
  // A. Organize PDF
  {
    id: 'merge',
    name: 'Merge PDF',
    tagline: 'Combine multiple PDFs into one unified document.',
    description: 'Combine multiple PDF files into a single document in your chosen order.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: true,
    actionButtonText: 'Merge PDF',
  },
  {
    id: 'split',
    name: 'Split PDF',
    tagline: 'Split a PDF into separate files by page range.',
    description: 'Extract specific page ranges or split a PDF into separate documents.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Split PDF',
  },
  {
    id: 'organize',
    name: 'Organize PDF',
    tagline: 'Reorder, rotate, or delete individual pages.',
    description: 'Rearrange, rotate, or delete individual pages visually.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Save Organized PDF',
  },
  {
    id: 'rotate',
    name: 'Rotate PDF',
    tagline: 'Rotate all or selected pages to the desired orientation.',
    description: 'Rotate all or specific pages clockwise or counter-clockwise.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Rotate PDF',
  },
  {
    id: 'remove-pages',
    name: 'Remove PDF Pages',
    tagline: 'Delete unwanted pages from your document.',
    description: 'Select and remove specific pages from your PDF file.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Remove Pages',
  },
  {
    id: 'extract-pages',
    name: 'Extract PDF Pages',
    tagline: 'Extract selected pages into a new PDF document.',
    description: 'Extract chosen pages to generate an independent PDF document.',
    category: 'organize',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Extract Pages',
  },

  // B. Convert PDF
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    tagline: 'Convert JPG, JPEG, and PNG images into a PDF.',
    description: 'Convert JPG and PNG images into a clean PDF document with custom margins.',
    category: 'convert',
    acceptedFileTypes: '.jpg,.jpeg,.png',
    acceptMultiple: true,
    actionButtonText: 'Convert to PDF',
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    tagline: 'Convert PDF pages into high-resolution JPG images.',
    description: 'Convert every page or selected pages of your PDF into high-quality JPG images.',
    category: 'convert',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Convert to JPG',
  },

  // C. Edit PDF
  {
    id: 'watermark',
    name: 'Add Watermark',
    tagline: 'Stamp text or custom watermarks over your PDF pages.',
    description: 'Apply custom text watermarks with control over position, opacity, and rotation.',
    category: 'edit',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Add Watermark',
  },
  {
    id: 'page-numbers',
    name: 'Add Page Numbers',
    tagline: 'Insert formatted page numbers into your document.',
    description: 'Insert page numbering with customizable position, format, and font sizing.',
    category: 'edit',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Add Page Numbers',
  },

  // D. Protect PDF
  {
    id: 'protect',
    name: 'Protect PDF',
    tagline: 'Encrypt your PDF with a secure password.',
    description: 'Encrypt your PDF document with a password to restrict unauthorized opening.',
    category: 'protect',
    acceptedFileTypes: '.pdf',
    acceptMultiple: false,
    actionButtonText: 'Protect PDF',
  },
];
