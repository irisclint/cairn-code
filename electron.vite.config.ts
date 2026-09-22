import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Build configuration for all three Electron targets.
 *
 * - `main`     Node.js process, bundled as ESM, native deps stay external.
 * - `preload`  Sandboxed bridge, CommonJS is required by Electron sandbox.
 * - `renderer` Chromium process, React + Monaco + XTerm.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
        // Electron cannot resolve named imports from the built-in 'electron'
        // module when the main bundle is ESM, so the main process is emitted
        // as CommonJS. The renderer stays ESM.
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },

  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    build: {
      outDir: 'out/renderer',
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
        output: {
          // Monaco and XTerm are large; splitting them keeps the initial
          // renderer chunk small so first paint stays under the 2s budget.
          manualChunks: {
            monaco: ['monaco-editor'],
            xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-web-links'],
            react: ['react', 'react-dom']
          }
        }
      }
    },
    worker: {
      format: 'es'
    }
  }
});
