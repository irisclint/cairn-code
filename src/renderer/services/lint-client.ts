import { api, ApiError, hasBridge, unwrap } from './api';
import { diagnosticService } from './diagnostic-service';
import { useSettingsStore } from '../store/settings-store';
import { useNotificationStore } from '../store/notification-store';
import { explainDiagnostic } from '../editor/diagnostic-explainer';
import { DiagnosticSeverityValue, type Diagnostic, type LintFinding } from '@shared/types';

/** The source name every ESLint diagnostic carries, and the key it is stored under. */
export const LINT_SOURCE = 'ESLint';

/**
 * Languages worth sending to ESLint.
 *
 * The workspace configuration has the final say, and a file it does not cover
 * comes back with nothing, so this list only avoids pointless round trips for
 * files ESLint could never handle.
 */
const LINTABLE = new Set([
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'vue',
  'svelte',
  'astro'
]);

/** Time to wait after the last keystroke before linting. */
const DEBOUNCE_MS = 400;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * The last failure that was reported to the user.
 *
 * A workspace without ESLint fails on every single save, and a notification
 * each time would be worse than useless. The code is remembered so the same
 * problem is only raised once, and raised again only if it changes.
 */
let lastReportedFailure: string | null = null;

/** True when the setting is on and the language is one ESLint can handle. */
export function shouldLint(languageId: string): boolean {
  if (!hasBridge()) return false;
  if (!useSettingsStore.getState().settings['diagnostics.enableEslint']) return false;
  return LINTABLE.has(languageId);
}

/**
 * Lints a file and publishes the result, after a short pause in typing.
 *
 * Debounced per file rather than globally, so that editing one file never
 * cancels the pending lint of another.
 */
export function scheduleLint(uri: string, text: string, languageId: string): void {
  if (!shouldLint(languageId)) return;

  const existing = timers.get(uri);
  if (existing) clearTimeout(existing);

  timers.set(
    uri,
    setTimeout(() => {
      timers.delete(uri);
      void lintNow(uri, text, languageId);
    }, DEBOUNCE_MS)
  );
}

/** Lints immediately, bypassing the debounce. Used on save. */
export async function lintNow(uri: string, text: string, languageId: string): Promise<void> {
  if (!shouldLint(languageId)) return;

  try {
    const outcome = await unwrap(api().lint.run(uri, text));

    lastReportedFailure = null;
    diagnosticService.setDiagnostics(
      uri,
      LINT_SOURCE,
      outcome.ignored ? [] : outcome.findings.map((finding: LintFinding) => toDiagnostic(uri, finding))
    );
  } catch (error) {
    // An ApiError already carries a cause and a solution from the main
    // process; anything else is a bug worth surfacing as it is.
    report(
      error instanceof ApiError
        ? { code: error.code, message: error.message, cause: error.cause, solution: error.solution }
        : {
            code: 'LINT_FAILED',
            message: 'Linting failed',
            cause: String(error),
            solution: 'Report this with the message above, including the file it happened on.'
          }
    );
    diagnosticService.setDiagnostics(uri, LINT_SOURCE, []);
  }
}

/** Drops any pending work and the published problems for a closed file. */
export function forgetLint(uri: string): void {
  const timer = timers.get(uri);
  if (timer) clearTimeout(timer);
  timers.delete(uri);
  diagnosticService.setDiagnostics(uri, LINT_SOURCE, []);
}

/** Exposed so a workspace change can let the next failure be reported again. */
export function resetLintReporting(): void {
  lastReportedFailure = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function report(failure: { code: string; message: string; cause: string; solution: string } | null): void {
  if (!failure || failure.code === lastReportedFailure) return;
  lastReportedFailure = failure.code;

  useNotificationStore.getState().notify({
    severity: 'warning',
    message: failure.message,
    cause: failure.cause,
    solution: failure.solution
  });
}

/**
 * Turns one ESLint message into a diagnostic.
 *
 * The cause and the solution come from the same catalog the TypeScript
 * diagnostics use, so a rule explained once is explained everywhere.
 */
function toDiagnostic(uri: string, finding: LintFinding): Diagnostic {
  const code = finding.ruleId ?? '';
  const explanation = explainDiagnostic({ source: LINT_SOURCE, code, message: finding.message });

  return {
    code: code || 'eslint',
    source: LINT_SOURCE,
    severity: finding.severity === 2 ? DiagnosticSeverityValue.Error : DiagnosticSeverityValue.Warning,
    message: finding.message,
    cause: explanation.cause,
    solution: finding.fixable
      ? `${explanation.solution} ESLint can also fix this for you with npx eslint --fix.`
      : explanation.solution,
    range: {
      startLineNumber: finding.line,
      startColumn: finding.column,
      // A message without an end marks a single character, which is enough to
      // find the spot without covering the whole line in a squiggle.
      endLineNumber: finding.endLine ?? finding.line,
      endColumn: finding.endColumn ?? finding.column + 1
    },
    uri,
    documentationUrl: explanation.documentationUrl
  };
}
