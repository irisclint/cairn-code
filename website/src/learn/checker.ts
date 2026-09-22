import type { Lesson, ReadTest, RunTest } from './curriculum';

/**
 * Decides whether a lesson is solved, and says why when it is not.
 *
 * Feedback here follows the same contract as the editor's diagnostics: a
 * learner never gets "wrong" on its own. They get the case that failed, what
 * came back instead, and a hint aimed at the idea rather than the answer.
 */

export interface CaseResult {
  label: string;
  ok: boolean;
  /** What actually happened, when that is worth showing. */
  detail?: string;
  hint?: string;
}

export interface CheckResult {
  passed: boolean;
  cases: CaseResult[];
  /** Set when nothing could be checked at all, such as a syntax error. */
  failure?: { message: string; cause: string; fix: string };
}

const TIMEOUT_MS = 2000;

export async function check(lesson: Lesson, code: string): Promise<CheckResult> {
  if (lesson.check === 'read') return readCheck(lesson.read ?? [], code);
  return runCheck(lesson.run ?? [], code);
}

/* -------------------------------------------------------------------------- */
/* Reading the code                                                            */
/* -------------------------------------------------------------------------- */

function readCheck(tests: ReadTest[], code: string): CheckResult {
  const stripped = stripComments(code);

  const cases = tests.map((test): CaseResult => {
    const found = new RegExp(test.pattern).test(stripped);
    const ok = test.forbidden ? !found : found;

    return {
      label: test.describe,
      ok,
      hint: ok ? undefined : test.hint
    };
  });

  return { passed: cases.every((entry) => entry.ok), cases };
}

/**
 * Removes comments before matching.
 *
 * Without this a learner who leaves the starter comment in place, or who
 * writes the answer in a comment while thinking, gets a pass they did not
 * earn and a false idea of what the code does.
 */
function stripComments(code: string): string {
  return code
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').replace(/\/\/.*$/, ''))
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* Running the code                                                            */
/* -------------------------------------------------------------------------- */

interface WorkerOutcome {
  ok: boolean;
  json?: string;
  kind?: string;
  error?: string;
}

/**
 * Runs the learner's code in a worker and calls each test expression.
 *
 * A worker is used rather than eval on this page for two reasons: it cannot
 * touch the document, and it can be terminated, which is the only way to
 * recover from a loop that never ends. That case is common enough while
 * learning that it needs a real answer rather than a frozen tab.
 */
async function runCheck(tests: RunTest[], code: string): Promise<CheckResult> {
  if (typeof Worker !== 'function' || typeof URL.createObjectURL !== 'function') {
    return {
      passed: false,
      cases: [],
      failure: {
        message: 'This browser cannot run the checker',
        cause: 'Running your code needs Web Workers, which this browser does not provide.',
        fix: 'Read the lesson and compare your code with the worked solution, or install the editor and run it there.'
      }
    };
  }

  const harness = [
    '"use strict";',
    code,
    'function __present(value) {',
    '  if (typeof value === "function") return { kind: "function" };',
    '  try { return { kind: "value", json: JSON.stringify(value) }; }',
    '  catch (error) { return { kind: "value", json: String(value) }; }',
    '}',
    `var __calls = ${JSON.stringify(tests.map((test) => test.call))};`,
    'var __results = __calls.map(function (call) {',
    '  try {',
    '    var value = eval(call);',
    '    var shown = __present(value);',
    '    return { ok: true, json: shown.json, kind: shown.kind };',
    '  } catch (error) {',
    '    return { ok: false, error: String((error && error.message) || error) };',
    '  }',
    '});',
    'self.postMessage(__results);'
  ].join('\n');

  const url = URL.createObjectURL(new Blob([harness], { type: 'text/javascript' }));
  let worker: Worker;

  try {
    worker = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    return syntaxFailure(String(error));
  }

  const outcomes = await new Promise<WorkerOutcome[] | { crash: string } | 'timeout'>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<WorkerOutcome[]>) => {
      clearTimeout(timer);
      resolve(event.data);
    };

    worker.onerror = (event) => {
      clearTimeout(timer);
      // The message is the only useful part; a blob worker reports no file.
      resolve({ crash: event.message || 'Your code could not be run.' });
    };
  });

  worker.terminate();
  URL.revokeObjectURL(url);

  if (outcomes === 'timeout') {
    return {
      passed: false,
      cases: [],
      failure: {
        message: 'Your code did not finish',
        cause: `It was still running after ${TIMEOUT_MS / 1000} seconds, so it was stopped. Almost always this is a loop whose condition never becomes false.`,
        fix: 'Check that something inside the loop changes the value the condition tests, so that it eventually stops being true.'
      }
    };
  }

  if (!Array.isArray(outcomes)) return syntaxFailure(outcomes.crash);

  const cases = tests.map((test, index): CaseResult => {
    const outcome = outcomes[index];
    const expected = JSON.stringify(test.expected);

    if (!outcome) {
      return { label: test.call, ok: false, hint: test.hint };
    }

    if (!outcome.ok) {
      return {
        label: test.call,
        ok: false,
        detail: `threw ${outcome.error}`,
        hint: test.hint
      };
    }

    if (outcome.kind === 'function') {
      return {
        label: test.call,
        ok: false,
        detail: 'gave back a function',
        hint: 'You returned the function itself rather than calling it, or forgot the brackets somewhere.'
      };
    }

    const actual = outcome.json ?? 'undefined';
    if (actual === expected) return { label: test.call, ok: true, detail: `gave ${actual}` };

    return {
      label: test.call,
      ok: false,
      detail: actual === 'undefined' ? 'gave back nothing' : `gave ${actual}, expected ${expected}`,
      hint:
        actual === 'undefined'
          ? 'A function with no return hands back undefined. Use return where you print or calculate the answer.'
          : test.hint
    };
  });

  return { passed: cases.every((entry) => entry.ok), cases };
}

function syntaxFailure(message: string): CheckResult {
  return {
    passed: false,
    cases: [],
    failure: {
      message: 'Your code could not be read',
      cause: `The browser rejected it before running a single line: ${message}`,
      fix: 'Look for a missing bracket, brace or quote. The editor underlines these as you type; here the first mismatched pair is usually the culprit.'
    }
  };
}
