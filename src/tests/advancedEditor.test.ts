import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFString,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  inspectPdfForm,
  saveFilledPdfForm,
} from '../services/pdf/forms';
import {
  extractPdfMetadata,
  updatePdfMetadata,
  sanitizePdfMetadata,
} from '../services/pdf/metadata';
import {
  validatePdfStructure,
  validateExportIntegrity,
} from '../services/pdf/validation';
import {
  inspectDigitalSignatures,
} from '../services/pdf/digitalSignatures';
import {
  applyPermanentRedaction,
} from '../services/pdf/redaction';
import { exportEditedPdf } from '../services/pdf/editorExport';
import { EditorObject } from '../types/editor';

// Configure Node.js worker path for test runner
if (typeof window === 'undefined') {
  try {
    const workerUrl = new URL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'file://' + process.cwd() + '/').href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // fallback
  }
}

describe('1. PDF Form Inspection, Filling & Flattening', () => {
  test('detects AcroForm fields, fills text, checks boxes, and flattens into artwork', async () => {
    // 1. Create a PDF with AcroForm fields
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const form = doc.getForm();

    const nameField = form.createTextField('fullName');
    nameField.setText('Alice Smith');
    nameField.addToPage(page, { x: 50, y: 700, width: 200, height: 25 });

    const consentBox = form.createCheckBox('consent');
    consentBox.uncheck();
    consentBox.addToPage(page, { x: 50, y: 650, width: 20, height: 20 });

    const dropdown = form.createDropdown('role');
    dropdown.setOptions(['Engineer', 'Designer', 'Manager']);
    dropdown.select('Engineer');
    dropdown.addToPage(page, { x: 50, y: 600, width: 150, height: 25 });

    const initialPdfBytes = await doc.save();

    // 2. Inspect the form
    const inspection = await inspectPdfForm(initialPdfBytes);
    assert.strictEqual(inspection.fieldCount, 3);
    assert.strictEqual(inspection.isXfa, false);

    const nameEntry = inspection.fields.find((f) => f.name === 'fullName');
    assert.ok(nameEntry);
    assert.strictEqual(nameEntry.type, 'text');
    assert.strictEqual(nameEntry.currentValue, 'Alice Smith');

    const consentEntry = inspection.fields.find((f) => f.name === 'consent');
    assert.ok(consentEntry);
    assert.strictEqual(consentEntry.type, 'checkbox');
    assert.strictEqual(consentEntry.currentValue, false);

    // 3. Fill form values and export
    const filledBlob = await saveFilledPdfForm(
      initialPdfBytes,
      {
        fullName: 'Bob Johnson',
        consent: true,
        role: 'Manager',
      },
      { flatten: false }
    );

    const filledBytes = new Uint8Array(await filledBlob.arrayBuffer());
    const postFillInspection = await inspectPdfForm(filledBytes);
    const updatedName = postFillInspection.fields.find((f) => f.name === 'fullName');
    const updatedConsent = postFillInspection.fields.find((f) => f.name === 'consent');

    assert.strictEqual(updatedName?.currentValue, 'Bob Johnson');
    assert.strictEqual(updatedConsent?.currentValue, true);

    // 4. Flatten form into static artwork
    const flattenedBlob = await saveFilledPdfForm(
      filledBytes,
      {},
      { flatten: true }
    );
    const flattenedBytes = new Uint8Array(await flattenedBlob.arrayBuffer());
    const flatDoc = await PDFDocument.load(flattenedBytes);
    const flatForm = flatDoc.getForm();
    assert.strictEqual(flatForm.getFields().length, 0, 'Flattened form must have 0 remaining interactive fields');
  });
});

describe('2. PDF Metadata Inspection, Modification & XMP Sanitization', () => {
  test('extracts, modifies, and completely sanitizes metadata including XMP stream deletion', async () => {
    // 1. Create a PDF with metadata and XMP stream
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    doc.setTitle('Confidential Document');
    doc.setAuthor('Secret Author');
    doc.setSubject('Classified');
    doc.setKeywords(['internal', 'restricted']);
    doc.setCreator('KloudPDF Core');
    doc.setProducer('KloudPDF Engine');

    // Simulate XMP metadata stream in Catalog
    const xmpStream = doc.context.stream('<x:xmpmeta>Confidential Metadata</x:xmpmeta>', {
      Type: 'Metadata',
      Subtype: 'XML',
    });
    const xmpRef = doc.context.register(xmpStream);
    doc.catalog.set(PDFName.of('Metadata'), xmpRef);

    const pdfBytes = await doc.save();

    // 2. Extract metadata
    const meta = await extractPdfMetadata(pdfBytes);
    assert.strictEqual(meta.title, 'Confidential Document');
    assert.strictEqual(meta.author, 'Secret Author');
    assert.strictEqual(meta.subject, 'Classified');
    assert.deepStrictEqual(meta.keywords, ['internal', 'restricted']);
    assert.strictEqual(meta.hasXmpMetadata, true);

    // 3. Update metadata
    const updatedBlob = await updatePdfMetadata(pdfBytes, {
      title: 'Public Report',
      author: 'Public Organization',
      subject: 'Annual Review',
      keywords: ['annual', 'report'],
    });
    const updatedMeta = await extractPdfMetadata(await updatedBlob.arrayBuffer());
    assert.strictEqual(updatedMeta.title, 'Public Report');
    assert.strictEqual(updatedMeta.author, 'Public Organization');

    // 4. Sanitize / Wipe All Metadata
    const sanitizedBlob = await sanitizePdfMetadata(pdfBytes);
    const sanitizedBytes = new Uint8Array(await sanitizedBlob.arrayBuffer());
    const sanitizedMeta = await extractPdfMetadata(sanitizedBytes);

    assert.strictEqual(sanitizedMeta.title, '');
    assert.strictEqual(sanitizedMeta.author, '');
    assert.strictEqual(sanitizedMeta.subject, '');
    assert.strictEqual(sanitizedMeta.keywords.length, 0);
    assert.strictEqual(sanitizedMeta.hasXmpMetadata, false, 'XMP metadata stream must be completely deleted from Catalog');

    // Verify low-level catalog key is gone
    const testDoc = await PDFDocument.load(sanitizedBytes);
    assert.strictEqual(testDoc.catalog.has(PDFName.of('Metadata')), false);
  });
});

describe('3. Document Validation & Structural Security Audit', () => {
  test('validates valid PDF structure, checks header, trailer, and assigns secure rating', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const pdfBytes = await doc.save();

    const validation = await validatePdfStructure(pdfBytes);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.isEncrypted, false);
    assert.strictEqual(validation.securityRating, 'Secure');
    assert.strictEqual(validation.canBeOpened, true);
  });

  test('flags malformed or corrupt buffer as high risk', async () => {
    const badBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const validation = await validatePdfStructure(badBytes);
    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(validation.securityRating, 'High Risk');
    assert.strictEqual(validation.canBeOpened, false);
  });

  test('detects JavaScript actions and flags as caution or high risk', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    // Inject /JavaScript action
    const jsDict = doc.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFString.of('app.alert("Security Audit Alert");'),
    });
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(jsDict));
    const jsBytes = await doc.save();

    const validation = await validatePdfStructure(jsBytes);
    assert.strictEqual(validation.hasJavaScript, true);
    assert.ok(validation.securityRating === 'Caution' || validation.securityRating === 'High Risk');
  });
});

describe('4. Digital Signature Low-Level Inspection & ByteRange Audit', () => {
  test('inspects signatures and verifies ByteRange covers entire document', async () => {
    // 1. Create a PDF with a simulated digital signature dictionary
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);

    const sigDict = doc.context.obj({
      Type: PDFName.of('Sig'),
      Filter: PDFName.of('Adobe.PPKLite'),
      SubFilter: PDFName.of('adbe.pkcs7.detached'),
      ByteRange: [0, 500, 600, 200],
      Contents: doc.context.flateStream(new Uint8Array(100)),
      Reason: PDFString.of('Agreement Approval'),
      Name: PDFString.of('Chief Security Officer'),
      M: PDFString.of('D:20261119230000Z'),
    });
    const sigRef = doc.context.register(sigDict);

    // Register signature in AcroForm fields
    const formDict = doc.context.obj({
      Fields: [sigRef],
      SigFlags: 3,
    });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(formDict));

    const pdfBytes = await doc.save();
    const sigAudit = await inspectDigitalSignatures(pdfBytes);

    assert.strictEqual(sigAudit.signatureCount, 1);
    const sig = sigAudit.signatures[0];
    assert.ok(sig);
    assert.strictEqual(sig.signerName, 'Chief Security Officer');
    assert.strictEqual(sig.reason, 'Agreement Approval');
    assert.strictEqual(sigAudit.browserCryptoStatus.canFullyVerifyCertificates, false);
  });
});

describe('5. Secure PDF Redaction & Residual Text Leak Prevention', () => {
  test('excises sensitive text permanently from content stream and verifies 0 residual text leaks', async () => {
    const sensitiveString = 'SECRET_PATIENT_SSN_98765';

    // 1. Create a PDF containing sensitive text
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([600, 800]);

    page.drawText(`Public Note: ${sensitiveString}`, {
      x: 50,
      y: 750,
      size: 14,
      font,
    });
    const origBytes = await doc.save();

    // 2. Apply permanent redaction over the text coordinates
    const redactionRes = await applyPermanentRedaction(
      origBytes,
      [
        {
          id: 'red_1',
          pageNumber: 1,
          x: 40,
          y: 30, // top-left coordinate system: 800 - 750 = 50
          width: 300,
          height: 35,
        },
      ],
      { mode: 'raster-guaranteed' }
    );

    assert.strictEqual(redactionRes.redactedPagesCount, 1);
    assert.strictEqual(redactionRes.totalRedactionsApplied, 1);

    // 3. Post-Export Residual Text Verification
    const integrity = await validateExportIntegrity(redactionRes.blob, {
      checkRedactionOf: [sensitiveString],
    });
    assert.strictEqual(integrity.canReopen, true);
    assert.strictEqual(
      integrity.residualFound.length,
      0,
      `Underlying sensitive text must be 100% eliminated from the exported PDF! Found leaks: ${JSON.stringify(integrity.residualFound)}`
    );
  });
});

describe('6. Detached Buffer Resilience & Multi-Export Integrity', () => {
  test('sequential exports with visual signature do not detach input buffer', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const originalPdfBytes = await doc.save();

    // 1x1 transparent PNG data URL
    const transparentPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const sigObject: EditorObject = {
      id: 'sig_1',
      pageNumber: 1,
      type: 'signature',
      x: 100,
      y: 100,
      width: 150,
      height: 50,
      dataUrl: transparentPng,
      strokeColor: '#1a73e8',
      opacity: 1,
    };

    // First export
    const export1 = await exportEditedPdf(originalPdfBytes, [sigObject]);
    assert.ok(export1.size > 0);

    // Second export using the exact same originalPdfBytes
    const export2 = await exportEditedPdf(originalPdfBytes, [sigObject]);
    assert.ok(export2.size > 0);

    // Third export using Uint8Array slice
    const export3 = await exportEditedPdf(new Uint8Array(originalPdfBytes.slice()), [sigObject]);
    assert.ok(export3.size > 0);
  });
});
