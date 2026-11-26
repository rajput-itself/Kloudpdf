import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

/**
 * Flattens all interactive form fields and annotations in a PDF into static page artwork.
 * Note: Flattening preserves visual appearance while making fields non-editable,
 * but does not provide cryptographic encryption.
 */
export async function flattenPdfDocument(source: File | ArrayBuffer | Uint8Array): Promise<Blob> {
  let bytes: Uint8Array;
  if (source instanceof File) {
    const buffer = await source.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } else if (source instanceof Uint8Array) {
    bytes = new Uint8Array(source.slice());
  } else {
    bytes = new Uint8Array(source.slice(0));
  }

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch (err) {
    console.warn('Form flattening warning (document may not contain active AcroForms):', err);
  }

  const pdfBytes = await pdfDoc.save();
  return toBlob(pdfBytes, 'application/pdf');
}
