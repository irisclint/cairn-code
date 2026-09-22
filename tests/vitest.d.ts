/// <reference types="vitest/globals" />

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import 'vitest';

/**
 * Teaches TypeScript about the DOM matchers that tests/setup.ts registers.
 *
 * `@testing-library/jest-dom/vitest` installs the matchers at runtime but does
 * not widen Vitest's Assertion interface on its own, so `toBeInTheDocument`
 * would be a type error in every component test without this declaration.
 */
/* eslint-disable @typescript-eslint/no-empty-object-type -- these interfaces
   exist purely to merge the matcher signatures into Vitest's types. */
declare module 'vitest' {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
