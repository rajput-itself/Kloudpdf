/**
 * KloudPDF — Visual PDF Editor Test Suite
 * Validates text insertion, image embedding, shapes, coordinate transformations,
 * undo/redo history, multipage documents, page rotations, and PDF roundtrip loading.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  screenToPdf,
  pdfToScreen,
  pdfRectToScreenRect,
  hexToPdfRgb,
  calculatePointsBoundingBox,
  toPdfLibCoordinates,
} from '../services/pdf/editorCoordinates';
import { exportEditedPdf } from '../services/pdf/editorExport';
import {
  EditorObject,
  TextEditorObject,
  ImageEditorObject,
  ShapeEditorObject,
  HighlightEditorObject,
  DrawingEditorObject,
  SignatureEditorObject,
} from '../types/editor';

describe('1. Coordinate Transformations & Zoom Accuracy', () => {
  test('converts screen pixels to PDF points accurately at 100% zoom', () => {
    const pt = screenToPdf(100, 1.0);
    assert.strictEqual(pt, 100);
  });

  test('converts screen pixels to PDF points at 150% zoom', () => {
    const pt = screenToPdf(150, 1.5);
    assert.strictEqual(pt, 100);
  });

  test('converts PDF points to screen pixels at 200% zoom', () => {
    const px = pdfToScreen(100, 2.0);
    assert.strictEqual(px, 200);
  });

  test('converts PDF rectangles to screen rectangles', () => {
    const screenRect = pdfRectToScreenRect(
      { x: 50, y: 80, width: 200, height: 100 },
      1.5
    );
    assert.strictEqual(screenRect.left, 75);
    assert.strictEqual(screenRect.top, 120);
    assert.strictEqual(screenRect.width, 300);
    assert.strictEqual(screenRect.height, 150);
  });

  test('calculates correct bounding box for freehand points', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 50, y: 15 },
      { x: 30, y: 90 },
      { x: 100, y: 40 },
    ];
    const bbox = calculatePointsBoundingBox(points);
    assert.strictEqual(bbox.x, 10);
    assert.strictEqual(bbox.y, 15);
    assert.strictEqual(bbox.width, 90);
    assert.strictEqual(bbox.height, 75);
  });

  test('converts hex colors to normalized RGB (0-1)', () => {
    const black = hexToPdfRgb('#000000');
    assert.strictEqual(black.r, 0);
    assert.strictEqual(black.g, 0);
    assert.strictEqual(black.b, 0);

    const white = hexToPdfRgb('#ffffff');
    assert.strictEqual(white.r, 1);
    assert.strictEqual(white.g, 1);
    assert.strictEqual(white.b, 1);

    const red = hexToPdfRgb('#ff0000');
    assert.strictEqual(red.r, 1);
    assert.strictEqual(red.g, 0);
    assert.strictEqual(red.b, 0);

    const shortHex = hexToPdfRgb('#fff');
    assert.strictEqual(shortHex.r, 1);
    assert.strictEqual(shortHex.g, 1);
    assert.strictEqual(shortHex.b, 1);
  });
});

describe('2. PDF Coordinate Systems & Page Rotations', () => {
  const pWidth = 595.28; // A4 Width
  const pHeight = 841.89; // A4 Height

  test('standard 0° unrotated page transforms top-left origin to bottom-left origin', () => {
    const coords = toPdfLibCoordinates(50, 100, 200, 40, pWidth, pHeight, 0);
    assert.strictEqual(coords.x, 50);
    // Y in PDF is from bottom: 841.89 - (100 + 40) = 701.89
    assert.ok(Math.abs(coords.y - (841.89 - 140)) < 0.001);
    assert.strictEqual(coords.width, 200);
    assert.strictEqual(coords.height, 40);
    assert.strictEqual(coords.rotateDegrees, 0);
  });

  test('90° rotated page properly transposes coordinates', () => {
    const coords = toPdfLibCoordinates(50, 100, 200, 40, pWidth, pHeight, 90);
    assert.strictEqual(coords.x, 100);
    assert.strictEqual(coords.y, 50);
    assert.strictEqual(coords.width, 40);
    assert.strictEqual(coords.height, 200);
    assert.strictEqual(coords.rotateDegrees, 270);
  });

  test('180° rotated page maps inverted coordinates', () => {
    const coords = toPdfLibCoordinates(50, 100, 200, 40, pWidth, pHeight, 180);
    assert.strictEqual(coords.x, pWidth - 250);
    assert.strictEqual(coords.y, 100);
    assert.strictEqual(coords.rotateDegrees, 180);
  });
});

describe('3. Undo and Redo History Logic', () => {
  test('manages past, present, and future states with bounded limit', () => {
    const MAX_LIMIT = 5;
    let past: number[][] = [];
    let present: number[] = [1];
    let future: number[][] = [];

    const pushState = (next: number[]) => {
      past = [...past, present].slice(-MAX_LIMIT);
      present = next;
      future = [];
    };

    const undo = () => {
      if (past.length === 0) return;
      const prev = past[past.length - 1]!;
      future = [present, ...future];
      present = prev;
      past = past.slice(0, -1);
    };

    const redo = () => {
      if (future.length === 0) return;
      const next = future[0]!;
      past = [...past, present];
      present = next;
      future = future.slice(1);
    };

    // Push states
    pushState([1, 2]);
    pushState([1, 2, 3]);
    assert.deepStrictEqual(present, [1, 2, 3]);
    assert.strictEqual(past.length, 2);

    // Undo
    undo();
    assert.deepStrictEqual(present, [1, 2]);
    assert.strictEqual(future.length, 1);

    // Redo
    redo();
    assert.deepStrictEqual(present, [1, 2, 3]);
    assert.strictEqual(future.length, 0);

    // Overflow boundary test
    for (let i = 4; i <= 15; i++) {
      pushState([i]);
    }
    assert.ok(past.length <= MAX_LIMIT);
  });
});

describe('4. Text, Image, Shape Insertion & PDF Export Roundtrip', () => {
  // Helper to generate a blank 2-page PDF
  async function createTestPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('Sample Page 1 Text', { x: 50, y: 800, size: 12, color: rgb(0, 0, 0) });
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Sample Page 2 Text', { x: 50, y: 800, size: 12, color: rgb(0, 0, 0) });
    return await doc.save();
  }

  // 1x1 transparent PNG data URL for test
  const testPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  test('inserts multiline text across pages and exports valid PDF', async () => {
    const originalBytes = await createTestPdf();

    const textObj: TextEditorObject = {
      id: 'text_1',
      pageNumber: 1,
      type: 'text',
      x: 100,
      y: 150,
      width: 200,
      height: 60,
      text: 'First Line\nSecond Line\nThird Line',
      fontFamily: 'Helvetica',
      fontSize: 16,
      color: '#1a73e8',
      isBold: true,
      isItalic: false,
      lineHeight: 1.3,
      textAlign: 'left',
    };

    const exportedBlob = await exportEditedPdf(originalBytes, [textObj]);
    assert.strictEqual(exportedBlob.type, 'application/pdf');
    assert.ok(exportedBlob.size > 500);

    // Verify reopening exported PDF
    const arrayBuf = await exportedBlob.arrayBuffer();
    const loadedDoc = await PDFDocument.load(arrayBuf);
    assert.strictEqual(loadedDoc.getPageCount(), 2);
  });

  test('inserts image and shapes (rectangle, circle, line, arrow, highlight)', async () => {
    const originalBytes = await createTestPdf();

    const imageObj: ImageEditorObject = {
      id: 'img_1',
      pageNumber: 1,
      type: 'image',
      x: 50,
      y: 200,
      width: 100,
      height: 100,
      dataUrl: testPngDataUrl,
      mimeType: 'image/png',
      aspectRatio: 1,
    };

    const rectObj: ShapeEditorObject = {
      id: 'rect_1',
      pageNumber: 1,
      type: 'rectangle',
      x: 200,
      y: 200,
      width: 80,
      height: 60,
      strokeColor: '#202124',
      strokeWidth: 2,
      fillColor: '#e8f0fe',
    };

    const circleObj: ShapeEditorObject = {
      id: 'circle_1',
      pageNumber: 1,
      type: 'circle',
      x: 300,
      y: 200,
      width: 50,
      height: 50,
      strokeColor: '#137333',
      strokeWidth: 2,
      fillColor: 'transparent',
    };

    const highlightObj: HighlightEditorObject = {
      id: 'hl_1',
      pageNumber: 2,
      type: 'highlight',
      x: 50,
      y: 50,
      width: 150,
      height: 20,
      color: '#ffeb3b',
      opacity: 0.35,
    };

    const objects: EditorObject[] = [imageObj, rectObj, circleObj, highlightObj];
    const exportedBlob = await exportEditedPdf(originalBytes, objects);

    assert.strictEqual(exportedBlob.type, 'application/pdf');
    const arrayBuf = await exportedBlob.arrayBuffer();
    const loadedDoc = await PDFDocument.load(arrayBuf);
    assert.strictEqual(loadedDoc.getPageCount(), 2);
  });

  test('inserts freehand drawing and signature onto document', async () => {
    const originalBytes = await createTestPdf();

    const drawObj: DrawingEditorObject = {
      id: 'draw_1',
      pageNumber: 1,
      type: 'drawing',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 30 },
        { x: 50, y: 80 },
        { x: 110, y: 110 },
      ],
      strokeColor: '#d93025',
      strokeWidth: 3,
    };

    const sigObj: SignatureEditorObject = {
      id: 'sig_1',
      pageNumber: 2,
      type: 'signature',
      x: 150,
      y: 400,
      width: 180,
      height: 70,
      dataUrl: testPngDataUrl,
      strokeColor: '#1a73e8',
    };

    const exportedBlob = await exportEditedPdf(originalBytes, [drawObj, sigObj]);
    assert.strictEqual(exportedBlob.type, 'application/pdf');

    const arrayBuf = await exportedBlob.arrayBuffer();
    const loadedDoc = await PDFDocument.load(arrayBuf);
    assert.strictEqual(loadedDoc.getPageCount(), 2);
  });
});
