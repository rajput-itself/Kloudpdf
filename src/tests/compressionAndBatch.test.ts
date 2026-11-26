import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import {
  compressPdfDocument,
} from '../services/pdf/compress';
import {
  executeBatchQueue,
  createBatchZip,
  BatchItem,
} from '../services/pdf/batch';
import {
  getBatchPresets,
  saveBatchPreset,
  deleteBatchPreset,
  BUILT_IN_PRESETS,
} from '../services/pdf/presets';

// Configure Node.js worker path for test runner
if (typeof window === 'undefined') {
  try {
    const workerUrl = new URL(
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'file://' + process.cwd() + '/'
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // fallback
  }
}

// Minimal valid 1x1 JPEG fixture
const SAMPLE_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

// Helper: Create a PDF with embedded text and image
async function createSamplePdf(withImages: boolean = true): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 800]);

  page.drawText('KloudPDF Phase 5 Searchable Vector Text Content', {
    x: 50,
    y: 750,
    size: 16,
    font,
  });

  page.drawText('Second line of confidential searchable document content.', {
    x: 50,
    y: 720,
    size: 12,
    font,
  });

  if (withImages) {
    const img = await doc.embedJpg(SAMPLE_JPEG_BYTES);
    page.drawImage(img, { x: 50, y: 500, width: 200, height: 200 });
  }

  doc.setTitle('Original Test Document');
  doc.setAuthor('Test Suite');
  return await doc.save();
}

describe('1. PDF Compression Levels & Image Downsampling', () => {
  test('compresses PDF with Extreme, Recommended, and Low presets', async () => {
    const originalBytes = await createSamplePdf(true);

    // 1. Extreme Compression
    const extremeRes = await compressPdfDocument(originalBytes, { level: 'extreme' });
    assert.ok(extremeRes.blob instanceof Blob);
    assert.strictEqual(extremeRes.originalSize, originalBytes.length);
    assert.ok(extremeRes.durationMs >= 0);

    // 2. Recommended Compression
    const recRes = await compressPdfDocument(originalBytes, { level: 'recommended' });
    assert.ok(recRes.blob instanceof Blob);
    assert.strictEqual(recRes.levelUsed, 'recommended');

    // 3. Low Compression
    const lowRes = await compressPdfDocument(originalBytes, { level: 'low' });
    assert.ok(lowRes.blob instanceof Blob);
    assert.strictEqual(lowRes.levelUsed, 'low');

    // Verify all compressed outputs reload cleanly in PDF-lib
    const extremeDoc = await PDFDocument.load(await extremeRes.blob.arrayBuffer());
    assert.strictEqual(extremeDoc.getPageCount(), 1);
    const recDoc = await PDFDocument.load(await recRes.blob.arrayBuffer());
    assert.strictEqual(recDoc.getPageCount(), 1);
  });
});

describe('2. Searchable Text & Vector Preservation', () => {
  test('preserves searchable text and does NOT silently rasterize document', async () => {
    const originalBytes = await createSamplePdf(true);

    const compRes = await compressPdfDocument(originalBytes, { level: 'recommended' });
    const compBytes = new Uint8Array(await compRes.blob.arrayBuffer());

    // Extract text using PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: compBytes });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);
    const textContent = await page.getTextContent();

    const extractedText = textContent.items
      .map((it: any) => it.str)
      .join(' ');

    assert.ok(
      extractedText.includes('KloudPDF Phase 5 Searchable Vector Text Content'),
      'Searchable text must be preserved after compression'
    );
    assert.ok(
      extractedText.includes('Second line of confidential searchable document content.'),
      'Secondary line of text must be intact'
    );
  });
});

describe('3. Guard Against False Claims of Compression', () => {
  test('returns original file and isAlreadyOptimized when document cannot be reduced', async () => {
    // Create an already minimal text-only PDF with no images or extraneous metadata
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Minimal', { x: 50, y: 50, size: 10, font });
    const minimalBytes = await doc.save({ useObjectStreams: true });

    // Request compression on already minimal document
    const res = await compressPdfDocument(minimalBytes, { level: 'low' });

    if (res.isAlreadyOptimized) {
      assert.strictEqual(res.savedBytes, 0);
      assert.strictEqual(res.savingsPercentage, 0);
      assert.ok(res.message?.includes('already highly optimized'));
      // Verify returned blob matches original size
      assert.strictEqual(res.blob.size, minimalBytes.length);
    } else {
      // If savings occurred, savedBytes must be strictly positive
      assert.ok(res.savedBytes > 0);
    }
  });
});

describe('4. Metadata Removal & Lossless Object Stream Packaging', () => {
  test('strips /Info metadata and XMP catalog stream when requested', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    doc.setTitle('Sensitive Secret Project');
    doc.setAuthor('John Doe');
    doc.setSubject('Classified');
    doc.setKeywords(['confidential', 'nda']);
    // Add dummy Metadata stream
    const metadataStream = doc.context.stream('<x:xmpmeta>secret</x:xmpmeta>');
    const metaRef = doc.context.register(metadataStream);
    doc.catalog.set(PDFName.of('Metadata'), metaRef);
    const originalBytes = await doc.save();

    const res = await compressPdfDocument(originalBytes, {
      level: 'custom',
      customSettings: {
        removeMetadata: true,
        losslessOptimization: true,
      },
    });

    const sanitizedDoc = await PDFDocument.load(await res.blob.arrayBuffer());
    assert.strictEqual(sanitizedDoc.getTitle(), '');
    assert.strictEqual(sanitizedDoc.getAuthor(), '');
    assert.strictEqual(sanitizedDoc.getSubject(), '');
    assert.strictEqual(sanitizedDoc.catalog.has(PDFName.of('Metadata')), false);
  });
});

describe('5. Target File Size Bounded Iteration', () => {
  test('executes bounded iterative optimization for target file size', async () => {
    const originalBytes = await createSamplePdf(true);

    const res = await compressPdfDocument(originalBytes, {
      level: 'recommended',
      targetFileSizeKb: 5, // Request tight target
    });

    assert.ok(res.blob.size > 0);
    assert.notStrictEqual(res.targetReached, undefined);
    assert.ok(typeof res.message === 'string');
    // Ensure it stopped in bounded time without hanging
    assert.ok(res.durationMs < 10000);
  });
});

describe('6. Batch Processing Queue & Fault Isolation', () => {
  test('processes multiple files independently; one failure does not halt the batch', async () => {
    const docBytes1 = await createSamplePdf(false);
    const docBytes2 = await createSamplePdf(false);

    // Mock Files for Node.js
    const validFile1 = new File([docBytes1], 'doc1.pdf', { type: 'application/pdf' });
    const validFile2 = new File([docBytes2], 'doc2.pdf', { type: 'application/pdf' });
    // Corrupt file (not a PDF)
    const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], 'corrupt.pdf', {
      type: 'application/pdf',
    });

    const items: BatchItem[] = [
      {
        id: '1',
        file: validFile1,
        name: 'doc1.pdf',
        size: validFile1.size,
        status: 'pending',
        progress: 0,
      },
      {
        id: '2',
        file: corruptFile,
        name: 'corrupt.pdf',
        size: corruptFile.size,
        status: 'pending',
        progress: 0,
      },
      {
        id: '3',
        file: validFile2,
        name: 'doc2.pdf',
        size: validFile2.size,
        status: 'pending',
        progress: 0,
      },
    ];

    let overallCompleted = 0;
    const finalItems = await executeBatchQueue(items, {
      operation: 'rotate',
      config: { angle: 90 },
      concurrency: 2,
      onOverallProgress: (comp) => {
        overallCompleted = comp;
      },
    });

    assert.strictEqual(overallCompleted, 3);
    assert.strictEqual(finalItems[0]?.status, 'completed');
    assert.strictEqual(finalItems[1]?.status, 'failed');
    assert.ok(finalItems[1]?.errorMessage);
    assert.strictEqual(finalItems[2]?.status, 'completed');
  });
});

describe('7. Batch Cancellation Support', () => {
  test('gracefully cancels pending items when abort signal is triggered', async () => {
    const docBytes = await createSamplePdf(false);
    const file = new File([docBytes], 'doc.pdf', { type: 'application/pdf' });

    const items: BatchItem[] = Array.from({ length: 4 }, (_, i) => ({
      id: String(i + 1),
      file,
      name: `doc_${i + 1}.pdf`,
      size: file.size,
      status: 'pending',
      progress: 0,
    }));

    const controller = new AbortController();
    controller.abort(); // Pre-emptively abort

    const finalItems = await executeBatchQueue(items, {
      operation: 'rotate',
      config: { angle: 90 },
      signal: controller.signal,
    });

    for (const it of finalItems) {
      assert.ok(
        it.status === 'cancelled' || it.status === 'failed',
        `Item status should be cancelled or failed, got: ${it.status}`
      );
    }
  });
});

describe('8. Batch ZIP Archive Packaging', () => {
  test('bundles completed items into a valid ZIP archive', async () => {
    const docBytes1 = await createSamplePdf(false);
    const docBytes2 = await createSamplePdf(false);

    const items: BatchItem[] = [
      {
        id: '1',
        file: new File([docBytes1], 'first.pdf'),
        name: 'first.pdf',
        size: docBytes1.length,
        status: 'completed',
        progress: 100,
        resultBlob: new Blob([docBytes1], { type: 'application/pdf' }),
        resultFilename: 'first_rotated.pdf',
      },
      {
        id: '2',
        file: new File([docBytes2], 'second.pdf'),
        name: 'second.pdf',
        size: docBytes2.length,
        status: 'completed',
        progress: 100,
        resultBlob: new Blob([docBytes2], { type: 'application/pdf' }),
        resultFilename: 'second_rotated.pdf',
      },
    ];

    const zipBlob = await createBatchZip(items);
    assert.ok(zipBlob instanceof Blob);
    assert.ok(zipBlob.size > 0);

    // Verify ZIP contains both files
    const zipData = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    assert.ok(zipData.file('first_rotated.pdf'));
    assert.ok(zipData.file('second_rotated.pdf'));
  });
});

describe('9. Reusable Presets Management', () => {
  test('provides built-in presets and supports custom preset configuration', () => {
    const presets = getBatchPresets();
    assert.ok(presets.length >= BUILT_IN_PRESETS.length);

    const emailPreset = presets.find((p) => p.id === 'email-ready-compression');
    assert.ok(emailPreset);
    assert.strictEqual(emailPreset.operation, 'compress');
    assert.strictEqual(emailPreset.config.level, 'recommended');

    const custom = saveBatchPreset({
      id: 'test-preset-unit-1',
      name: 'Custom Test Preset',
      description: 'Test preset description',
      operation: 'watermark',
      config: {
        text: 'TEST_PRESET',
        opacity: 0.5,
        password: 'should_be_stripped', // Sensitive key must be stripped!
      },
      isBuiltIn: false,
    });

    assert.strictEqual(custom.name, 'Custom Test Preset');
    assert.strictEqual(custom.config.password, undefined, 'Sensitive keys must never be saved');

    const deleted = deleteBatchPreset('test-preset-unit-1');
    assert.strictEqual(deleted, true);
  });
});
