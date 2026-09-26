import * as monaco from 'monaco-editor';
import type { Diagnostic, DiagnosticSeverity } from '@shared/types';
import { explainDiagnostic, normalizeCode } from '../editor/diagnostic-explainer';
import { createLogger } from '@shared/logger';

const log = createLogger('diagnostics');

/** Marker owner used for diagnostics causeway produces itself. */
const OWNER = 'causeway';

/** Maps the causeway severity scale onto Monaco's. */
export function toMonacoSeverity(severity: DiagnosticSeverity): monaco.MarkerSeverity {
  switch (severity) {
    case 0:
      return monaco.MarkerSeverity.Error;
    case 1:
      return monaco.MarkerSeverity.Warning;
    case 2:
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

/** Maps Monaco's severity scale onto the causeway one. */
export function fromMonacoSeverity(severity: monaco.MarkerSeverity): DiagnosticSeverity {
  switch (severity) {
    case monaco.MarkerSeverity.Error:
      return 0;
    case monaco.MarkerSeverity.Warning:
      return 1;
    case monaco.MarkerSeverity.Info:
      return 2;
    default:
      return 3;
  }
}

export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
}

type Listener = (all: ReadonlyMap<string, Diagnostic[]>) => void;

/**
 * Single source of truth for every problem shown in causeway.
 *
 * Diagnostics arrive from three places: Monaco's own language workers
 * (TypeScript, JSON, CSS, HTML), the ESLint worker, and future language server
 * clients. They are merged per file, enriched with cause and solution, pushed
 * into the editor as markers and mirrored into the Problems panel.
 */
export class DiagnosticService {
  #byFile = new Map<string, Diagnostic[]>();
  #listeners = new Set<Listener>();
  /** Sources the last Monaco import produced for a file, keyed by file. */
  #importedSources = new Map<string, Set<string>>();

  /** Replaces all diagnostics of one source for one file. */
  setDiagnostics(uri: string, source: string, diagnostics: Diagnostic[]): void {
    const others = (this.#byFile.get(uri) ?? []).filter((entry) => entry.source !== source);
    const merged = [...others, ...diagnostics].sort(
      (a, b) => a.range.startLineNumber - b.range.startLineNumber || a.range.startColumn - b.range.startColumn
    );

    if (merged.length === 0) this.#byFile.delete(uri);
    else this.#byFile.set(uri, merged);

    this.#applyMarkers(uri, merged);
    this.#notify();
  }

  /** Removes every diagnostic for a file, for example when it is closed. */
  clearFile(uri: string): void {
    this.#importedSources.delete(uri);
    if (!this.#byFile.delete(uri)) return;
    this.#applyMarkers(uri, []);
    this.#notify();
  }

  clearAll(): void {
    const uris = [...this.#byFile.keys()];
    this.#byFile.clear();
    this.#importedSources.clear();
    for (const uri of uris) this.#applyMarkers(uri, []);
    this.#notify();
  }

  get(uri: string): Diagnostic[] {
    return this.#byFile.get(uri) ?? [];
  }

  getAll(): ReadonlyMap<string, Diagnostic[]> {
    return this.#byFile;
  }

  /** Flattened view used by the Problems panel. */
  getFlattened(): Diagnostic[] {
    const all: Diagnostic[] = [];
    for (const diagnostics of this.#byFile.values()) all.push(...diagnostics);
    return all.sort(
      (a, b) =>
        a.severity - b.severity ||
        a.uri.localeCompare(b.uri) ||
        a.range.startLineNumber - b.range.startLineNumber
    );
  }

  counts(): DiagnosticCounts {
    const counts: DiagnosticCounts = { errors: 0, warnings: 0, infos: 0, hints: 0 };
    for (const diagnostics of this.#byFile.values()) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === 0) counts.errors += 1;
        else if (diagnostic.severity === 1) counts.warnings += 1;
        else if (diagnostic.severity === 2) counts.infos += 1;
        else counts.hints += 1;
      }
    }
    return counts;
  }

  onDidChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Imports the markers Monaco's own language workers produced for a model and
   * republishes them as causeway diagnostics with cause and solution attached.
   */
  importMonacoMarkers(model: monaco.editor.ITextModel, ownerFilter?: string[]): Diagnostic[] {
    const uri = model.uri.fsPath;
    const markers = monaco.editor
      .getModelMarkers({ resource: model.uri })
      .filter((marker) => marker.owner !== OWNER)
      .filter((marker) => !ownerFilter || ownerFilter.includes(marker.owner));

    const diagnostics = markers.map((marker) => this.#markerToDiagnostic(uri, marker));
    const bySource = new Map<string, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const list = bySource.get(diagnostic.source) ?? [];
      list.push(diagnostic);
      bySource.set(diagnostic.source, list);
    }

    // A source that reported problems last time but reports none now has to be
    // cleared explicitly. Without this the Problems panel would keep showing
    // errors the user has already fixed, because an empty marker set produces
    // no entry to overwrite them with.
    const previousSources = this.#importedSources.get(uri);
    if (previousSources) {
      for (const source of previousSources) {
        if (!bySource.has(source)) this.setDiagnostics(uri, source, []);
      }
    }
    this.#importedSources.set(uri, new Set(bySource.keys()));

    for (const [source, list] of bySource) this.setDiagnostics(uri, source, list);
    return diagnostics;
  }

  #markerToDiagnostic(uri: string, marker: monaco.editor.IMarker): Diagnostic {
    const source = marker.source ?? this.#ownerToSource(marker.owner);
    const code = typeof marker.code === 'object' ? marker.code.value : marker.code;
    const explanation = explainDiagnostic({ source, code, message: marker.message });

    return {
      code: normalizeCode(source, code) || 'unknown',
      source,
      severity: fromMonacoSeverity(marker.severity),
      message: marker.message,
      cause: explanation.cause,
      solution: explanation.solution,
      documentationUrl: explanation.documentationUrl,
      uri,
      range: {
        startLineNumber: marker.startLineNumber,
        startColumn: marker.startColumn,
        endLineNumber: marker.endLineNumber,
        endColumn: marker.endColumn
      },
      relatedInformation: marker.relatedInformation?.map((related) => ({
        location: {
          uri: related.resource.fsPath,
          range: {
            startLineNumber: related.startLineNumber,
            startColumn: related.startColumn,
            endLineNumber: related.endLineNumber,
            endColumn: related.endColumn
          }
        },
        message: related.message
      }))
    };
  }

  #ownerToSource(owner: string): string {
    const map: Record<string, string> = {
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      json: 'JSON',
      css: 'CSS',
      scss: 'SCSS',
      less: 'Less',
      html: 'HTML'
    };
    return map[owner] ?? owner;
  }

  #applyMarkers(uri: string, diagnostics: Diagnostic[]): void {
    const model = monaco.editor.getModels().find((candidate) => candidate.uri.fsPath === uri);
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = diagnostics
      // Markers Monaco produced itself are already displayed by their own owner;
      // re-publishing them under the causeway owner would double every squiggle.
      .filter((diagnostic) => diagnostic.source === 'ESLint' || diagnostic.source.startsWith('LSP'))
      .map((diagnostic) => ({
        severity: toMonacoSeverity(diagnostic.severity),
        startLineNumber: diagnostic.range.startLineNumber,
        startColumn: diagnostic.range.startColumn,
        endLineNumber: diagnostic.range.endLineNumber,
        endColumn: diagnostic.range.endColumn,
        message: `${diagnostic.message}\n\nCause: ${diagnostic.cause}\nFix: ${diagnostic.solution}`,
        code: diagnostic.code,
        source: diagnostic.source
      }));

    try {
      monaco.editor.setModelMarkers(model, OWNER, markers);
    } catch (error) {
      log.warn(`Could not set markers for ${uri}: ${String(error)}`);
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.#byFile);
  }
}

export const diagnosticService = new DiagnosticService();
