import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  basename,
  dirname,
  extname,
  toPosixPath,
  pathSegments,
  relativeTo,
  formatBytes,
  debounce,
  throttle,
  fuzzyScore,
  escapeRegExp,
  globToRegExp,
  createId,
  clamp
} from '@shared/utils';

describe('path helpers', () => {
  it('should return the last segment of a POSIX path', () => {
    expect(basename('/home/user/project/file.ts')).toBe('file.ts');
  });

  it('should return the last segment of a Windows path', () => {
    expect(basename('C:\\Users\\dev\\project\\file.ts')).toBe('file.ts');
  });

  it('should ignore a trailing separator when taking the basename', () => {
    expect(basename('/home/user/project/')).toBe('project');
    expect(basename('C:\\Users\\dev\\project\\')).toBe('project');
  });

  it('should return the parent directory for both separator styles', () => {
    expect(dirname('/home/user/file.ts')).toBe('/home/user');
    expect(dirname('C:\\Users\\dev\\file.ts')).toBe('C:\\Users\\dev');
  });

  it('should return the lowercase extension without the dot', () => {
    expect(extname('Component.TSX')).toBe('tsx');
    expect(extname('archive.tar.gz')).toBe('gz');
  });

  it('should return an empty extension for dotfiles and extensionless names', () => {
    expect(extname('.gitignore')).toBe('');
    expect(extname('Makefile')).toBe('');
  });

  it('should convert Windows separators to forward slashes', () => {
    expect(toPosixPath('C:\\Users\\dev\\file.ts')).toBe('C:/Users/dev/file.ts');
  });

  it('should split a path into non-empty segments', () => {
    expect(pathSegments('/home//user/project/')).toEqual(['home', 'user', 'project']);
    expect(pathSegments('C:\\Users\\dev')).toEqual(['C:', 'Users', 'dev']);
  });

  it('should make a path relative to the workspace root', () => {
    expect(relativeTo('/home/user/project', '/home/user/project/src/index.ts')).toBe('src/index.ts');
  });

  it('should compare the root case insensitively, as Windows does', () => {
    expect(relativeTo('C:\\Users\\Dev\\Project', 'C:\\users\\dev\\project\\src\\app.ts')).toBe('src/app.ts');
  });

  it('should return the full path when it is outside the root', () => {
    expect(relativeTo('/home/user/project', '/etc/hosts')).toBe('/etc/hosts');
  });

  it('should return the path unchanged when no root is open', () => {
    expect(relativeTo(null, '/etc/hosts')).toBe('/etc/hosts');
  });
});

describe('formatBytes', () => {
  it('should report plain bytes below one kibibyte', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('should use one decimal place for small multiples', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('should drop the decimal place once the value reaches ten', () => {
    expect(formatBytes(15 * 1024)).toBe('15 KB');
  });

  it('should step up through the unit table', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should call the function once after the delay', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('should not fire after cancel', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(500);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should run on the leading edge and suppress calls inside the interval', () => {
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('first');
    throttled('suppressed');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('first');

    vi.advanceTimersByTime(100);
    throttled('second');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('second');
  });
});

describe('fuzzyScore', () => {
  it('should match a subsequence and report the matched indices', () => {
    // C-o-m-m-a-n-d: the matched 'd' is the one at index 6.
    const result = fuzzyScore('cmd', 'Command Palette');
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 2, 6]);
  });

  it('should return null when the pattern is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'Command Palette')).toBeNull();
  });

  it('should return null when the pattern is longer than the text', () => {
    expect(fuzzyScore('abcdef', 'abc')).toBeNull();
  });

  it('should treat an empty pattern as a match with no indices', () => {
    expect(fuzzyScore('', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('should be case insensitive', () => {
    expect(fuzzyScore('CMD', 'command')).not.toBeNull();
  });

  it('should rank consecutive matches above scattered ones', () => {
    const consecutive = fuzzyScore('abc', 'abcxxxxxx');
    const scattered = fuzzyScore('abc', 'axbxcxxxx');
    expect(consecutive?.score).toBeGreaterThan(scattered?.score ?? 0);
  });

  it('should rank a word boundary match above a mid-word match', () => {
    const boundary = fuzzyScore('st', 'my-start');
    const midWord = fuzzyScore('st', 'mysteryyy');
    expect(boundary?.score).toBeGreaterThan(midWord?.score ?? 0);
  });

  it('should prefer the shorter of two equally good targets', () => {
    const short = fuzzyScore('ts', 'ts');
    const long = fuzzyScore('ts', 'ts-with-a-very-long-suffix');
    expect(short?.score).toBeGreaterThan(long?.score ?? 0);
  });
});

describe('escapeRegExp', () => {
  it('should escape every regular expression metacharacter', () => {
    const pattern = new RegExp(escapeRegExp('a.b*c?'));
    expect(pattern.test('a.b*c?')).toBe(true);
    expect(pattern.test('axbxcx')).toBe(false);
  });
});

describe('globToRegExp', () => {
  it('should match a single segment with a star', () => {
    const pattern = globToRegExp('*.ts');
    expect(pattern.test('index.ts')).toBe(true);
    expect(pattern.test('src/index.ts')).toBe(false);
  });

  it('should cross directories with a double star', () => {
    const pattern = globToRegExp('src/**/*.ts');
    expect(pattern.test('src/index.ts')).toBe(true);
    expect(pattern.test('src/deep/nested/file.ts')).toBe(true);
    expect(pattern.test('tests/index.ts')).toBe(false);
  });

  it('should match exactly one character with a question mark', () => {
    const pattern = globToRegExp('file?.ts');
    expect(pattern.test('file1.ts')).toBe(true);
    expect(pattern.test('file12.ts')).toBe(false);
  });

  it('should accept any option from a brace group', () => {
    const pattern = globToRegExp('*.{ts,tsx}');
    expect(pattern.test('a.ts')).toBe(true);
    expect(pattern.test('a.tsx')).toBe(true);
    expect(pattern.test('a.js')).toBe(false);
  });

  it('should treat glob input as literal text otherwise', () => {
    const pattern = globToRegExp('a+b.ts');
    expect(pattern.test('a+b.ts')).toBe(true);
    expect(pattern.test('aab.ts')).toBe(false);
  });
});

describe('createId', () => {
  it('should include the prefix and stay unique across calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId('term')));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith('term-')).toBe(true);
  });
});

describe('clamp', () => {
  it('should bound the value to the given range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
