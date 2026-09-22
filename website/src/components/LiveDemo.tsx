import { useMemo, useRef, useState, type JSX } from 'react';
import { analyze } from '../demo/analyzer';
import type { DemoLanguage } from '../demo/highlight';
import { DEMO_FILES, MISTAKES } from '../demo/samples';
import { CodeSurface, type CodeSurfaceHandle } from './CodeSurface';

/**
 * The editor in the hero, which really is an editor.
 *
 * A screenshot of a product whose whole claim is that it explains errors can
 * only assert the claim. This lets the visitor break the code themselves and
 * watch the explanation change, which is the difference between being told
 * something and checking it.
 */
export function LiveDemo(): JSX.Element {
  const [activeFile, setActiveFile] = useState(0);
  const [sources, setSources] = useState<string[]>(() => DEMO_FILES.map((file) => file.source));
  const [selected, setSelected] = useState(0);
  const surface = useRef<CodeSurfaceHandle>(null);

  const file = DEMO_FILES[activeFile] as (typeof DEMO_FILES)[number];
  const source = sources[activeFile] as string;
  const findings = useMemo(() => analyze(source, file.language), [source, file.language]);

  const current = findings[Math.min(selected, findings.length - 1)];
  const errorCount = findings.filter((entry) => entry.severity === 'error').length;
  const warningCount = findings.length - errorCount;

  function edit(next: string): void {
    setSources((previous) => previous.map((entry, index) => (index === activeFile ? next : entry)));
    setSelected(0);
  }

  function appendMistake(snippet: string): void {
    edit(source.replace(/\s*$/, '\n') + snippet);
    requestAnimationFrame(() => surface.current?.focus());
  }

  const chips = MISTAKES.filter((mistake) => mistake.language === file.language);

  return (
    <div className="demo">
      <div className="demo__chrome">
        <span className="demo__dot" />
        <span className="demo__dot" />
        <span className="demo__dot" />
        <span className="demo__title">{file.name} — checkout-service</span>
        <span className="demo__live">
          <span className="demo__live-dot" />
          editable
        </span>
      </div>

      <div className="demo__tabs" role="tablist" aria-label="Demo files">
        {DEMO_FILES.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            role="tab"
            aria-selected={index === activeFile}
            className={'demo__tab' + (index === activeFile ? ' demo__tab--active' : '')}
            onClick={() => {
              setActiveFile(index);
              setSelected(0);
            }}
          >
            <span
              className="demo__tile"
              style={{ background: entry.colour, color: entry.darkText ? '#1a1b26' : '#fff' }}
            >
              {entry.badge}
            </span>
            {entry.name}
          </button>
        ))}
      </div>

      <CodeSurface
        value={source}
        onChange={edit}
        language={file.language}
        markers={findings}
        height="316px"
        ariaLabel={`${file.name}, editable. Problems are listed below the editor.`}
        handleRef={surface}
      />

      <div className="demo__panel">
        <div className="demo__panel-head">
          <span className="demo__panel-tab demo__panel-tab--active">
            Problems
            <span className={'demo__count' + (findings.length === 0 ? ' demo__count--clear' : '')}>
              {findings.length}
            </span>
          </span>
          <div className="demo__chips">
            {chips.map((mistake) => (
              <button
                key={mistake.label}
                type="button"
                className="demo__chip"
                onClick={() => appendMistake(mistake.snippet)}
              >
                + {mistake.label}
              </button>
            ))}
            <button type="button" className="demo__chip demo__chip--reset" onClick={() => edit(file.source)}>
              Reset
            </button>
          </div>
        </div>

        <div className="demo__panel-body" aria-live="polite">
          {findings.length === 0 ? (
            <p className="demo__clear">
              Nothing to report. Change a type, loosen a comparison, or use a chip above to see what the panel
              says.
            </p>
          ) : (
            <>
              <ul className="demo__list">
                {findings.map((finding, index) => (
                  <li key={`${finding.code}-${finding.line}-${finding.column}`}>
                    <button
                      type="button"
                      className={'demo__entry' + (finding === current ? ' demo__entry--active' : '')}
                      onClick={() => {
                        setSelected(index);
                        surface.current?.reveal(finding.line, finding.column, finding.length);
                      }}
                    >
                      <span className={'demo__severity demo__severity--' + finding.severity} />
                      <span className="demo__entry-message">{finding.message}</span>
                      <span className="demo__entry-where">
                        {finding.line}:{finding.column}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {current ? (
                <dl className="demo__detail">
                  <dt>Where</dt>
                  <dd>
                    {file.name}, line {current.line}, column {current.column}
                    <span className="demo__badge">
                      {current.source} ({current.code})
                    </span>
                  </dd>
                  <dt>Why</dt>
                  <dd>{current.cause}</dd>
                  <dt>Fix</dt>
                  <dd>{current.fix}</dd>
                </dl>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="demo__status">
        <span>checkout-service</span>
        <span className="demo__status-problems">
          {errorCount} {errorCount === 1 ? 'error' : 'errors'}, {warningCount}{' '}
          {warningCount === 1 ? 'warning' : 'warnings'}
        </span>
        <span className="demo__status-right">
          <span>{source.split('\n').length} lines</span>
          <span>{LANGUAGE_LABEL[file.language]}</span>
          <span>Dark Modern</span>
        </span>
      </div>
    </div>
  );
}

const LANGUAGE_LABEL: Record<DemoLanguage, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python'
};
