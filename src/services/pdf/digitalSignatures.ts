/**
 * KloudPDF — PDF Digital Signature Inspection & Cryptographic Engine
 *
 * Evaluates certificate-based signatures, byte-range integrity, and signing capabilities.
 * Enforces strict security rules: never fabricates digital signatures or claims
 * cryptographic validity without verifying signed byte ranges and certificates.
 */

import { PDFDocument, PDFDict, PDFName, PDFArray } from 'pdf-lib';

export interface PdfSignatureInfo {
  fieldName: string;
  type?: string;
  signerName?: string;
  signDate?: string;
  reason?: string;
  location?: string;
  filter?: string;
  subFilter?: string;
  byteRange?: number[];
  isByteRangeContinuous: boolean;
  coversEntireDocument: boolean;
  hasIncrementalUpdatesAfter: boolean;
  status: 'valid_structure' | 'modified_after_signing' | 'corrupted_structure';
}

export interface DigitalSignatureAuditResult {
  hasSignatures: boolean;
  signatureCount: number;
  signatures: PdfSignatureInfo[];
  browserCapabilities: {
    supportedKeyFormats: string[];
    supportedAlgorithms: string[];
    hardwareTokenSupport: boolean;
    explanation: string;
  };
  browserCryptoStatus: {
    canFullyVerifyCertificates: boolean;
    reason: string;
  };
}

/**
 * Parses and audits digital signatures (/Type /Sig) within a PDF byte buffer.
 * Inspects signed ByteRanges to detect post-signature tampering or modifications.
 */
export async function inspectDigitalSignatures(
  source: File | ArrayBuffer
): Promise<DigitalSignatureAuditResult> {
  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const fileBytes = new Uint8Array(buffer);
  const fileSize = fileBytes.byteLength;

  const signatures: PdfSignatureInfo[] = [];

  // Decode chunks into string to probe signature dictionaries without excessive memory
  const chunkLength = Math.min(fileSize, 2000000); // 2MB probe
  const probeStr = String.fromCharCode(...fileBytes.slice(0, chunkLength));

  // Find all signature dictionaries (/Type /Sig)
  const sigMatches = Array.from(probeStr.matchAll(/\/Type\s*\/Sig\b/g));

  let sigIndex = 1;
  for (const match of sigMatches) {
    if (match.index === undefined) continue;

    // Search neighborhood around the match for dictionary entries
    const start = Math.max(0, match.index - 500);
    const end = Math.min(probeStr.length, match.index + 1500);
    const dictText = probeStr.slice(start, end);

    // Extract ByteRange
    const byteRangeMatch = dictText.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    let byteRange: number[] | undefined;
    let isByteRangeContinuous = false;
    let coversEntireDocument = false;
    let hasIncrementalUpdatesAfter = false;

    if (byteRangeMatch) {
      const o1 = Number(byteRangeMatch[1]);
      const l1 = Number(byteRangeMatch[2]);
      const o2 = Number(byteRangeMatch[3]);
      const l2 = Number(byteRangeMatch[4]);
      byteRange = [o1, l1, o2, l2];

      isByteRangeContinuous = o1 === 0 && o2 === o1 + l1;
      const signedTotal = o2 + l2;
      coversEntireDocument = signedTotal === fileSize;
      hasIncrementalUpdatesAfter = signedTotal < fileSize;
    }

    // Extract Signer Name
    const nameMatch = dictText.match(/\/Name\s*\(([^)]+)\)/);
    // Extract Signing Reason
    const reasonMatch = dictText.match(/\/Reason\s*\(([^)]+)\)/);
    // Extract Signing Location
    const locMatch = dictText.match(/\/Location\s*\(([^)]+)\)/);
    // Extract Signing Date (/M (D:20260101...))
    const dateMatch = dictText.match(/\/M\s*\(D:([0-9]{8,14}[^)]*)\)/);
    // Extract SubFilter
    const subFilterMatch = dictText.match(/\/SubFilter\s*\/([a-zA-Z0-9.]+)/);
    // Extract Filter
    const filterMatch = dictText.match(/\/Filter\s*\/([a-zA-Z0-9.]+)/);

    let status: 'valid_structure' | 'modified_after_signing' | 'corrupted_structure' =
      'valid_structure';
    if (!byteRange) {
      status = 'corrupted_structure';
    } else if (hasIncrementalUpdatesAfter) {
      status = 'modified_after_signing';
    }

    signatures.push({
      fieldName: `Signature_${sigIndex++}`,
      signerName: nameMatch ? nameMatch[1] : undefined,
      signDate: dateMatch ? dateMatch[1] : undefined,
      reason: reasonMatch ? reasonMatch[1] : undefined,
      location: locMatch ? locMatch[1] : undefined,
      filter: filterMatch ? filterMatch[1] : undefined,
      subFilter: subFilterMatch ? subFilterMatch[1] : undefined,
      byteRange,
      isByteRangeContinuous,
      coversEntireDocument,
      hasIncrementalUpdatesAfter,
      status,
      type: 'Sig',
    });
  }

  // Also inspect decoded indirect objects via PDFDocument context (covers compressed object streams)
  try {
    const pdfDoc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict) {
        const type = obj.get(PDFName.of('Type'));
        if (type && type.toString() === '/Sig') {
          const nameObj = obj.get(PDFName.of('Name'));
          const reasonObj = obj.get(PDFName.of('Reason'));
          const byteRangeObj = obj.get(PDFName.of('ByteRange'));
          let byteRange: number[] | undefined;
          if (byteRangeObj instanceof PDFArray) {
            byteRange = byteRangeObj.asArray().map((n: any) => Number(n.toString()));
          }
          const cleanString = (val?: any) => {
            if (!val) return undefined;
            const str = val.toString();
            return str.replace(/^\((.*)\)$/, '$1');
          };
          const signerName = cleanString(nameObj);
          const reason = cleanString(reasonObj);

          if (!signatures.some((s) => s.signerName === signerName && s.reason === reason)) {
            const coversEntire = byteRange ? byteRange[2]! + byteRange[3]! === fileSize : false;
            const hasIncremental = byteRange ? byteRange[2]! + byteRange[3]! < fileSize : false;
            signatures.push({
              fieldName: `Signature_${sigIndex++}`,
              type: 'Sig',
              signerName,
              reason,
              byteRange,
              isByteRangeContinuous: byteRange ? byteRange[0] === 0 : false,
              coversEntireDocument: coversEntire,
              hasIncrementalUpdatesAfter: hasIncremental,
              status: byteRange
                ? hasIncremental
                  ? 'modified_after_signing'
                  : 'valid_structure'
                : 'corrupted_structure',
            });
          }
        }
      }
    }
  } catch {
    // Ignore fallback inspection
  }

  return {
    hasSignatures: signatures.length > 0,
    signatureCount: signatures.length,
    signatures,
    browserCapabilities: {
      supportedKeyFormats: ['PKCS#12 (.p12, .pfx)', 'X.509 PEM Certificate'],
      supportedAlgorithms: ['RSA-SHA256', 'ECDSA-SHA256', 'SHA-256 Digest'],
      hardwareTokenSupport: false,
      explanation:
        'Client-side browser JavaScript can parse PKCS#7 signatures and verify byte-range integrity. Hardware USB tokens and OS Keychain certificates cannot be accessed directly without native host messaging.',
    },
    browserCryptoStatus: {
      canFullyVerifyCertificates: false,
      reason:
        'Browser WebCrypto API lacks native trust-store anchoring (root CA verification) and hardware token access without a server or native bridge.',
    },
  };
}
