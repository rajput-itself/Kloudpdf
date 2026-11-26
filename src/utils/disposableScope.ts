/**
 * Disposable Resource Scope (RAII)
 * Guarantees deterministic cleanup of temporary browser canvases and Object URLs.
 */
export class ResourceScope {
  private cleanups: Array<() => void> = [];

  track(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  trackObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.cleanups.push(() => URL.revokeObjectURL(url));
    return url;
  }

  trackCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.cleanups.push(() => {
      canvas.width = 0;
      canvas.height = 0;
    });
    return canvas;
  }

  dispose(): void {
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      try {
        fn?.();
      } catch {
        // Never allow cleanup failures to mask caller execution
      }
    }
  }
}

/**
 * Safely revokes any blob: object URLs in a list.
 */
export function revokeObjectUrls(urls: Array<string | undefined | null>): void {
  for (const url of urls) {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore already-revoked URLs
      }
    }
  }
}
