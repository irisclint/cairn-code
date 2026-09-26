import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as monaco from 'monaco-editor';
import {
  DiagnosticService,
  toMonacoSeverity,
  fromMonacoSeverity
} from '@renderer/services/diagnostic-service';
import { detectLanguage, toMonacoLanguageId } from '@renderer/editor/language-support';

/**
 * Integration coverage for the diagnostic pipeline.
 *
 * Follows a problem from a Monaco marker, through the explainer, into the
 * service, and back out as something the Problems panel can render. This is the
 * path that has to produce a cause and a solution for every problem causeway
 * shows, so it is exercised against the real Monaco marker API.
 */

let service: DiagnosticService;
let model: monaco.editor.ITextModel;

/*
 * Creating a TypeScript model makes Monaco load its language mode, and that
 * import is dynamic: it can still be in flight when this file's environment is
 * torn down, which Vitest reports as an unhandled rejection even though every
 * test passed. Yielding once at the end lets it settle first.
 */
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});
let counter = 0;

beforeEach(() => {
  service = new DiagnosticService();
  counter += 1;
  model = monaco.editor.createModel(
    'const value: number = "text";\nconst unused = 1;\n',
    'typescript',
    monaco.Uri.file('/workspace/sample-' + counter + '.ts')
  );
});

describe('severity mapping', () => {
  it('should round trip through Monaco severities', () => {
    for (const severity of [0, 1, 2, 3] as const) {
      expect(fromMonacoSeverity(toMonacoSeverity(severity))).toBe(severity);
    }
  });

  it('should map the causeway scale onto the Monaco constants', () => {
    expect(toMonacoSeverity(0)).toBe(monaco.MarkerSeverity.Error);
    expect(toMonacoSeverity(1)).toBe(monaco.MarkerSeverity.Warning);
    expect(toMonacoSeverity(2)).toBe(monaco.MarkerSeverity.Info);
    expect(toMonacoSeverity(3)).toBe(monaco.MarkerSeverity.Hint);
  });
});

describe('importing Monaco markers', () => {
  it('should turn a compiler marker into a diagnostic with cause and solution', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: "Type 'string' is not assignable to type 'number'.",
        code: '2322',
        startLineNumber: 1,
        startColumn: 7,
        endLineNumber: 1,
        endColumn: 12
      }
    ]);

    const diagnostics = service.importMonacoMarkers(model);
    expect(diagnostics).toHaveLength(1);

    const diagnostic = diagnostics[0];
    expect(diagnostic?.code).toBe('TS2322');
    expect(diagnostic?.source).toBe('TypeScript');
    expect(diagnostic?.severity).toBe(0);
    expect(diagnostic?.range.startLineNumber).toBe(1);
    expect(diagnostic?.range.startColumn).toBe(7);
    expect(diagnostic?.cause).toContain('string');
    expect(diagnostic?.solution).toContain('number');
  });

  it('should record the file as an OS path the editor can reopen', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'anything',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      }
    ]);

    const diagnostic = service.importMonacoMarkers(model)[0];
    expect(diagnostic?.uri).toBe(model.uri.fsPath);
    // A leading slash before the drive letter would make the path unopenable.
    expect(diagnostic?.uri.startsWith('/C:')).toBe(false);
  });

  it('should give every imported diagnostic a non-empty cause and solution', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'a message with no catalogued code',
        code: '99999',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      },
      {
        severity: monaco.MarkerSeverity.Warning,
        message: "'unused' is declared but its value is never read.",
        code: '6133',
        startLineNumber: 2,
        startColumn: 7,
        endLineNumber: 2,
        endColumn: 13
      }
    ]);

    for (const diagnostic of service.importMonacoMarkers(model)) {
      expect(diagnostic.cause.length).toBeGreaterThan(0);
      expect(diagnostic.solution.length).toBeGreaterThan(0);
    }
  });

  it('should surface the counts the status bar shows', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'error one',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      },
      {
        severity: monaco.MarkerSeverity.Warning,
        message: 'warning one',
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 2
      }
    ]);

    service.importMonacoMarkers(model);
    expect(service.counts()).toMatchObject({ errors: 1, warnings: 1 });
  });

  it('should replace the previous import rather than accumulate duplicates', () => {
    const marker = {
      severity: monaco.MarkerSeverity.Error,
      message: 'still broken',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2
    };

    monaco.editor.setModelMarkers(model, 'typescript', [marker]);
    service.importMonacoMarkers(model);
    service.importMonacoMarkers(model);

    expect(service.get(model.uri.fsPath)).toHaveLength(1);
  });

  it('should clear the panel once the file compiles again', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'broken',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      }
    ]);
    service.importMonacoMarkers(model);
    expect(service.counts().errors).toBe(1);

    monaco.editor.setModelMarkers(model, 'typescript', []);
    service.importMonacoMarkers(model);
    expect(service.counts().errors).toBe(0);
  });

  it('should keep related information for a multi-location problem', () => {
    const other = monaco.editor.createModel('', 'typescript', monaco.Uri.file('/workspace/other.ts'));

    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'Duplicate identifier.',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
        relatedInformation: [
          {
            resource: other.uri,
            message: 'First declaration is here.',
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 2
          }
        ]
      }
    ]);

    const diagnostic = service.importMonacoMarkers(model)[0];
    expect(diagnostic?.relatedInformation).toHaveLength(1);
    expect(diagnostic?.relatedInformation?.[0]?.message).toBe('First declaration is here.');

    other.dispose();
  });

  it('should notify subscribers so the panel and status bar refresh together', () => {
    let notifications = 0;
    service.onDidChange(() => {
      notifications += 1;
    });

    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'broken',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      }
    ]);
    service.importMonacoMarkers(model);

    expect(notifications).toBeGreaterThan(0);
  });
});

describe('editor and diagnostics working together', () => {
  it('should tokenize a .tsx file with the Monaco TypeScript grammar', () => {
    const language = detectLanguage('/workspace/component.tsx');
    const tsxModel = monaco.editor.createModel(
      '',
      toMonacoLanguageId(language),
      monaco.Uri.file('/workspace/component.tsx')
    );

    // causeway labels the file TypeScript React, but the model has to carry the
    // Monaco id or the file would get no highlighting and no type checking.
    expect(language.label).toBe('TypeScript React');
    expect(tsxModel.getLanguageId()).toBe('typescript');
    tsxModel.dispose();
  });

  it('should scope diagnostics to the file they belong to', () => {
    const second = monaco.editor.createModel('', 'typescript', monaco.Uri.file('/workspace/second.ts'));

    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'first file problem',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      }
    ]);
    service.importMonacoMarkers(model);
    service.importMonacoMarkers(second);

    expect(service.get(model.uri.fsPath)).toHaveLength(1);
    expect(service.get(second.uri.fsPath)).toHaveLength(0);

    second.dispose();
  });

  it('should drop the diagnostics of a file that was closed', () => {
    monaco.editor.setModelMarkers(model, 'typescript', [
      {
        severity: monaco.MarkerSeverity.Error,
        message: 'broken',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2
      }
    ]);
    service.importMonacoMarkers(model);

    service.clearFile(model.uri.fsPath);
    expect(service.getFlattened()).toHaveLength(0);
  });
});
