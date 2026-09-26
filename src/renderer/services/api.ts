import type { IpcResult } from '@shared/types';
import type { CausewayApi } from '../../preload';

declare global {
  interface Window {
    causeway: CausewayApi;
  }
}

/** Error carrying the cause and solution that came back over IPC. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause: string,
    readonly solution: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The preload bridge.
 *
 * Accessing it through this function rather than `window.causeway` directly gives
 * one place to fail with a clear message when the renderer is loaded outside
 * Electron, which is exactly what happens in unit tests that forget to mock it.
 */
export function api(): CausewayApi {
  const bridge = globalThis.window?.causeway;
  if (!bridge) {
    throw new ApiError(
      'BRIDGE_MISSING',
      'The causeway bridge is not available',
      'The renderer is running without the preload script, for example in a plain browser tab or an unmocked test.',
      'Start causeway through "npm run dev", or mock window.causeway in the test setup.'
    );
  }
  return bridge;
}

/** True when the preload bridge is present. */
export function hasBridge(): boolean {
  return Boolean(globalThis.window?.causeway);
}

/**
 * Unwraps an IPC envelope.
 *
 * Main process handlers never throw across the boundary, they return an
 * `IpcResult`. This turns a failed result back into a throwable error that
 * still carries cause and solution, so callers can use plain try/catch.
 */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.value;
  throw new ApiError(
    result.error.code,
    result.error.message,
    result.error.cause ?? 'No further detail was reported.',
    result.error.solution ?? 'Try the action again, and report the problem if it persists.'
  );
}

/**
 * Unwraps an IPC envelope, returning a fallback instead of throwing.
 *
 * Used for calls where a failure is not worth interrupting the user, such as
 * reading a directory that was deleted while the explorer was open.
 */
export async function unwrapOr<T>(promise: Promise<IpcResult<T>>, fallback: T): Promise<T> {
  try {
    return await unwrap(promise);
  } catch {
    return fallback;
  }
}
