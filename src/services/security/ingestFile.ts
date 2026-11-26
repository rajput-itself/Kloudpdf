import { isValidFileType } from '../../utils/file';
import { assessDocumentLimits } from '../../utils/deviceLimits';
import { validateFileSignature } from '../../utils/fileSecurity';

export interface IngestResult {
  validFiles: File[];
  errors: string[];
  warnings: string[];
}

/**
 * Security & Capacity Ingest Gate (Chain of Responsibility):
 * 1. Extension/MIME validation
 * 2. Binary magic-byte inspection
 * 3. Device memory & size limit check
 */
export async function ingestUserFiles(
  files: FileList | File[],
  acceptedTypes: string
): Promise<IngestResult> {
  const validFiles: File[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of Array.from(files)) {
    if (!isValidFileType(file, acceptedTypes)) {
      errors.push(`Invalid file format for "${file.name}". Supported: ${acceptedTypes}`);
      continue;
    }

    const sigCheck = await validateFileSignature(file, acceptedTypes);
    if (!sigCheck.valid) {
      errors.push(sigCheck.reason || `Invalid or corrupted file content: "${file.name}"`);
      continue;
    }

    const limits = assessDocumentLimits(file.size);
    if (limits.warningMessage && !warnings.includes(limits.warningMessage)) {
      warnings.push(limits.warningMessage);
    }

    validFiles.push(file);
  }

  return { validFiles, errors, warnings };
}
