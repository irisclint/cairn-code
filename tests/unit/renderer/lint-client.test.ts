import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installBridge, removeBridge, state } from './bridge-mock';

import {
  LINT_SOURCE,
  forgetLint,
  lintNow,
  resetLintReporting,
  scheduleLint,
  shouldLint
} from '@renderer/services/lint-client';
import { diagnosticService } from '@renderer/services/diagnostic-service';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import type { LintFinding } from '@shared/types';

const FILE = '/work/project/src/app.ts';

function finding(overrides: Partial<LintFinding> = {}): LintFinding {
  return {
    ruleId: 'eqeqeq',
    severity: 2,
    message: "Expected '===' and instead saw '=='.",
    line: 3,
    column: 7,
    endLine: 3,
    endColumn: 9,
    fixable: false,
    ...overrides
  };
}

beforeEach(() => {
  installBridge();
  resetLintReporting();
  diagnosticService.clearAll();
  state.lint = { findings: [], ignored: false };
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: true });
  useNotificationStore.setState({ notifications: [] });
});

describe('deciding whether to lint at all', () => {
  it('should lint the languages ESLint can handle', () => {
    expect(shouldLint('typescript')).toBe(true);
    expect(shouldLint('javascriptreact')).toBe(true);
  });

  it('should skip a language ESLint has nothing to say about', () => {
    expect(shouldLint('python')).toBe(false);
    expect(shouldLint('markdown')).toBe(false);
  });

  it('should skip everything when the setting is off', () => {
    useSettingsStore.setState({
      settings: { ...FALLBACK_SETTINGS, 'diagnostics.enableEslint': false },
      loaded: true
    });
    expect(shouldLint('typescript')).toBe(false);
  });

  it('should skip everything without the preload bridge', () => {
    removeBridge();
    expect(shouldLint('typescript')).toBe(false);
    installBridge();
  });
});

describe('publishing findings', () => {
  it('should turn an ESLint message into a diagnostic with a cause and a fix', async () => {
    state.lint = { findings: [finding()], ignored: false };

    await lintNow(FILE, 'if (a == b) {}', 'typescript');

    const [problem] = diagnosticService.get(FILE);
    expect(problem?.source).toBe(LINT_SOURCE);
    expect(problem?.code).toBe('eqeqeq');
    expect(problem?.severity).toBe(0);
    expect(problem?.cause.length).toBeGreaterThan(0);
    expect(problem?.solution.length).toBeGreaterThan(0);
    expect(problem?.range).toEqual({
      startLineNumber: 3,
      startColumn: 7,
      endLineNumber: 3,
      endColumn: 9
    });
  });

  it('should mark a warning as a warning rather than an error', async () => {
    state.lint = { findings: [finding({ severity: 1 })], ignored: false };
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)[0]?.severity).toBe(1);
  });

  it('should say when ESLint can fix the problem itself', async () => {
    state.lint = { findings: [finding({ fixable: true })], ignored: false };
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)[0]?.solution).toContain('--fix');
  });

  it('should cover a single character when the message has no end position', async () => {
    state.lint = {
      findings: [finding({ endLine: undefined, endColumn: undefined })],
      ignored: false
    };

    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)[0]?.range).toMatchObject({ endLineNumber: 3, endColumn: 8 });
  });

  it('should report nothing for a file the workspace configuration ignores', async () => {
    state.lint = { findings: [finding()], ignored: true };
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)).toHaveLength(0);
  });

  it('should clear problems that a later run no longer reports', async () => {
    state.lint = { findings: [finding()], ignored: false };
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)).toHaveLength(1);

    state.lint = { findings: [], ignored: false };
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)).toHaveLength(0);
  });

  it('should drop the problems of a file that was closed', async () => {
    state.lint = { findings: [finding()], ignored: false };
    await lintNow(FILE, 'x', 'typescript');

    forgetLint(FILE);
    expect(diagnosticService.get(FILE)).toHaveLength(0);
  });
});

describe('when linting fails', () => {
  beforeEach(() => {
    vi.mocked(globalThis.window.cairn.lint.run).mockResolvedValue({
      ok: false,
      error: {
        code: 'ESLINT_NOT_INSTALLED',
        message: 'ESLint is not installed in this workspace',
        cause: 'Resolving eslint failed.',
        solution: 'Run npm install --save-dev eslint.'
      }
    });
  });

  it('should tell the user once, with the cause and the fix', async () => {
    await lintNow(FILE, 'x', 'typescript');

    const notification = useNotificationStore.getState().notifications.at(-1);
    expect(notification?.message).toContain('ESLint is not installed');
    expect(notification?.cause).toContain('Resolving eslint failed');
    expect(notification?.solution).toContain('npm install');
  });

  it('should not repeat the same complaint on every keystroke', async () => {
    await lintNow(FILE, 'x', 'typescript');
    await lintNow(FILE, 'xy', 'typescript');
    await lintNow(FILE, 'xyz', 'typescript');

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('should leave no stale problems behind', async () => {
    state.lint = { findings: [finding()], ignored: false };
    vi.mocked(globalThis.window.cairn.lint.run).mockResolvedValueOnce({ ok: true, value: state.lint });
    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)).toHaveLength(1);

    await lintNow(FILE, 'x', 'typescript');
    expect(diagnosticService.get(FILE)).toHaveLength(0);
  });
});

describe('debouncing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should send one request for a burst of keystrokes', async () => {
    const run = vi.mocked(globalThis.window.cairn.lint.run);
    run.mockClear();

    scheduleLint(FILE, 'a', 'typescript');
    scheduleLint(FILE, 'ab', 'typescript');
    scheduleLint(FILE, 'abc', 'typescript');

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);

    expect(run).toHaveBeenCalledTimes(1);
    // The last text wins, not the first.
    expect(run).toHaveBeenCalledWith(FILE, 'abc');
    vi.useRealTimers();
  });

  it('should keep one file from cancelling another', async () => {
    const run = vi.mocked(globalThis.window.cairn.lint.run);
    run.mockClear();

    scheduleLint(FILE, 'a', 'typescript');
    scheduleLint('/work/project/src/other.ts', 'b', 'typescript');
    await vi.advanceTimersByTimeAsync(500);

    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
