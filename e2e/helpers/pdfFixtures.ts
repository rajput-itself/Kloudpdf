import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import type { Download } from '@playwright/test';

export async function createSyntheticPdf(
  pageCount: number,
  textPrefix: string = 'KloudPDF Test Page'
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${textPrefix} ${i}`, {
      x: 50,
      y: 760,
      size: 16,
      font,
    });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export async function readDownloadBytes(download: Download): Promise<Uint8Array> {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error('Download did not produce a local file path.');
  }
  const buf = await readFile(filePath);
  return new Uint8Array(buf);
}

export async function inspectPdfOutput(bytes: Uint8Array): Promise<{
  isValidPdfHeader: boolean;
  pageCount: number;
  rotations: number[];
  isEncrypted: boolean;
}> {
  const header = Buffer.from(bytes.slice(0, 16)).toString('ascii');
  const isValidPdfHeader = header.startsWith('%PDF-');

  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return {
      isValidPdfHeader,
      pageCount: doc.getPageCount(),
      rotations: doc.getPages().map((p) => p.getRotation().angle),
      isEncrypted: doc.isEncrypted,
    };
  } catch (err: any) {
    if (String(err?.message || '').toLowerCase().includes('encrypt')) {
      return {
        isValidPdfHeader,
        pageCount: 0,
        rotations: [],
        isEncrypted: true,
      };
    }
    throw err;
  }
}
