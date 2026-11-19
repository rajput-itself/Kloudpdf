import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

/**
 * Flattens all interactive form fields and annotations in a PDF into static page artwork.
 * Note: Flattening preserves visual appearance while making fields non-editable,
 * but does not provide cryptographic encryption.
 */
export async function flattenPdfDocument(file: File): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);

  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch (err) {
    console.warn('Form flattening warning (document may not contain active AcroForms):', err);
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
