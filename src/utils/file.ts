export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Allow ample time for mobile browsers (e.g. iOS Safari download prompt) before revoking
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

export function isValidFileType(file: File, acceptedTypes: string): boolean {
  if (!acceptedTypes) return true;
  const acceptedList = acceptedTypes.split(',').map((t) => t.trim().toLowerCase());
  const fileName = file.name.toLowerCase();

  return acceptedList.some((ext) => {
    if (ext.startsWith('.')) {
      return fileName.endsWith(ext);
    }
    return file.type.toLowerCase().includes(ext);
  });
}

export function toBlob(data: Uint8Array | Uint8Array[], mimeType: string): Blob {
  const parts = Array.isArray(data) ? data : [data];
  return new Blob(parts as unknown as BlobPart[], { type: mimeType });
}
