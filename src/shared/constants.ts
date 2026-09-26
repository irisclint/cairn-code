/** Application-wide constants shared by main, preload and renderer. */

export const APP_NAME = 'Causeway';
export const APP_ID = 'dev.causeway.editor';
export const APP_PROTOCOL = 'causeway';

/** Files larger than this are opened read-only without tokenization. */
export const MAX_FILE_SIZE_BYTES = 64 * 1024 * 1024;

/** Above this size Monaco switches to large-file mode (no minimap, no folding). */
export const LARGE_FILE_THRESHOLD_BYTES = 4 * 1024 * 1024;

/** Debounce before a changed buffer is handed to the linters. */
export const LINT_DEBOUNCE_MS = 300;

/** Debounce for filesystem watcher events before the explorer refreshes. */
export const WATCHER_DEBOUNCE_MS = 120;

export const DEFAULT_THEME_ID = 'dark-modern';
export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_TAB_SIZE = 4;

export const MIN_WINDOW_WIDTH = 720;
export const MIN_WINDOW_HEIGHT = 480;
export const DEFAULT_WINDOW_WIDTH = 1440;
export const DEFAULT_WINDOW_HEIGHT = 900;

/** Directories never traversed by the explorer, search or file watcher. */
export const IGNORED_DIRECTORIES: readonly string[] = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.gradle',
  '.idea',
  'coverage'
];
