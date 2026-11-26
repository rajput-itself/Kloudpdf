import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'structure' | 'security' | 'compatibility';
  message: string;
}

export interface PdfValidationReport {
  isValid: boolean;
  canBeOpened: boolean;
  pdfVersion: string;
  pageCount: number;
  fileSizeBytes: number;
  isEncrypted: boolean;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasDigitalSignatures: boolean;
  hasAcroForms: boolean;
  hasXfaForms: boolean;
  hasLinearization: boolean;
  issues: ValidationIssue[];
  securityRating: 'Secure' | 'Caution' | 'High Risk';
}

/**
 * Performs a comprehensive structural and security audit of a PDF byte buffer.
 */
export async function validatePdfStructure(
  source: File | ArrayBuffer
): Promise<PdfValidationReport> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const fileSizeBytes = buffer.byteLength;
  const issues: ValidationIssue[] = [];

  // 1. Basic byte checks
  if (fileSizeBytes < 10) {
    return {
      isValid: false,
      canBeOpened: false,
      pdfVersion: 'Unknown',
      pageCount: 0,
      fileSizeBytes,
      isEncrypted: false,
      hasJavaScript: false,
      hasEmbeddedFiles: false,
      hasDigitalSignatures: false,
      hasAcroForms: false,
      hasXfaForms: false,
      hasLinearization: false,
      issues: [
        {
          severity: 'error',
          category: 'structure',
          message: 'File buffer is empty or too small to be a valid PDF document.',
        },
      ],
      securityRating: 'High Risk',
    };
  }

  // 2. Header Check
  const headerBytes = new Uint8Array(buffer.slice(0, 32));
  const headerStr = String.fromCharCode(...headerBytes);
  const headerMatch = headerStr.match(/%PDF-(\d+\.\d+)/);
  const pdfVersion = headerMatch ? headerMatch[1]! : 'Unknown';

  if (!headerMatch) {
    issues.push({
      severity: 'error',
      category: 'structure',
      message: 'Missing standard %PDF-1.x header signature. File may be corrupted or not a PDF.',
    });
  }

  // 3. Trailer / EOF Check
  const tailBytes = new Uint8Array(buffer.slice(Math.max(0, fileSizeBytes - 1024)));
  const tailStr = String.fromCharCode(...tailBytes);
  const hasEof = tailStr.includes('%%EOF');

  if (!hasEof) {
    issues.push({
      severity: 'warning',
      category: 'structure',
      message: 'Missing or truncated %%EOF end-of-file marker. Document may be incomplete.',
    });
  }

  // 4. Low-level text scan for security-sensitive markers
  // (Scan chunks to avoid massive string allocation)
  const probeChunk = new Uint8Array(buffer.slice(0, Math.min(fileSizeBytes, 500000)));
  const probeStr = String.fromCharCode(...probeChunk);

  const hasLinearization = probeStr.includes('/Linearized');
  let hasJavaScript = probeStr.includes('/JavaScript') || probeStr.includes('/JS ');
  let hasEmbeddedFiles = probeStr.includes('/EmbeddedFiles');
  let hasDigitalSignatures = probeStr.includes('/Type /Sig') || probeStr.includes('/ByteRange');

  if (hasJavaScript) {
    issues.push({
      severity: 'warning',
      category: 'security',
      message: 'Active JavaScript actions (/JS) detected. Scripts may execute in certain desktop readers.',
    });
  }

  if (hasEmbeddedFiles) {
    issues.push({
      severity: 'info',
      category: 'security',
      message: 'Document contains embedded file attachments (/EmbeddedFiles).',
    });
  }

  // 5. Deep inspection with PDF-lib and PDF.js
  let canBeOpened = false;
  let pageCount = 0;
  let isEncrypted = false;
  let hasAcroForms = false;
  let hasXfaForms = false;

  try {
    const pdfDoc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    canBeOpened = true;
    pageCount = pdfDoc.getPageCount();

    // Check encryption
    isEncrypted = pdfDoc.isEncrypted;
    if (isEncrypted) {
      issues.push({
        severity: 'info',
        category: 'security',
        message: 'Document is password-encrypted or contains security restrictions.',
      });
    }

    // Deep object inspection (detects compressed /ObjStm objects)
    for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict) {
        if (!hasJavaScript && (obj.has(PDFName.of('JS')) || obj.has(PDFName.of('JavaScript')))) {
          hasJavaScript = true;
          if (!issues.some((i) => i.message.includes('JavaScript'))) {
            issues.push({
              severity: 'warning',
              category: 'security',
              message: 'Active JavaScript actions (/JS) detected in document.',
            });
          }
        }
        if (!hasDigitalSignatures) {
          const type = obj.get(PDFName.of('Type'));
          if (type && type.toString() === '/Sig') {
            hasDigitalSignatures = true;
          }
        }
        if (!hasEmbeddedFiles && obj.has(PDFName.of('EmbeddedFiles'))) {
          hasEmbeddedFiles = true;
        }
      }
    }

    // Check AcroForms
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      hasAcroForms = fields.length > 0;
    } catch {
      hasAcroForms = false;
    }

    // Check XFA
    try {
      const acroFormDict = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
      if (acroFormDict instanceof PDFDict && acroFormDict.has(PDFName.of('XFA'))) {
        hasXfaForms = true;
        issues.push({
          severity: 'warning',
          category: 'compatibility',
          message: 'Dynamic XFA forms detected. Standard AcroForm editors cannot alter dynamic XML forms.',
        });
      }
    } catch {
      hasXfaForms = false;
    }
  } catch (err) {
    canBeOpened = false;
    issues.push({
      severity: 'error',
      category: 'structure',
      message: `PDF parser failure: ${err instanceof Error ? err.message : 'Unknown load error'}`,
    });
  }

  // 6. Secondary PDF.js rendering verification
  if (canBeOpened && typeof window !== 'undefined') {
    try {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      if (pdf.numPages !== pageCount) {
        issues.push({
          severity: 'warning',
          category: 'structure',
          message: `Inconsistent page counts between PDF parsers (${pageCount} vs ${pdf.numPages}).`,
        });
      }
    } catch (renderErr) {
      issues.push({
        severity: 'warning',
        category: 'compatibility',
        message: `PDF.js viewer warning: ${renderErr instanceof Error ? renderErr.message : 'Cannot render pages'}`,
      });
    }
  }

  // Calculate Security Rating
  let securityRating: 'Secure' | 'Caution' | 'High Risk' = 'Secure';
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  if (errorCount > 0 || hasJavaScript) {
    securityRating = 'High Risk';
  } else if (warningCount > 0 || isEncrypted || hasXfaForms) {
    securityRating = 'Caution';
  }

  return {
    isValid: errorCount === 0 && canBeOpened,
    canBeOpened,
    pdfVersion,
    pageCount,
    fileSizeBytes,
    isEncrypted,
    hasJavaScript,
    hasEmbeddedFiles,
    hasDigitalSignatures,
    hasAcroForms,
    hasXfaForms,
    hasLinearization,
    issues,
    securityRating,
  };
}

/**
 * Validates that an exported PDF can be reopened and verifies that zero residual
 * target sensitive strings exist anywhere in extracted text.
 */
export async function validateExportIntegrity(
  pdfBlob: Blob,
  options: { checkRedactionOf?: string[] } = {}
): Promise<{
  success: boolean;
  canReopen: boolean;
  pageCount: number;
  residualFound: string[];
}> {
  const buffer = await pdfBlob.arrayBuffer();
  let canReopen = false;
  let pageCount = 0;
  const residualFound: string[] = [];

  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    canReopen = true;
    pageCount = pdf.numPages;

    // Check for residual sensitive text if requested
    if (options.checkRedactionOf && options.checkRedactionOf.length > 0) {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (item.str ? item.str.toLowerCase() : ''))
          .join(' ');

        for (const target of options.checkRedactionOf) {
          const cleanTarget = target.trim().toLowerCase();
          if (cleanTarget && pageText.includes(cleanTarget)) {
            if (!residualFound.includes(target)) {
              residualFound.push(target);
            }
          }
        }
      }
    }
  } catch {
    canReopen = false;
  }

  return {
    success: canReopen && residualFound.length === 0,
    canReopen,
    pageCount,
    residualFound,
  };
}
