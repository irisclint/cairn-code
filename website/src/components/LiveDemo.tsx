import { Fragment, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { analyze, type Finding } from '../demo/analyzer';
import { initialState, tokenizeLine, type DemoLanguage, type TokenKind } from '../demo/highlight';
import { DEMO_FILES, MISTAKES } from '../demo/samples';

/**
 * The editor in the hero, which really is an editor.
 *
 * A screenshot of a product whose whole claim is that it explains errors can
 * only assert the claim. This lets the visitor break the code themselves and
 * watch the explanation change, which is the difference between being told
 * something and checking it.
 *
 * The text is edited in a real textarea with a transparent colour, sitting on
 * top of the painted copy. That keeps the native caret, selection, undo stack,
 * spellcheck control and screen reader behaviour, none of which a
 * contenteditable div gets right without a great deal of work.
 */
export function LiveDemo(): JSX.Element {
  const [activeFile, setActiveFile] = useState(0);
  const [sources, setSources] = useState<string[]>(() => DEMO_FILES.map((file) => file.source));
  const [selected, setSelected] = useState(0);
  const [tabInserts, setTabInserts] = useState(true);

  const input = useRef<HTMLTextAreaElement>(null);
  const paint = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  const file = DEMO_FILES[activeFile] as (typeof DEMO_FILES)[number];
  const source = sources[activeFile] as string;
  const lines = useMemo(() => source.split('\n'), [source]);
  const findings = useMemo(() => analyze(source, file.language), [source, file.language]);

  const current = findings[Math.min(selected, findings.length - 1)];
  const errorCount = findings.filter((entry) => entry.severity === 'error').length;

  function edit(next: string): void {
    setSources((previous) => previous.map((entry, index) => (index === activeFile ? next : entry)));
    setSelected(0);
  }

  /** Keeps the painted copy and the gutter aligned with the textarea. */
  function syncScroll(): void {
    if (!input.current) return;
    if (paint.current) {
      paint.current.scrollTop = input.current.scrollTop;
      paint.current.scrollLeft = input.current.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = input.current.scrollTop;
  }

  /** Moves the caret to a finding and selects the range it covers. */
  function reveal(finding: Finding): void {
    const area = input.current;
    if (!area) return;

    let offset = 0;
    for (let index = 0; index < finding.line - 1; index += 1) {
      offset += (lines[index] as string).length + 1;
    }
    const start = offset + finding.column - 1;

    area.focus();
    area.setSelectionRange(start, start + finding.length);

    // Put the line roughly in the middle rather than at the very edge.
    const lineHeight = area.scrollHeight / Math.max(lines.length, 1);
    area.scrollTop = Math.max(0, (finding.line - 4) * lineHeight);
    syncScroll();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Escape releases the Tab key so that the keyboard can always leave the
    // editor. Without it a textarea that swallows Tab is a focus trap.
    if (event.key === 'Escape') {
      setTabInserts(false);
      return;
    }

    if (event.key !== 'Tab' || !tabInserts) {
      if (event.key !== 'Tab') setTabInserts(true);
      return;
    }

    event.preventDefault();
    const area = event.currentTarget;
    const { selectionStart, selectionEnd, value } = area;
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd);

    edit(next);
    requestAnimationFrame(() => area.setSelectionRange(selectionStart + 2, selectionStart + 2));
  }

  function appendMistake(snippet: string): void {
    const next = source.replace(/\s*$/, '\n') + snippet;
    edit(next);
    requestAnimationFrame(() => {
      input.current?.focus();
      syncScroll();
    });
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

      <div className="demo__editor">
        <div className="demo__gutter" ref={gutter} aria-hidden="true">
          {lines.map((_, index) => {
            const onThisLine = findings.filter((entry) => entry.line === index + 1);
            const severity = onThisLine.some((entry) => entry.severity === 'error')
              ? 'error'
              : onThisLine.length > 0
                ? 'warning'
                : null;

            return (
              <div key={index} className="demo__line-number">
                {severity ? <span className={'demo__mark demo__mark--' + severity} /> : null}
                {index + 1}
              </div>
            );
          })}
        </div>

        <div className="demo__surface">
          <pre className="demo__paint" ref={paint} aria-hidden="true">
            <code>
              <PaintedSource lines={lines} language={file.language} findings={findings} />
            </code>
          </pre>

          <textarea
            ref={input}
            className="demo__input"
            value={source}
            onChange={(event) => edit(event.target.value)}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            wrap="off"
            aria-label={`${file.name}, editable. Problems are listed below the editor. Press Escape then Tab to leave.`}
          />
        </div>
      </div>

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
                        reveal(finding);
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
          {errorCount} {errorCount === 1 ? 'error' : 'errors'}, {findings.length - errorCount}{' '}
          {findings.length - errorCount === 1 ? 'warning' : 'warnings'}
        </span>
        <span className="demo__status-right">
          <span>{lines.length} lines</span>
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

interface PaintedSourceProps {
  lines: string[];
  language: DemoLanguage;
  findings: Finding[];
}

/**
 * Paints the source, underlining the ranges the findings cover.
 *
 * The whole file is rendered as one run of text with real newlines, rather
 * than one element per line, because the textarea above it lays its text out
 * that way. Anything else drifts out of alignment as soon as a line wraps or a
 * scrollbar appears.
 */
function PaintedSource({ lines, language, findings }: PaintedSourceProps): JSX.Element {
  const state = initialState();

  return (
    <>
      {lines.map((line, index) => {
        const tokens = tokenizeLine(line, language, state);
        const marks = new Array<string | null>(line.length).fill(null);

        for (const finding of findings) {
          if (finding.line !== index + 1) continue;
          const from = Math.max(0, finding.column - 1);
          const to = Math.min(line.length, from + finding.length);
          for (let at = from; at < to; at += 1) marks[at] = finding.severity;
        }

        const kinds = new Array<TokenKind>(line.length).fill('plain');
        for (const token of tokens) {
          for (let at = token.start; at < token.end && at < line.length; at += 1) {
            kinds[at] = token.kind;
          }
        }

        const pieces: ReactNode[] = [];
        let at = 0;

        while (at < line.length) {
          const kind = kinds[at];
          const mark = marks[at];
          let end = at + 1;
          while (end < line.length && kinds[end] === kind && marks[end] === mark) end += 1;

          pieces.push(
            <span key={at} className={`tok tok--${kind}${mark ? ` tok--mark tok--mark-${mark}` : ''}`}>
              {line.slice(at, end)}
            </span>
          );
          at = end;
        }

        return (
          <Fragment key={index}>
            {pieces}
            {index < lines.length - 1 ? '\n' : null}
          </Fragment>
        );
      })}
    </>
  );
}
