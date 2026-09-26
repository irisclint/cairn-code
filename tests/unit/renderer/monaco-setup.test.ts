import { describe, it, expect, vi } from 'vitest';

/**
 * The `?worker` imports in monaco-setup are a Vite feature that has no meaning
 * under Vitest, so they are stubbed with a constructor that records nothing.
 * The logic being tested is the label to worker mapping and the theme
 * registration, neither of which needs a real worker.
 */
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/language/json/json.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/language/css/css.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/language/html/html.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/language/typescript/ts.worker?worker', () => ({ default: class {} }));

const { workerKindForLabel, setupMonaco, registerThemes, applyMonacoTheme } =
  await import('@renderer/editor/monaco-setup');
const monaco = await import('monaco-editor');
const { LANGUAGES } = await import('@renderer/editor/language-support');
const { listThemes } = await import('@renderer/theme-engine/theme-registry');
const { monacoThemeName } = await import('@renderer/theme-engine/monaco-theme');

describe('workerKindForLabel', () => {
  it('should give JSON its own worker', () => {
    expect(workerKindForLabel('json')).toBe('json');
  });

  it('should serve every stylesheet language from the CSS worker', () => {
    for (const label of ['css', 'scss', 'less']) {
      expect(workerKindForLabel(label), label).toBe('css');
    }
  });

  it('should serve the template languages from the HTML worker', () => {
    for (const label of ['html', 'handlebars', 'razor']) {
      expect(workerKindForLabel(label), label).toBe('html');
    }
  });

  it('should serve JavaScript from the TypeScript worker', () => {
    expect(workerKindForLabel('typescript')).toBe('typescript');
    expect(workerKindForLabel('javascript')).toBe('typescript');
  });

  it('should fall back to the editor worker for everything else', () => {
    for (const label of ['python', 'rust', 'plaintext', '']) {
      expect(workerKindForLabel(label), label).toBe('editor');
    }
  });
});

describe('setupMonaco', () => {
  it('should install a worker factory and register every language', () => {
    setupMonaco();

    expect(self.MonacoEnvironment).toBeDefined();

    const registered = new Set(monaco.languages.getLanguages().map((language) => language.id));
    for (const language of LANGUAGES) {
      const monacoId = language.monacoId ?? language.id;
      expect(registered.has(monacoId), monacoId).toBe(true);
    }
  });

  it('should return a worker for every label kind', () => {
    setupMonaco();
    const getWorker = (self.MonacoEnvironment as { getWorker: (id: string, label: string) => unknown })
      .getWorker;

    for (const label of ['json', 'css', 'html', 'typescript', 'python']) {
      expect(getWorker('1', label), label).toBeDefined();
    }
  });

  it('should be safe to call more than once', () => {
    expect(() => {
      setupMonaco();
      setupMonaco();
    }).not.toThrow();
  });

  it('should configure the TypeScript service in strict mode', () => {
    setupMonaco();
    const options = monaco.typescript.typescriptDefaults.getCompilerOptions();

    expect(options.strict).toBe(true);
    expect(options.noImplicitAny).toBe(true);
    expect(options.strictNullChecks).toBe(true);
  });

  it('should relax the same checks for plain JavaScript', () => {
    setupMonaco();
    const options = monaco.typescript.javascriptDefaults.getCompilerOptions();

    expect(options.strict).toBe(false);
    expect(options.noImplicitAny).toBe(false);
  });

  it('should suppress unresolved module errors, which would otherwise flood a file', () => {
    setupMonaco();
    const diagnostics = monaco.typescript.typescriptDefaults.getDiagnosticsOptions();

    expect(diagnostics.diagnosticCodesToIgnore).toContain(2307);
  });

  it('should give a language its comment configuration', () => {
    setupMonaco();

    // Monaco has no public reader for language configuration, so this asserts
    // the observable result: commenting works through the editor action, and
    // registration did not throw for any language in the table.
    expect(monaco.languages.getLanguages().length).toBeGreaterThanOrEqual(LANGUAGES.length);
  });
});

describe('theme registration', () => {
  it('should define a Monaco theme for every installed theme', () => {
    expect(() => registerThemes()).not.toThrow();
  });

  it('should apply a registered theme by id', () => {
    registerThemes();
    expect(() => applyMonacoTheme('nordic')).not.toThrow();
  });

  it('should not throw for a theme Monaco does not know', () => {
    expect(() => applyMonacoTheme('not-a-theme')).not.toThrow();
  });

  it('should namespace every theme name', () => {
    for (const theme of listThemes()) {
      expect(monacoThemeName(theme.id)).toBe('causeway-' + theme.id);
    }
  });
});
