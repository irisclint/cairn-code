import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Global test setup.
 *
 * jsdom lacks a handful of browser APIs that the workbench touches on mount.
 * They are stubbed here rather than in each test so a component test never
 * fails for a reason unrelated to what it is checking.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof matchMedia;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Monaco probes these during module initialisation to decide which clipboard
// strategy to use; jsdom implements neither.
if (!document.queryCommandSupported) {
  document.queryCommandSupported = vi.fn().mockReturnValue(false);
}
if (!document.execCommand) {
  document.execCommand = vi.fn().mockReturnValue(false);
}
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(),
      readText: vi.fn().mockResolvedValue(''),
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue([])
    }
  });
}

// Monaco installs a document-wide copy handler that constructs a ClipboardItem.
// Chromium has it; jsdom does not, and the missing global surfaces as an
// uncaught exception from an event listener rather than a test failure.
if (!globalThis.ClipboardItem) {
  globalThis.ClipboardItem = class {
    constructor(readonly items: Record<string, unknown>) {
      // The real ClipboardItem consumes the promises it is handed, so the stub
      // has to as well. Monaco's Safari workaround creates a deferred promise
      // on every click and cancels the previous one; with nothing attached,
      // each cancellation becomes an unhandled rejection, and a few hundred of
      // those make the run exit non-zero while every test passes.
      for (const value of Object.values(items)) {
        if (typeof (value as PromiseLike<unknown> | undefined)?.then === 'function') {
          void Promise.resolve(value).catch(() => undefined);
        }
      }
    }
  } as unknown as typeof ClipboardItem;
}

// Monaco's editor core requires a layout engine; jsdom reports zero for every
// measurement, which is fine for the logic under test but noisy without this.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = (() => ({ matches: false })) as unknown as typeof matchMedia;
}

// Monaco starts its TypeScript language service in a web worker. jsdom has no
// Worker, and the missing global surfaces as an unhandled rejection rather
// than a test failure, so the run exits non-zero while every test passes.
//
// The stub accepts messages and never answers, which is indistinguishable from
// a language service that has not finished starting. Tests that need markers
// set them directly rather than waiting for this.
if (!globalThis.Worker) {
  globalThis.Worker = class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(): void {}
    terminate(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
  } as unknown as typeof Worker;
}
