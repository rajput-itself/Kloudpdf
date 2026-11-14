import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { toBlob } from '../../utils/file';

export interface ProtectPdfOptions {
  password: string;
  onProgress?: (current: number, total: number) => void;
}

export async function protectPdfFile(
  file: File,
  options: ProtectPdfOptions
): Promise<Blob> {
  const password = options.password.trim();
  if (!password) {
    throw new Error('Please enter a valid password to protect the PDF.');
  }

  options.onProgress?.(1, 2);
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  options.onProgress?.(2, 2);
  // Encrypt PDF using client-side AES / PDF security handler
  const encryptedBytes = await encryptPDF(pdfBytes, password);

  return toBlob(encryptedBytes, 'application/pdf');
}
