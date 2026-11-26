import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ingestUserFiles } from '../services/security/ingestFile';
import { validatePdfStructure, validateExportIntegrity } from '../services/pdf/validation';
import { inspectDigitalSignatures } from '../services/pdf/digitalSignatures';
import { applyPermanentRedaction } from '../services/pdf/redaction';
import { exportEditedPdf } from '../services/pdf/editorExport';
import { ResourceScope } from '../utils/disposableScope';
import { runBoundedPool } from '../utils/taskPool';
import { createDeltaCommand, applyDeltaCommand, EditorDocumentState } from '../utils/historyStack';
import { TOOL_HANDLERS } from '../services/tools/toolRegistry';
import { EditorObject } from '../types/editor';

describe('Architecture Patterns & Security Hardening', () => {
  test('Ingest Chain rejects spoofed PDFs and passes valid PDFs', async () => {
    const spoofed = new File([new TextEncoder().encode('<script>alert(1)</script>')], 'evil.pdf', {
      type: 'application/pdf',
    });
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const validBytes = await doc.save();
    const valid = new File([validBytes], 'valid.pdf', { type: 'application/pdf' });

    const res = await ingestUserFiles([spoofed, valid], '.pdf');
    assert.strictEqual(res.validFiles.length, 1);
    assert.strictEqual(res.validFiles[0]!.name, 'valid.pdf');
    assert.strictEqual(res.errors.length, 1);
  });

  test('Validation & Digital Signatures handle PDFs > 200 KB without stack overflow', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const bigStream = doc.context.stream(new Uint8Array(260_000).fill(65));
    const bigRef = doc.context.register(bigStream);
    doc.catalog.set(doc.context.obj('KloudPad') as any, bigRef);
    const bigBytes = await doc.save({ useObjectStreams: false });
    assert.ok(bigBytes.byteLength > 200_000, `Expected >200KB, got ${bigBytes.byteLength}`);

    const validation = await validatePdfStructure(bigBytes.buffer);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.canBeOpened, true);
    assert.strictEqual(validation.pageCount, 1);

    const sigs = await inspectDigitalSignatures(bigBytes.buffer);
    assert.strictEqual(sigs.hasSignatures, false);
  });

  test('Fail-Closed Redaction removes text even in auto mode and Editor export', async () => {
    const secret = 'TOP_SECRET_449911';
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([500, 500]);
    page.drawText(secret, { x: 40, y: 400, size: 14, font });
    const bytes = await doc.save();

    // Auto mode must still fail-closed (never leave extractable text under rectangle)
    const autoRes = await applyPermanentRedaction(
      bytes,
      [{ id: 'r1', pageNumber: 1, x: 35, y: 80, width: 220, height: 30 }],
      { mode: 'auto' }
    );
    const autoIntegrity = await validateExportIntegrity(autoRes.blob, { checkRedactionOf: [secret] });
    assert.strictEqual(autoIntegrity.residualFound.length, 0);

    // Editor export with redaction object must also destroy underlying text
    const redactionObj: EditorObject = {
      id: 'ed_red_1',
      pageNumber: 1,
      type: 'redaction',
      x: 35,
      y: 80,
      width: 220,
      height: 30,
      fillColor: '#000000',
      strokeColor: '#000000',
      opacity: 1,
    };
    const editedBlob = await exportEditedPdf(bytes, [redactionObj]);
    const editIntegrity = await validateExportIntegrity(editedBlob, { checkRedactionOf: [secret] });
    assert.strictEqual(editIntegrity.residualFound.length, 0);
  });

  test('ResourceScope executes cleanups in LIFO order and ignores double-dispose', () => {
    const order: string[] = [];
    const scope = new ResourceScope();
    scope.track(() => order.push('first'));
    scope.track(() => order.push('second'));
    scope.dispose();
    scope.dispose();
    assert.deepStrictEqual(order, ['second', 'first']);
  });

  test('Bounded Task Pool limits concurrency and supports AbortSignal cancellation', async () => {
    const controller = new AbortController();
    const processed: number[] = [];
    const cancelled: number[] = [];

    await runBoundedPool(
      [1, 2, 3, 4],
      async (item) => {
        processed.push(item);
        if (item === 2) controller.abort();
      },
      {
        concurrency: 1,
        signal: controller.signal,
        onCancelRemaining: (rem) => cancelled.push(rem),
      }
    );

    assert.deepStrictEqual(processed, [1, 2]);
    assert.deepStrictEqual(cancelled, [3, 4]);
  });

  test('Delta Command undo/redo reverts and reapplies object and text edits accurately', () => {
    const s0: EditorDocumentState = {
      objects: [],
      contentEdits: { modifiedTexts: {}, modifiedImages: {} },
    };
    const obj: EditorObject = {
      id: 'txt_1',
      pageNumber: 1,
      type: 'text',
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      text: 'Hello',
      fontSize: 12,
      fontFamily: 'Helvetica',
      color: '#000000',
      isBold: false,
      isItalic: false,
      lineHeight: 1.2,
      textAlign: 'left',
      opacity: 1,
    };
    const s1: EditorDocumentState = {
      objects: [obj],
      contentEdits: { modifiedTexts: {}, modifiedImages: {} },
    };

    const cmd = createDeltaCommand(s0, s1);
    assert.ok(cmd);

    const undone = applyDeltaCommand(s1, cmd, 'undo');
    assert.strictEqual(undone.objects.length, 0);

    const redone = applyDeltaCommand(undone, cmd, 'redo');
    assert.strictEqual(redone.objects.length, 1);
    assert.strictEqual(redone.objects[0]!.id, 'txt_1');
  });

  test('ToolRegistry covers workspace tools and omits standalone workspaces', () => {
    assert.ok(TOOL_HANDLERS.merge);
    assert.ok(TOOL_HANDLERS.rotate);
    assert.ok(TOOL_HANDLERS['word-to-pdf']);
    assert.strictEqual(TOOL_HANDLERS['ocr-pdf'], undefined);
    assert.strictEqual(TOOL_HANDLERS['redact-pdf'], undefined);
  });
});
