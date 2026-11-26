import DOMPurify from 'dompurify';

export interface FileValidationResult {
  valid: boolean;
  detectedType?: string;
  reason?: string;
}

/**
 * Validates actual binary file headers (magic bytes) rather than trusting extensions or MIME types.
 */
export async function validateFileSignature(
  file: File,
  acceptedTypes: string
): Promise<FileValidationResult> {
  if (!file || file.size === 0) {
    return { valid: false, reason: `File "${file?.name || 'unknown'}" is empty (0 bytes).` };
  }

  const accepted = acceptedTypes
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Read first 4KB for magic byte inspection
  const headerSlice = file.slice(0, Math.min(4096, file.size));
  const buffer = await headerSlice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

  // Check if extension matches accepted list first
  if (accepted.length > 0 && !accepted.some((a) => ext === a || file.type.toLowerCase().includes(a))) {
    return {
      valid: false,
      reason: `Unsupported file format "${file.name}". Allowed: ${acceptedTypes}`,
    };
  }

  // Verify magic bytes according to expected format
  if (ext === '.pdf') {
    const headerAscii = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(0, 1024));
    if (!headerAscii.includes('%PDF-')) {
      return {
        valid: false,
        reason: `"${file.name}" does not have a valid PDF header (%PDF-). The file may be corrupted or spoofed.`,
      };
    }
    return { valid: true, detectedType: 'application/pdf' };
  }

  if (ext === '.png') {
    const isPng =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    if (!isPng) {
      return { valid: false, reason: `"${file.name}" is not a valid PNG image.` };
    }
    return { valid: true, detectedType: 'image/png' };
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isJpeg) {
      return { valid: false, reason: `"${file.name}" is not a valid JPEG image.` };
    }
    return { valid: true, detectedType: 'image/jpeg' };
  }

  if (ext === '.webp') {
    const riff =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    if (!riff) {
      return { valid: false, reason: `"${file.name}" is not a valid WebP image.` };
    }
    return { valid: true, detectedType: 'image/webp' };
  }

  if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
    const isZip =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06);
    if (!isZip) {
      return {
        valid: false,
        reason: `"${file.name}" is not a valid Office Open XML archive.`,
      };
    }
    return { valid: true, detectedType: 'application/zip' };
  }

  if (ext === '.xls') {
    // Either legacy OLE2 compound header (D0 CF 11 E0) or XML/text
    const isOle2 =
      bytes.length >= 4 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0;
    const hasNull = bytes.includes(0x00);
    if (!isOle2 && hasNull) {
      return { valid: false, reason: `"${file.name}" is not a valid .xls spreadsheet.` };
    }
    return { valid: true, detectedType: 'application/vnd.ms-excel' };
  }

  if (ext === '.html' || ext === '.htm' || ext === '.txt' || ext === '.md' || ext === '.csv') {
    // Reject obvious binary executables or NUL-byte binaries
    const hasNull = bytes.subarray(0, 512).includes(0x00);
    if (hasNull) {
      return {
        valid: false,
        reason: `"${file.name}" contains binary bytes and cannot be parsed safely as text.`,
      };
    }
    return { valid: true, detectedType: 'text/plain' };
  }

  return { valid: true };
}

/**
 * Checks ZIP archive entry paths to prevent Zip Slip / directory traversal attacks.
 */
export function isSafeZipPath(entryPath: string): boolean {
  if (!entryPath || entryPath.includes('\0')) return false;
  if (entryPath.startsWith('/') || entryPath.startsWith('\\')) return false;
  const segments = entryPath.split(/[/\\]+/);
  return !segments.some((seg) => seg === '..');
}

/**
 * Escapes HTML special characters for safe interpolation.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strictly sanitizes untrusted HTML using DOMPurify and blocks external network requests
 * (scripts, iframes, objects, remote images/stylesheets/fonts, javascript: URIs).
 */
export function sanitizeHtmlStrict(rawHtml: string): string {
  // Block CSS url(http...) or @import rules before DOMPurify
  const strippedCssUrls = rawHtml.replace(
    /url\s*\(\s*(['"]?)\s*(?:https?:|\/\/)[^)]*\)/gi,
    'url()'
  ).replace(/@import\s+[^;]+;/gi, '');

  const hook = (node: Element) => {
    if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE') {
      const src = node.getAttribute('src') || '';
      if (src && !src.startsWith('data:image/') && !src.startsWith('blob:')) {
        node.removeAttribute('src');
      }
    }
    if (node.tagName === 'LINK' || node.tagName === 'BASE' || node.tagName === 'META') {
      node.parentNode?.removeChild(node);
    }
    if (node.hasAttribute('style')) {
      const styleVal = node.getAttribute('style') || '';
      if (/https?:|\/\/|expression\s*\(/i.test(styleVal)) {
        node.setAttribute('style', styleVal.replace(/url\([^)]*\)/gi, ''));
      }
    }
  };

  DOMPurify.addHook('afterSanitizeAttributes', hook);
  try {
    return DOMPurify.sanitize(strippedCssUrls, {
      FORBID_TAGS: [
        'script',
        'iframe',
        'object',
        'embed',
        'form',
        'link',
        'base',
        'meta',
        'svg',
        'math',
      ],
      FORBID_ATTR: [
        'onerror',
        'onload',
        'onclick',
        'onmouseover',
        'onfocus',
        'onblur',
        'formaction',
        'srcdoc',
        'xlink:href',
      ],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:mailto|tel):|data:image\/(?:png|jpeg|jpg|gif|webp);base64,|blob:|#)/i,
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
