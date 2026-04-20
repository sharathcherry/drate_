import { describe, expect, it, vi } from 'vitest';
import { timeoutPromise } from './async';

describe('timeoutPromise', () => {
  it('resolves when promise finishes before timeout', async () => {
    await expect(timeoutPromise(Promise.resolve('ok'), 50, 'quick')).resolves.toBe('ok');
  });

  it('rejects when promise exceeds timeout', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => undefined);
    const pending = timeoutPromise(never, 25, 'slow');
    vi.advanceTimersByTime(30);
    await expect(pending).rejects.toThrow('slow timed out after 25ms');
    vi.useRealTimers();
  });
});
