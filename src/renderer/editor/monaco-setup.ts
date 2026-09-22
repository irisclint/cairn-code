import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

import { LANGUAGES } from './language-support';
import { listThemes } from '../theme-engine/theme-registry';
import { monacoThemeName, toMonacoTheme } from '../theme-engine/monaco-theme';
import { createLogger } from '@shared/logger';

const log = createLogger('monaco');

let initialized = false;

/**
 * Configures the Monaco environment once for the whole application.
 *
 * Language services run in dedicated web workers, which is what keeps
 * tokenization and type checking of a 50k line file off the UI thread. The
 * worker bundles are produced by Vite through the `?worker` imports above.
 */
/** The worker bundle that serves a given Monaco language label. */
export type WorkerKind = 'json' | 'css' | 'html' | 'typescript' | 'editor';

/**
 * Maps a Monaco language label onto the worker bundle that can serve it.
 *
 * Several labels share one worker: the CSS worker also handles SCSS and Less,
 * and the HTML worker handles the template languages built on it. Anything
 * without a dedicated language service falls back to the plain editor worker,
 * which provides tokenization and basic editing.
 */
export function workerKindForLabel(label: string): WorkerKind {
  switch (label) {
    case 'json':
      return 'json';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'handlebars':
    case 'razor':
      return 'html';
    case 'typescript':
    case 'javascript':
      return 'typescript';
    default:
      return 'editor';
  }
}

export function setupMonaco(): void {
  if (initialized) return;
  initialized = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (workerKindForLabel(label)) {
        case 'json':
          return new jsonWorker();
        case 'css':
          return new cssWorker();
        case 'html':
          return new htmlWorker();
        case 'typescript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    }
  };

  registerLanguages();
  configureTypeScriptDefaults();
  registerThemes();

  log.info(`Monaco initialised with ${LANGUAGES.length} languages`);
}

/**
 * Registers cairn-code's language table with Monaco.
 *
 * Monaco already knows most of these ids from its basic-languages bundle;
 * registering again is a no-op for those but adds the extensions and comment
 * configuration cairn-code defines, and it makes unknown languages selectable so the
 * status bar and the comment command still work on them.
 */
function registerLanguages(): void {
  const known = new Set(monaco.languages.getLanguages().map((language) => language.id));
  const configured = new Set<string>();

  for (const language of LANGUAGES) {
    const monacoId = language.monacoId ?? language.id;

    if (!known.has(monacoId)) {
      monaco.languages.register({
        id: monacoId,
        extensions: language.extensions.map((extension) => `.${extension}`),
        filenames: language.filenames,
        aliases: [language.label, language.id]
      });
      known.add(monacoId);
    }

    // Several cairn-code languages share one Monaco grammar; the first of them
    // supplies the comment configuration and the rest must not overwrite it,
    // or Vue would end up commenting with the Svelte tokens.
    if ((language.lineComment || language.blockComment) && !configured.has(monacoId)) {
      configured.add(monacoId);
      monaco.languages.setLanguageConfiguration(monacoId, {
        comments: {
          lineComment: language.lineComment,
          blockComment: language.blockComment
        },
        brackets: [
          ['{', '}'],
          ['[', ']'],
          ['(', ')']
        ],
        autoClosingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: "'", close: "'", notIn: ['string', 'comment'] },
          { open: '"', close: '"', notIn: ['string'] },
          { open: '`', close: '`', notIn: ['string', 'comment'] }
        ],
        surroundingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: "'", close: "'" },
          { open: '"', close: '"' },
          { open: '`', close: '`' }
        ]
      });
    }
  }
}

/**
 * Tunes the bundled TypeScript service.
 *
 * Strict mode is enabled so that the editor reports the same errors the project
 * build would, which is the whole point of showing diagnostics inline. Module
 * resolution is set to bundler because that is what the cairn-code toolchain and
 * most modern projects use.
 */
function configureTypeScriptDefaults(): void {
  const compilerOptions: monaco.typescript.CompilerOptions = {
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: false,
    strict: true,
    noImplicitAny: true,
    strictNullChecks: true,
    esModuleInterop: true,
    allowNonTsExtensions: true,
    skipLibCheck: true
  };

  monaco.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    ...compilerOptions,
    strict: false,
    noImplicitAny: false
  });

  // Without the project's node_modules on disk, every bare import would be
  // reported as an unresolved module (TS2307). Suppressing exactly that code
  // keeps real type errors visible without drowning the user in false alarms.
  const diagnosticsOptions: monaco.typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    diagnosticCodesToIgnore: [2307, 2792]
  };
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

  monaco.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.typescript.javascriptDefaults.setEagerModelSync(true);
}

/** Registers every installed cairn-code theme with Monaco. */
export function registerThemes(): void {
  for (const theme of listThemes()) {
    try {
      monaco.editor.defineTheme(monacoThemeName(theme.id), toMonacoTheme(theme));
    } catch (error) {
      log.warn(`Could not register Monaco theme for ${theme.id}: ${String(error)}`);
    }
  }
}

/** Switches the editor theme. Safe to call before any editor exists. */
export function applyMonacoTheme(themeId: string): void {
  try {
    monaco.editor.setTheme(monacoThemeName(themeId));
  } catch (error) {
    log.warn(`Could not apply Monaco theme ${themeId}: ${String(error)}`);
  }
}
