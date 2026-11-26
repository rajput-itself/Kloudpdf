import { getDeviceCapabilities } from './deviceLimits';

/**
 * Yields control back to the browser event loop between heavy frames/pages
 * so UI progress updates and AbortSignal cancellations remain responsive.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Bounded Task Pool sized automatically by device capabilities unless overridden.
 */
export async function runBoundedPool<TItem>(
  items: readonly TItem[],
  workerFn: (item: TItem, index: number) => Promise<void>,
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onCancelRemaining?: (item: TItem, index: number) => void;
  } = {}
): Promise<void> {
  const defaultConcurrency = getDeviceCapabilities().recommendedMaxConcurrency;
  const workerCount = Math.max(1, Math.min(4, options.concurrency ?? defaultConcurrency));
  let cursor = 0;

  const runner = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      if (item === undefined) break;

      if (options.signal?.aborted) {
        options.onCancelRemaining?.(item, idx);
        continue;
      }

      await workerFn(item, idx);
      await yieldToBrowser();
    }
  };

  const workers = Array.from({ length: Math.min(workerCount, items.length || 1) }, () => runner());
  await Promise.all(workers);
}
