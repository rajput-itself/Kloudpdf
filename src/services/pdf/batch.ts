/**
 * KloudPDF — High-Throughput Batch PDF Processing Engine
 * 100% Client-Side In-Browser Processing
 *
 * Capabilities:
 * - Bounded concurrency queue (prevents browser memory pressure and thread freezing).
 * - Fault isolation: one corrupt/failed document does not fail the batch.
 * - Granular per-item progress and overall queue tracking.
 * - Immediate cancellation and individual retry support.
 * - Direct individual download and consolidated ZIP packaging (JSZip).
 * - Reuses existing tested KloudPDF tool services without code duplication.
 */

import JSZip from 'jszip';
import { BatchOperationType } from './presets';
import { compressPdfDocument, CompressionLevel } from './compress';
import { rotatePdfFile } from './rotate';
import { addWatermarkToPdf, WatermarkOptions } from './watermark';
import { addPageNumbersToPdf, PageNumberOptions } from './pageNumbers';
import { convertPdfToImages, PdfToImageOptions } from '../conversion/pdfToImages';
import { runOcrOnPdf, OcrLanguage } from './ocr';
import { sanitizePdfMetadata } from './metadata';
import { convertPdfToGrayscale } from './grayscale';
import { flattenPdfDocument } from './flatten';
import { protectPdfFile } from './protect';
import { loadPdfDocument } from './render';
import { PDFDocument } from 'pdf-lib';
import { toBlob } from '../../utils/file';

export type BatchItemStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  status: BatchItemStatus;
  progress: number; // 0 to 100
  statusMessage?: string;
  resultBlob?: Blob;
  resultFilename?: string;
  errorMessage?: string;
  durationMs?: number;
  originalSize?: number;
  processedSize?: number;
}

export interface BatchProcessingOptions {
  operation: BatchOperationType;
  config: Record<string, any>;
  concurrency?: number; // 1 to 3, default 2
  onItemUpdate?: (item: BatchItem) => void;
  onOverallProgress?: (completedCount: number, totalCount: number, percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Unlocks a password-protected PDF using the user's authorized password
 */
async function unlockPdfFile(file: File, password: string): Promise<Blob> {
  const cleanPassword = password || '';
  const buffer = await file.arrayBuffer();

  // 1. Verify with PDF.js that the password is valid
  try {
    const loadingTask = (await import('pdfjs-dist')).getDocument({
      data: new Uint8Array(buffer.slice(0)),
      password: cleanPassword,
    });
    await loadingTask.promise;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('password')) {
      throw new Error('Incorrect password. Please verify the password and try again.');
    }
    throw new Error(`Failed to unlock PDF: ${msg}`);
  }

  // 2. Export unlocked document using pdf-lib
  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
    });

    // Remove the Encrypt dictionary from trailer so it is no longer locked
    if (pdfDoc.context.trailerInfo?.Encrypt) {
      delete pdfDoc.context.trailerInfo.Encrypt;
    }

    const unlockedBytes = await pdfDoc.save({ useObjectStreams: true });
    return toBlob(unlockedBytes, 'application/pdf');
  } catch {
    // If standard load fails, try saving fresh pages
    throw new Error('This PDF uses an advanced security handler that cannot be decrypted without external keys.');
  }
}

/**
 * Processes a single batch item using the configured operation
 */
export async function processSingleBatchItem(
  item: BatchItem,
  operation: BatchOperationType,
  config: Record<string, any>,
  signal?: AbortSignal
): Promise<{ resultBlob: Blob; resultFilename: string }> {
  if (signal?.aborted) throw new Error('Processing cancelled by user.');

  const baseName = item.name.replace(/\.[^/.]+$/, '');

  switch (operation) {
    case 'compress': {
      const level: CompressionLevel = config.level || 'recommended';
      const res = await compressPdfDocument(item.file, {
        level,
        customSettings: config.customSettings,
        targetFileSizeKb: config.targetFileSizeKb,
        signal,
      });
      return {
        resultBlob: res.blob,
        resultFilename: `${baseName}_compressed.pdf`,
      };
    }

    case 'rotate': {
      const angle = Number(config.angle || 90);
      const resBlob = await rotatePdfFile(item.file, { angle });
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_rotated.pdf`,
      };
    }

    case 'watermark': {
      const watermarkOpts: WatermarkOptions = {
        text: config.text || 'CONFIDENTIAL',
        fontSize: config.fontSize ?? 48,
        opacity: config.opacity ?? 0.25,
        rotation: config.rotation ?? 45,
        color: config.color ?? 'gray',
        position: config.position ?? 'center',
      };
      const resBlob = await addWatermarkToPdf(item.file, watermarkOpts);
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_watermarked.pdf`,
      };
    }

    case 'page-numbers': {
      const pageOpts: PageNumberOptions = {
        position: config.position ?? 'bottom-center',
        format: config.format ?? 'Page {n} of {total}',
        startNumber: config.startNumber ?? 1,
        fontSize: config.fontSize ?? 10,
        margin: config.margin ?? 30,
      };
      const resBlob = await addPageNumbersToPdf(item.file, pageOpts);
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_numbered.pdf`,
      };
    }

    case 'pdf-to-images': {
      const imgOpts: PdfToImageOptions = {
        format: config.format === 'webp' ? 'webp' : 'png',
        scale: config.scale ?? 1.5,
        quality: config.quality ?? 0.85,
      };
      const res = await convertPdfToImages(item.file, imgOpts);
      if (res.zipBlob) {
        return {
          resultBlob: res.zipBlob,
          resultFilename: `${baseName}_images.zip`,
        };
      }
      if (res.items.length > 0 && res.items[0]) {
        return {
          resultBlob: res.items[0].blob,
          resultFilename: res.items[0].filename,
        };
      }
      throw new Error('No images could be extracted from document.');
    }

    case 'ocr': {
      const lang: OcrLanguage = config.language || 'eng';
      const ocrRes = await runOcrOnPdf(item.file, {
        language: lang,
        generateSearchablePdf: config.generateSearchablePdf ?? true,
      });

      if (ocrRes.searchablePdfBlob) {
        return {
          resultBlob: ocrRes.searchablePdfBlob,
          resultFilename: `${baseName}_ocr_searchable.pdf`,
        };
      }
      // If plain text export requested
      const textBlob = toBlob(
        new TextEncoder().encode(ocrRes.fullText),
        'text/plain'
      );
      return {
        resultBlob: textBlob,
        resultFilename: `${baseName}_extracted_text.txt`,
      };
    }

    case 'remove-metadata': {
      const resBlob = await sanitizePdfMetadata(item.file);
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_sanitized.pdf`,
      };
    }

    case 'grayscale': {
      const resBlob = await convertPdfToGrayscale(item.file, {
        mode: config.mode ?? 'standard',
      });
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_grayscale.pdf`,
      };
    }

    case 'flatten': {
      const resBlob = await flattenPdfDocument(item.file);
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_flattened.pdf`,
      };
    }

    case 'protect': {
      const password = (config.password || '').trim();
      if (!password) throw new Error('Password cannot be empty for batch protection.');
      const resBlob = await protectPdfFile(item.file, { password });
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_protected.pdf`,
      };
    }

    case 'unlock': {
      const password = (config.password || '').trim();
      const resBlob = await unlockPdfFile(item.file, password);
      return {
        resultBlob: resBlob,
        resultFilename: `${baseName}_unlocked.pdf`,
      };
    }

    default:
      throw new Error(`Unsupported batch operation: ${operation}`);
  }
}

/**
 * Inspects a PDF file to quickly determine page count without heavy rendering
 */
export async function inspectPdfPageCount(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await loadPdfDocument(buffer);
    return pdfDoc.numPages;
  } catch {
    return 1;
  }
}

/**
 * Orchestrates batch execution with bounded concurrency and fault isolation
 */
export async function executeBatchQueue(
  items: BatchItem[],
  options: BatchProcessingOptions
): Promise<BatchItem[]> {
  const concurrency = Math.max(1, Math.min(3, options.concurrency ?? 2));
  const queue = [...items];
  const updatedItems = new Map<string, BatchItem>();

  items.forEach((item) => updatedItems.set(item.id, { ...item }));

  let finishedCount = 0;
  const total = items.length;

  const notifyItem = (item: BatchItem) => {
    updatedItems.set(item.id, item);
    options.onItemUpdate?.(item);
  };

  const updateOverall = () => {
    const percent = total > 0 ? Math.round((finishedCount / total) * 100) : 0;
    options.onOverallProgress?.(finishedCount, total, percent);
  };

  updateOverall();

  const worker = async () => {
    while (queue.length > 0) {
      if (options.signal?.aborted) {
        // Mark all remaining pending items as cancelled
        while (queue.length > 0) {
          const rem = queue.shift()!;
          if (rem.status === 'pending') {
            rem.status = 'cancelled';
            rem.statusMessage = 'Cancelled';
            notifyItem(rem);
            finishedCount++;
            updateOverall();
          }
        }
        break;
      }

      const current = queue.shift();
      if (!current || current.status !== 'pending') continue;

      current.status = 'processing';
      current.progress = 20;
      current.statusMessage = 'Processing...';
      notifyItem(current);

      const startTime = Date.now();
      try {
        const { resultBlob, resultFilename } = await processSingleBatchItem(
          current,
          options.operation,
          options.config,
          options.signal
        );

        current.status = 'completed';
        current.progress = 100;
        current.resultBlob = resultBlob;
        current.resultFilename = resultFilename;
        current.durationMs = Date.now() - startTime;
        current.originalSize = current.file.size;
        current.processedSize = resultBlob.size;
        current.statusMessage = 'Completed';
        notifyItem(current);
      } catch (err: any) {
        if (options.signal?.aborted) {
          current.status = 'cancelled';
          current.statusMessage = 'Cancelled';
        } else {
          current.status = 'failed';
          current.errorMessage = err?.message || 'Processing failed';
          current.statusMessage = 'Failed';
        }
        notifyItem(current);
      } finally {
        finishedCount++;
        updateOverall();
      }
    }
  };

  // Launch workers up to bounded concurrency limit
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return items.map((it) => updatedItems.get(it.id) || it);
}

/**
 * Creates a single consolidated ZIP archive of all completed items
 */
export async function createBatchZip(items: BatchItem[]): Promise<Blob> {
  const completed = items.filter(
    (item) => item.status === 'completed' && item.resultBlob && item.resultFilename
  );

  if (completed.length === 0) {
    throw new Error('No completed files available to archive.');
  }

  const zip = new JSZip();

  for (const item of completed) {
    const filename = item.resultFilename!;
    const blob = item.resultBlob!;

    // If result is already a ZIP (like PDF to images), unpack it into a folder
    if (filename.endsWith('.zip')) {
      const folderName = filename.replace(/\.zip$/, '');
      const itemZip = await JSZip.loadAsync(await blob.arrayBuffer());
      const subFolder = zip.folder(folderName);
      if (subFolder) {
        for (const [entryPath, zipEntry] of Object.entries(itemZip.files)) {
          if (!zipEntry.dir) {
            const entryBytes = await zipEntry.async('uint8array');
            subFolder.file(entryPath, entryBytes);
          }
        }
      }
    } else {
      const bytes = await blob.arrayBuffer();
      zip.file(filename, bytes);
    }
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
