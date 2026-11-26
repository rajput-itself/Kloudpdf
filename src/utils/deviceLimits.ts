/**
 * Device & Browser Memory Capability Assessment Utility
 * Prevents browser tab crashes on large PDFs without falsely advertising unlimited processing.
 */

export interface DeviceCapabilityAssessment {
  deviceMemoryGb: number;
  hardwareConcurrency: number;
  isLowMemoryDevice: boolean;
  recommendedMaxFileSizeMb: number;
  recommendedMaxConcurrency: number;
  warningMessage?: string;
}

export function getDeviceCapabilities(): Omit<DeviceCapabilityAssessment, 'warningMessage'> {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 4;
  const hardwareConcurrency = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;
  const isMobileUa =
    typeof nav.userAgent === 'string' && /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);

  const isLowMemoryDevice = deviceMemoryGb <= 2 || isMobileUa;
  const recommendedMaxFileSizeMb = isLowMemoryDevice ? 45 : 150;
  const recommendedMaxConcurrency = isLowMemoryDevice ? 1 : Math.min(3, Math.max(2, Math.floor(hardwareConcurrency / 2)));

  return {
    deviceMemoryGb,
    hardwareConcurrency,
    isLowMemoryDevice,
    recommendedMaxFileSizeMb,
    recommendedMaxConcurrency,
  };
}

export function assessDocumentLimits(
  fileSizeBytes: number,
  pageCount?: number
): DeviceCapabilityAssessment {
  const caps = getDeviceCapabilities();
  const fileSizeMb = fileSizeBytes / (1024 * 1024);

  let warningMessage: string | undefined;
  if (fileSizeMb > caps.recommendedMaxFileSizeMb) {
    warningMessage = `Large file detected (${fileSizeMb.toFixed(1)} MB). This device recommends documents under ${caps.recommendedMaxFileSizeMb} MB for smooth in-browser processing; heavy operations may be slow.`;
  } else if (pageCount && pageCount > (caps.isLowMemoryDevice ? 80 : 250)) {
    warningMessage = `Document has ${pageCount} pages. Pages render lazily to conserve memory; batch OCR or full-document raster exports may take longer.`;
  }

  return {
    ...caps,
    warningMessage,
  };
}
