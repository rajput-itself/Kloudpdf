/**
 * KloudPDF — Reusable Batch Processing Presets Service
 * 100% Client-Side Local Storage Management
 *
 * Rules:
 * - Only non-sensitive configuration preferences are persisted locally.
 * - Never persist document contents, passwords, or private keys.
 */

export type BatchOperationType =
  | 'compress'
  | 'rotate'
  | 'watermark'
  | 'page-numbers'
  | 'pdf-to-images'
  | 'ocr'
  | 'remove-metadata'
  | 'grayscale'
  | 'flatten'
  | 'protect'
  | 'unlock';

export interface BatchPreset {
  id: string;
  name: string;
  description: string;
  operation: BatchOperationType;
  config: Record<string, any>;
  isBuiltIn: boolean;
  createdAt: number;
}

export const BUILT_IN_PRESETS: BatchPreset[] = [
  {
    id: 'email-ready-compression',
    name: 'Email-Ready PDF Compression',
    description: 'Balanced compression targeting under 1MB with metadata stripped for quick emailing.',
    operation: 'compress',
    config: {
      level: 'recommended',
      targetFileSizeKb: 1024,
      removeMetadata: true,
      losslessOptimization: true,
    },
    isBuiltIn: true,
    createdAt: 1700000000000,
  },
  {
    id: 'high-quality-compression',
    name: 'High-Quality Document Compression',
    description: 'Gentle compression preserving maximum visual fidelity and vector clarity.',
    operation: 'compress',
    config: {
      level: 'low',
      imageQuality: 0.85,
      removeMetadata: false,
      losslessOptimization: true,
    },
    isBuiltIn: true,
    createdAt: 1700000000001,
  },
  {
    id: 'extreme-compression',
    name: 'Extreme Document Compression',
    description: 'Maximum file size reduction with aggressive downsampling for archiving.',
    operation: 'compress',
    config: {
      level: 'extreme',
      imageQuality: 0.35,
      maxImageDimension: 1000,
      removeMetadata: true,
      losslessOptimization: true,
    },
    isBuiltIn: true,
    createdAt: 1700000000002,
  },
  {
    id: 'print-ready-optimization',
    name: 'Print-Ready Optimization',
    description: 'High-DPI image preservation and stream cleanup suitable for physical printing.',
    operation: 'compress',
    config: {
      level: 'low',
      imageQuality: 0.9,
      maxImageDimension: 2400,
      losslessOptimization: true,
    },
    isBuiltIn: true,
    createdAt: 1700000000003,
  },
  {
    id: 'bulk-grayscale',
    name: 'Grayscale Documents',
    description: 'Convert full-color documents to clean, printer-friendly monochrome grayscale.',
    operation: 'grayscale',
    config: {
      mode: 'standard',
    },
    isBuiltIn: true,
    createdAt: 1700000000004,
  },
  {
    id: 'bulk-confidential-watermark',
    name: 'Bulk Confidential Watermark',
    description: 'Stamp bold, semi-transparent CONFIDENTIAL watermark across all pages.',
    operation: 'watermark',
    config: {
      text: 'CONFIDENTIAL',
      fontSize: 48,
      opacity: 0.25,
      rotation: 45,
      color: 'gray',
      position: 'center',
    },
    isBuiltIn: true,
    createdAt: 1700000000005,
  },
  {
    id: 'searchable-scanned-ocr',
    name: 'Searchable Scanned Documents (OCR)',
    description: 'Run OCR on scanned pages to generate searchable PDFs with text layer.',
    operation: 'ocr',
    config: {
      language: 'eng',
      generateSearchablePdf: true,
    },
    isBuiltIn: true,
    createdAt: 1700000000006,
  },
  {
    id: 'form-flattening',
    name: 'Form Flattening',
    description: 'Permanently lock interactive form fields and signatures into static artwork.',
    operation: 'flatten',
    config: {},
    isBuiltIn: true,
    createdAt: 1700000000007,
  },
  {
    id: 'metadata-scrubbing',
    name: 'Metadata Removal',
    description: 'Purge author, title, producer, and XMP streams for anonymous sharing.',
    operation: 'remove-metadata',
    config: {},
    isBuiltIn: true,
    createdAt: 1700000000008,
  },
];

const PRESETS_STORAGE_KEY = 'kloudpdf_batch_presets';

const memoryStore: Record<string, string> = {};

function getStorage(): {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (k: string) => memoryStore[k] || null,
    setItem: (k: string, v: string) => {
      memoryStore[k] = v;
    },
    removeItem: (k: string) => {
      delete memoryStore[k];
    },
  };
}

/**
 * Retrieves all presets (built-in + user-created) from localStorage
 */
export function getBatchPresets(): BatchPreset[] {
  const storage = getStorage();

  try {
    const raw = storage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return BUILT_IN_PRESETS;
    const userPresets: BatchPreset[] = JSON.parse(raw);
    // Combine built-in presets with user presets, ensuring unique IDs
    const userIds = new Set(userPresets.map((p) => p.id));
    const combined = [
      ...userPresets,
      ...BUILT_IN_PRESETS.filter((p) => !userIds.has(p.id)),
    ];
    return combined;
  } catch (err) {
    console.warn('Failed to parse batch presets from localStorage:', err);
    return BUILT_IN_PRESETS;
  }
}

/**
 * Saves a new or updated user preset to localStorage
 */
export function saveBatchPreset(
  preset: Omit<BatchPreset, 'createdAt'> & { createdAt?: number }
): BatchPreset {
  const storage = getStorage();

  // Safety filter: strip any accidental file objects, sensitive keys, or passwords
  const sanitizedConfig: Record<string, any> = {};
  for (const [k, v] of Object.entries(preset.config || {})) {
    if (k.toLowerCase().includes('password') || k.toLowerCase().includes('secret')) {
      continue;
    }
    if (v instanceof File || v instanceof Blob || v instanceof ArrayBuffer) {
      continue;
    }
    sanitizedConfig[k] = v;
  }

  const existingPresets = getBatchPresets().filter((p) => !p.isBuiltIn);
  const updatedPreset: BatchPreset = {
    ...preset,
    config: sanitizedConfig,
    isBuiltIn: false,
    createdAt: preset.createdAt || Date.now(),
  };

  const existingIndex = existingPresets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    existingPresets[existingIndex] = updatedPreset;
  } else {
    existingPresets.push(updatedPreset);
  }

  try {
    storage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(existingPresets));
  } catch (err) {
    console.error('Failed to save batch preset to localStorage:', err);
  }

  return updatedPreset;
}

/**
 * Deletes a user preset from localStorage
 */
export function deleteBatchPreset(presetId: string): boolean {
  const storage = getStorage();

  const builtIn = BUILT_IN_PRESETS.some((p) => p.id === presetId);
  if (builtIn) {
    console.warn('Cannot delete built-in preset:', presetId);
    return false;
  }

  try {
    const existingPresets = getBatchPresets().filter(
      (p) => !p.isBuiltIn && p.id !== presetId
    );
    storage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(existingPresets));
    return true;
  } catch (err) {
    console.error('Failed to delete batch preset:', err);
    return false;
  }
}

/**
 * Resets user presets to default factory state
 */
export function resetBatchPresetsToDefaults(): void {
  const storage = getStorage();
  storage.removeItem(PRESETS_STORAGE_KEY);
}
