import { PDFDocument, PDFName } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string[];
  creator: string;
  producer: string;
  creationDate?: Date;
  modificationDate?: Date;
  hasXmpMetadata: boolean;
}

export type PdfMetadataUpdate = Partial<
  Omit<PdfMetadata, 'hasXmpMetadata' | 'creationDate' | 'modificationDate'>
>;

/**
 * Extracts standard Document Information Dictionary metadata and checks for XMP streams.
 */
export async function extractPdfMetadata(
  source: File | ArrayBuffer
): Promise<PdfMetadata> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  const rawKeywords = pdfDoc.getKeywords();
  let keywords: string[] = [];
  if (rawKeywords) {
    keywords = rawKeywords
      .split(/[,;\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  let hasXmpMetadata: boolean;
  try {
    hasXmpMetadata = pdfDoc.catalog.has(PDFName.of('Metadata'));
  } catch {
    hasXmpMetadata = false;
  }

  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords,
    creator: pdfDoc.getCreator() || '',
    producer: pdfDoc.getProducer() || '',
    creationDate: pdfDoc.getCreationDate(),
    modificationDate: pdfDoc.getModificationDate(),
    hasXmpMetadata,
  };
}

/**
 * Updates document information dictionary fields and records new modification date.
 */
export async function updatePdfMetadata(
  source: File | ArrayBuffer,
  update: PdfMetadataUpdate
): Promise<Blob> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  if (update.title !== undefined) pdfDoc.setTitle(update.title);
  if (update.author !== undefined) pdfDoc.setAuthor(update.author);
  if (update.subject !== undefined) pdfDoc.setSubject(update.subject);
  if (update.keywords !== undefined) {
    pdfDoc.setKeywords(update.keywords);
  }
  if (update.creator !== undefined) pdfDoc.setCreator(update.creator);
  if (update.producer !== undefined) pdfDoc.setProducer(update.producer);

  pdfDoc.setModificationDate(new Date());

  const bytes = await pdfDoc.save();
  return toBlob(bytes, 'application/pdf');
}

/**
 * Permanently removes all standard Info dictionary fields and strips the Catalog /Metadata XMP stream.
 * Explains that changing document information fields removes standard metadata, but embedded image
 * EXIF or private font tables inside the PDF are not rewritten unless fully re-encoded.
 */
export async function sanitizePdfMetadata(
  source: File | ArrayBuffer
): Promise<Blob> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  // Clear standard Info fields
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('KloudPDF Sanitizer');
  pdfDoc.setCreator('KloudPDF');

  // Strip Catalog /Metadata XMP XML stream
  try {
    if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
      pdfDoc.catalog.delete(PDFName.of('Metadata'));
    }
  } catch {
    // Ignore
  }

  pdfDoc.setModificationDate(new Date());

  const bytes = await pdfDoc.save();
  return toBlob(bytes, 'application/pdf');
}
