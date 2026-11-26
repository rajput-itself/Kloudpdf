import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { convertPdfToWord } from '../services/conversion/pdfToWord';
import { extractTablesFromPdf, exportTablesToSpreadsheet } from '../services/conversion/pdfToExcel';
import { convertPdfToPptx } from '../services/conversion/pdfToPptx';
import { convertTextOrMarkdownToPdf } from '../services/conversion/textAndMarkdownToPdf';
import { validateFileSignature, isSafeZipPath } from '../utils/fileSecurity';

if (typeof window === 'undefined') {
  try {
    const workerUrl = new URL(
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'file://' + process.cwd() + '/'
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // ignore
  }
}

describe('Phase 6: Advanced Conversions & Security Validation', () => {
  test('PDF to Word produces a valid DOCX with headings and tabular rows', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const regFont = await doc.embedFont(StandardFonts.Helvetica);

    page.drawText('Annual Security Report', { x: 50, y: 740, size: 22, font: boldFont });
    page.drawText('Executive overview of browser-only document architecture.', {
      x: 50,
      y: 700,
      size: 11,
      font: regFont,
    });
    // Multi-column row pair for table detection
    page.drawText('Metric', { x: 50, y: 650, size: 11, font: boldFont });
    page.drawText('Result', { x: 260, y: 650, size: 11, font: boldFont });
    page.drawText('Uploads', { x: 50, y: 630, size: 11, font: regFont });
    page.drawText('Zero', { x: 260, y: 630, size: 11, font: regFont });

    const bytes = await doc.save();
    const file = new File([bytes], 'report.pdf', { type: 'application/pdf' });

    const res = await convertPdfToWord(file, { enableOcrFallback: false });
    assert.strictEqual(res.filename, 'report.docx');
    assert.ok(res.tablesDetected >= 1, 'Expected coordinate table reconstruction');

    const zip = await JSZip.loadAsync(await res.blob.arrayBuffer());
    const docXml = await zip.file('word/document.xml')?.async('text');
    assert.ok(docXml, 'DOCX must contain word/document.xml');
    assert.ok(docXml.includes('Annual Security Report'));
    assert.ok(docXml.includes('Zero'));
  });

  test('PDF to Excel extracts coordinate tables and exports valid XLSX and CSV', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    page.drawText('Item', { x: 50, y: 720, size: 11, font });
    page.drawText('Qty', { x: 220, y: 720, size: 11, font });
    page.drawText('Total', { x: 380, y: 720, size: 11, font });

    page.drawText('License', { x: 50, y: 700, size: 11, font });
    page.drawText('5', { x: 220, y: 700, size: 11, font });
    page.drawText('$0', { x: 380, y: 700, size: 11, font });

    const bytes = await doc.save();
    const file = new File([bytes], 'invoice.pdf', { type: 'application/pdf' });

    const extracted = await extractTablesFromPdf(file, { enableOcrFallback: false });
    assert.ok(extracted.tables.length >= 1, 'Expected at least 1 extracted table');
    assert.strictEqual(extracted.tables[0]!.rows.length, 2);
    assert.strictEqual(extracted.tables[0]!.rows[1]![0], 'License');

    const xlsxOut = exportTablesToSpreadsheet(extracted.tables, 'xlsx', 'invoice.pdf');
    assert.strictEqual(xlsxOut.filename, 'invoice_tables.xlsx');
    const wb = XLSX.read(await xlsxOut.blob.arrayBuffer(), { type: 'array' });
    assert.ok(wb.SheetNames.length >= 1);

    const csvOut = exportTablesToSpreadsheet(extracted.tables, 'csv', 'invoice.pdf');
    const csvText = await csvOut.blob.text();
    assert.ok(csvText.includes('Item,Qty,Total'));
    assert.ok(csvText.includes('License,5,$0'));
  });

  test('PDF to PowerPoint exports valid PPTX slides in editable reconstruction mode', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([720, 405]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawText('KloudPDF Slide One', { x: 60, y: 300, size: 24, font });

    const bytes = await doc.save();
    const file = new File([bytes], 'deck.pdf', { type: 'application/pdf' });

    const pptxRes = await convertPdfToPptx(file, {
      mode: 'editable',
      aspectRatio: '16:9',
    });
    assert.strictEqual(pptxRes.filename, 'deck.pptx');
    assert.strictEqual(pptxRes.slideCount, 1);

    const zip = await JSZip.loadAsync(await pptxRes.blob.arrayBuffer());
    const slide1 = await zip.file('ppt/slides/slide1.xml')?.async('text');
    assert.ok(slide1, 'PPTX must contain ppt/slides/slide1.xml');
    assert.ok(slide1.includes('KloudPDF Slide One'));
  });

  test('Text and Markdown to PDF generates crisp searchable vector PDFs', async () => {
    const md = '# Release Notes\n\n- Client-side PDF engine\n- Zero uploads\n\n> Built with pdf-lib.';
    const pdfBlob = await convertTextOrMarkdownToPdf(md, { isMarkdown: true });
    const bytes = new Uint8Array(await pdfBlob.arrayBuffer());

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    assert.strictEqual(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(' ');
    assert.ok(text.includes('Release Notes'));
    assert.ok(text.includes('Client-side PDF engine'));
  });

  test('Magic-byte file validator rejects spoofed extensions and Zip Slip paths', async () => {
    const fakePdf = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'malware.pdf', {
      type: 'application/pdf',
    });
    const pdfCheck = await validateFileSignature(fakePdf, '.pdf');
    assert.strictEqual(pdfCheck.valid, false);
    assert.ok(pdfCheck.reason?.includes('%PDF-'));

    const fakePng = new File([new TextEncoder().encode('<html>script</html>')], 'fake.png', {
      type: 'image/png',
    });
    const pngCheck = await validateFileSignature(fakePng, '.png');
    assert.strictEqual(pngCheck.valid, false);

    assert.strictEqual(isSafeZipPath('ppt/media/image1.png'), true);
    assert.strictEqual(isSafeZipPath('../../etc/passwd'), false);
    assert.strictEqual(isSafeZipPath('/absolute/path'), false);
  });
});
