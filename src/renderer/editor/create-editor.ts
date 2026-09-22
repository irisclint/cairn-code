import * as monaco from 'monaco-editor';
import type { Settings } from '@shared/types';
import { LARGE_FILE_THRESHOLD_BYTES } from '@shared/constants';
import { monacoThemeName } from '../theme-engine/monaco-theme';

export interface CreateEditorOptions {
  container: HTMLElement;
  settings: Settings;
  themeId: string;
  /** True when the file is large enough to need the reduced feature set. */
  isLargeFile?: boolean;
}

/**
 * Builds the editor options from user settings.
 *
 * Large files deliberately lose the minimap, folding, occurrence highlighting
 * and bracket colourisation. Each of those walks the whole model on every edit,
 * and switching them off is what keeps a 50k line file responsive.
 */
export function buildEditorOptions(
  settings: Settings,
  themeId: string,
  isLargeFile = false
): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    theme: monacoThemeName(themeId),
    fontSize: settings['editor.fontSize'],
    fontFamily: settings['editor.fontFamily'],
    fontLigatures: true,
    lineHeight: 1.5,
    tabSize: settings['editor.tabSize'],
    insertSpaces: settings['editor.insertSpaces'],
    wordWrap: settings['editor.wordWrap'],
    lineNumbers: settings['editor.lineNumbers'],
    renderWhitespace: isLargeFile ? 'none' : settings['editor.renderWhitespace'],

    minimap: {
      enabled: settings['workbench.showMinimap'] && !isLargeFile,
      renderCharacters: false,
      maxColumn: 100
    },

    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    mouseWheelZoom: true,
    multiCursorModifier: 'alt',
    renderLineHighlight: 'all',
    roundedSelection: false,
    padding: { top: 8, bottom: 8 },

    folding: !isLargeFile,
    foldingHighlight: !isLargeFile,
    showFoldingControls: 'mouseover',
    occurrencesHighlight: isLargeFile ? 'off' : 'singleFile',
    bracketPairColorization: { enabled: !isLargeFile },
    guides: {
      indentation: true,
      bracketPairs: !isLargeFile,
      highlightActiveIndentation: true
    },

    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    snippetSuggestions: 'inline',
    parameterHints: { enabled: true },
    inlayHints: { enabled: 'on' },

    formatOnPaste: true,
    formatOnType: false,
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    trimAutoWhitespace: true,

    scrollbar: {
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      useShadows: false
    },

    stickyScroll: { enabled: !isLargeFile },
    unicodeHighlight: { ambiguousCharacters: true, invisibleCharacters: true },
    fixedOverflowWidgets: true
  };
}

/** Creates a configured Monaco editor instance. */
export function createEditor(options: CreateEditorOptions): monaco.editor.IStandaloneCodeEditor {
  return monaco.editor.create(
    options.container,
    buildEditorOptions(options.settings, options.themeId, options.isLargeFile)
  );
}

/** Prefix identifying a buffer that has never been written to disk. */
const UNTITLED_SCHEME = 'untitled:';

/**
 * Resolves the Monaco URI for an editor path.
 *
 * A path on disk becomes a `file:` URI; an untitled buffer already carries its
 * own scheme and has to be parsed instead. Every caller must go through this
 * function: creating a model with one form and reading it back with the other
 * silently yields a different, empty model, which would lose the user's work on
 * the first save.
 */
export function modelUriFor(path: string): monaco.Uri {
  return path.startsWith(UNTITLED_SCHEME) ? monaco.Uri.parse(path) : monaco.Uri.file(path);
}

/**
 * Returns or creates the model for a file.
 *
 * Models are keyed by path and kept alive across tab switches, which preserves
 * undo history, folding state and diagnostics when the user comes back.
 */
export function getOrCreateModel(
  path: string,
  content: string,
  languageId: string
): monaco.editor.ITextModel {
  const uri = modelUriFor(path);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== content) existing.setValue(content);
    if (existing.getLanguageId() !== languageId) monaco.editor.setModelLanguage(existing, languageId);
    return existing;
  }
  return monaco.editor.createModel(content, languageId, uri);
}

/** Returns the model for a path, or null when none is open. */
export function getModel(path: string): monaco.editor.ITextModel | null {
  return monaco.editor.getModel(modelUriFor(path));
}

/** Disposes the model of a file, used when its editor is closed for good. */
export function disposeModel(path: string): void {
  monaco.editor.getModel(modelUriFor(path))?.dispose();
}

/** True when a file of this size should use the reduced feature set. */
export function isLargeFile(sizeBytes: number): boolean {
  return sizeBytes > LARGE_FILE_THRESHOLD_BYTES;
}
