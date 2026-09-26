import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    /*
     * Twenty seconds rather than the default five.
     *
     * Most of this suite is fast and never comes near either number. A handful
     * of tests start real operating system processes, a pseudo terminal or a
     * debug adapter over stdio, and on Windows under a parallel run those take
     * longer than five seconds often enough that the suite failed on a
     * different test almost every run. Four different tests failed across two
     * consecutive runs of the same unchanged code, which makes the suite
     * useless as a signal: a red run stops meaning anything.
     *
     * A higher ceiling costs nothing when tests pass, because a passing test
     * never waits for it. It only changes how long a genuinely stuck test
     * takes to report, and a stuck test is rare enough to be worth that.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/renderer/main.tsx',
        'src/main/index.ts',
        'src/preload/**',
        'src/renderer/theme-engine/themes/**'
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  }
});
