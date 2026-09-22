/** Small pure helpers shared by every process. Keep this module dependency free. */

/** Matches one or more path separators, forward or backward. */
const SEPARATORS = /[\\/]+/;

/** Returns the final path segment of a POSIX or Windows path. */
export function basename(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Returns the parent directory of a POSIX or Windows path. */
export function dirname(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (index <= 0) return normalized.slice(0, 1) || '.';
  return normalized.slice(0, index);
}

/** Returns the lowercase extension without the dot, or an empty string. */
export function extname(filePath: string): string {
  const name = basename(filePath);
  const index = name.lastIndexOf('.');
  if (index <= 0) return '';
  return name.slice(index + 1).toLowerCase();
}

/** Converts a path into the forward slash form used for display and URIs. */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/** Splits a path into its segments, accepting either separator style. */
export function pathSegments(filePath: string): string[] {
  return filePath.split(SEPARATORS).filter((segment) => segment.length > 0);
}

/** Renders an absolute path relative to a workspace root for display. */
export function relativeTo(root: string | null, filePath: string): string {
  if (!root) return toPosixPath(filePath);
  const normalizedRoot = toPosixPath(root).replace(/\/+$/, '');
  const normalizedPath = toPosixPath(filePath);
  if (!normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase() + '/')) return normalizedPath;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

/** Formats a byte count using binary units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[unitIndex];
}

/** Trailing-edge debounce. The returned function exposes `cancel`. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: A): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return debounced;
}

/** Leading-edge throttle used for high frequency events such as terminal resize. */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  intervalMs: number
): (...args: A) => void {
  let last = 0;
  return (...args: A): void => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      fn(...args);
    }
  };
}

/** Characters that start a new "word" for the purpose of fuzzy match scoring. */
const WORD_BOUNDARIES = new Set(['/', '\\', '-', '_', '.', ' ']);

/**
 * Subsequence fuzzy match used by Quick Open and the Command Palette.
 *
 * Returns null when `pattern` is not a subsequence of `text`; otherwise a score
 * where higher is better. Consecutive matches and matches at word boundaries
 * score highest, so typing "cmdp" ranks "Command Palette" above a target where
 * the same letters happen to be scattered.
 */
export function fuzzyScore(pattern: string, text: string): { score: number; indices: number[] } | null {
  if (pattern.length === 0) return { score: 0, indices: [] };
  if (pattern.length > text.length) return null;

  const lowerPattern = pattern.toLowerCase();
  const lowerText = text.toLowerCase();
  const indices: number[] = [];

  let score = 0;
  let textIndex = 0;
  let previousMatchIndex = -2;

  for (const char of lowerPattern) {
    let found = -1;
    while (textIndex < lowerText.length) {
      if (lowerText[textIndex] === char) {
        found = textIndex;
        textIndex += 1;
        break;
      }
      textIndex += 1;
    }
    if (found === -1) return null;

    indices.push(found);
    score += 1;

    if (found === previousMatchIndex + 1) score += 5;

    const previousChar = found > 0 ? text[found - 1] : undefined;
    if (found === 0 || (previousChar !== undefined && WORD_BOUNDARIES.has(previousChar))) {
      score += 4;
    }

    // A capital following a lowercase starts a camelCase word.
    const currentChar = text[found];
    if (
      currentChar !== undefined &&
      previousChar !== undefined &&
      currentChar === currentChar.toUpperCase() &&
      currentChar !== currentChar.toLowerCase() &&
      previousChar === previousChar.toLowerCase()
    ) {
      score += 2;
    }

    previousMatchIndex = found;
  }

  // Shorter targets win when the pattern matched equally well.
  score += Math.max(0, 20 - text.length / 4);
  return { score, indices };
}

/** Escapes a string so it can be embedded in a regular expression literally. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Translates a minimal glob (`*`, `**`, `?`, `{a,b}`) into a RegExp. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';

  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        pattern += '.*';
        i += 1;
        // A trailing slash after ** is optional so that "src/**/*.ts" also
        // matches a file directly inside src.
        if (glob[i + 1] === '/') i += 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (char === '?') {
      pattern += '[^/]';
    } else if (char === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        pattern += '\\{';
      } else {
        const options = glob
          .slice(i + 1, end)
          .split(',')
          .map(escapeRegExp);
        pattern += '(' + options.join('|') + ')';
        i = end;
      }
    } else {
      pattern += escapeRegExp(char ?? '');
    }
  }

  return new RegExp('^' + pattern + '$', 'i');
}

/** Creates a short unique identifier suitable for terminal and editor ids. */
export function createId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** Clamps a number into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
