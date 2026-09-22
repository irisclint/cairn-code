import { useMemo, useState, type JSX } from 'react';
import type { Diagnostic, DiagnosticSeverity } from '@shared/types';
import { Icon } from '../common/Icon';
import { useProblems } from '../../hooks/useProblems';
import { useEditorStore } from '../../store/editor-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { getActiveEditor } from '../../services/register-commands';
import { basename, relativeTo } from '@shared/utils';

const SEVERITY_META: Record<DiagnosticSeverity, { icon: string; label: string; className: string }> = {
  0: { icon: 'error', label: 'Error', className: 'problems__severity--error' },
  1: { icon: 'warning', label: 'Warning', className: 'problems__severity--warning' },
  2: { icon: 'info', label: 'Info', className: 'problems__severity--info' },
  3: { icon: 'lightbulb', label: 'Hint', className: 'problems__severity--hint' }
};

interface ProblemRowProps {
  diagnostic: Diagnostic;
  rootPath: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onReveal: () => void;
}

/**
 * One problem row.
 *
 * The collapsed row answers where and what. Expanding answers why and how,
 * which is the part a bare compiler message never provides.
 */
function ProblemRow({ diagnostic, rootPath, isExpanded, onToggle, onReveal }: ProblemRowProps): JSX.Element {
  const meta = SEVERITY_META[diagnostic.severity];

  return (
    <div className={'problems__row' + (isExpanded ? ' problems__row--expanded' : '')}>
      <div className="problems__summary">
        <button
          type="button"
          className="problems__expander icon-button"
          aria-label={isExpanded ? 'Hide details' : 'Show cause and fix'}
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={13} />
        </button>

        <Icon name={meta.icon} size={14} className={'problems__severity ' + meta.className} />

        <button type="button" className="problems__message" onClick={onReveal} title="Go to this problem">
          {diagnostic.message}
        </button>

        <span className="problems__source">
          {diagnostic.source}
          {diagnostic.code && diagnostic.code !== 'unknown' ? '(' + diagnostic.code + ')' : ''}
        </span>

        <button type="button" className="problems__location" onClick={onReveal}>
          {basename(diagnostic.uri)}
          <span className="problems__line">
            [Ln {diagnostic.range.startLineNumber}, Col {diagnostic.range.startColumn}]
          </span>
        </button>
      </div>

      {isExpanded ? (
        <div className="problems__details">
          <dl>
            <dt>Where</dt>
            <dd>
              {relativeTo(rootPath, diagnostic.uri)}, line {diagnostic.range.startLineNumber}, column{' '}
              {diagnostic.range.startColumn}
            </dd>
            <dt>Why</dt>
            <dd>{diagnostic.cause}</dd>
            <dt>Fix</dt>
            <dd>{diagnostic.solution}</dd>
          </dl>

          {diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0 ? (
            <div className="problems__related">
              <span className="problems__related-title">Related</span>
              <ul>
                {diagnostic.relatedInformation.map((related, index) => (
                  <li key={index}>
                    {basename(related.location.uri)}:{related.location.range.startLineNumber} -{' '}
                    {related.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diagnostic.documentationUrl ? (
            <a
              className="problems__doc-link"
              href={diagnostic.documentationUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Read the rule documentation
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Lists every diagnostic in the workspace, grouped by severity. */
export function ProblemsPanel(): JSX.Element {
  const problems = useProblems();
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const openFile = useEditorStore((state) => state.openFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const keyOf = (diagnostic: Diagnostic): string =>
    diagnostic.uri +
    ':' +
    diagnostic.range.startLineNumber +
    ':' +
    diagnostic.range.startColumn +
    ':' +
    diagnostic.code;

  const visible = useMemo(() => {
    if (filter.trim().length === 0) return problems;
    const needle = filter.toLowerCase();
    return problems.filter(
      (diagnostic) =>
        diagnostic.message.toLowerCase().includes(needle) ||
        diagnostic.code.toLowerCase().includes(needle) ||
        diagnostic.uri.toLowerCase().includes(needle)
    );
  }, [problems, filter]);

  const reveal = async (diagnostic: Diagnostic): Promise<void> => {
    await openFile(diagnostic.uri);
    const editor = getActiveEditor();
    if (!editor) return;
    editor.revealLineInCenter(diagnostic.range.startLineNumber);
    editor.setPosition({
      lineNumber: diagnostic.range.startLineNumber,
      column: diagnostic.range.startColumn
    });
    editor.focus();
  };

  return (
    <div className="problems">
      <div className="problems__toolbar">
        <input
          className="input input--small"
          placeholder="Filter problems"
          aria-label="Filter problems"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className="problems__count">
          {visible.length} of {problems.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="problems__empty">
          {problems.length === 0
            ? 'No problems have been detected in the open files.'
            : 'No problem matches this filter.'}
        </p>
      ) : (
        <div className="problems__list" role="list">
          {visible.map((diagnostic) => {
            const key = keyOf(diagnostic);
            return (
              <ProblemRow
                key={key}
                diagnostic={diagnostic}
                rootPath={rootPath}
                isExpanded={expanded.has(key)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                onReveal={() => void reveal(diagnostic)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
