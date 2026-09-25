import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { analyze } from '../demo/analyzer';
import { CodeSurface, type CodeSurfaceHandle } from './CodeSurface';

/**
 * The editor in the hero, which is the argument rather than a picture of it.
 *
 * The headline claims the editor tells you why something broke. A screenshot
 * can only repeat that claim. So this types a real mistake into a real
 * analyser, on its own, in the first few seconds: the visitor watches a string
 * go where a number belongs and watches the cause and the fix arrive with it.
 * Then it stops and hands over, because the point is not the animation, it is
 * that the same thing happens to whatever you type next.
 */

/** The file as it stands before the mistake is made. */
const OPENING = `interface Session {
  id: string;
  expiresIn: number;
}

const session: Session = {
  id: 'a41f',
`;

/** What types itself in, one character at a time. */
const TYPED = `  expiresIn: '3600',
};
`;

/** Milliseconds between characters. Fast enough to watch, slow enough to read. */
const KEYSTROKE_MS = 42;

/** A pause before the first character, so the section can settle first. */
const LEAD_IN_MS = 900;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HeroPreview(): JSX.Element {
  const reduced = useMemo(prefersReducedMotion, []);

  // Reduced motion gets the finished state rather than a faster animation:
  // the thing being demonstrated is the result, not the typing.
  const [source, setSource] = useState(() => (reduced ? OPENING + TYPED : OPENING));
  const [typing, setTyping] = useState(!reduced);
  const surface = useRef<CodeSurfaceHandle>(null);

  useEffect(() => {
    if (reduced) return;

    let index = 0;
    let keystroke: ReturnType<typeof setTimeout>;

    const typeNext = (): void => {
      index += 1;
      setSource(OPENING + TYPED.slice(0, index));
      if (index < TYPED.length) {
        keystroke = setTimeout(typeNext, KEYSTROKE_MS);
      } else {
        setTyping(false);
      }
    };

    const leadIn = setTimeout(typeNext, LEAD_IN_MS);
    return () => {
      clearTimeout(leadIn);
      clearTimeout(keystroke);
    };
  }, [reduced]);

  const findings = useMemo(() => analyze(source, 'typescript'), [source]);
  const finding = findings[0];

  const markers = findings.map((entry) => ({
    line: entry.line,
    column: entry.column,
    length: entry.length,
    severity: entry.severity
  }));

  /** A keystroke from the visitor ends the demonstration at once. */
  function edit(next: string): void {
    setTyping(false);
    setSource(next);
  }

  return (
    <div className={'hero-preview' + (typing ? ' hero-preview--typing' : '')}>
      <div className="hero-preview__chrome">
        <span className="hero-preview__dot" />
        <span className="hero-preview__dot" />
        <span className="hero-preview__dot" />
        <span className="hero-preview__name">session.ts</span>
        <span className="hero-preview__state">{typing ? 'typing' : 'your turn'}</span>
      </div>

      <CodeSurface
        value={source}
        onChange={edit}
        language="typescript"
        markers={markers}
        height="208px"
        ariaLabel="A TypeScript file you can edit. Problems are explained underneath."
        handleRef={surface}
      />

      <div className="hero-preview__answers" aria-live="polite">
        {finding ? (
          <>
            <div className="hero-preview__head">
              <span className={'hero-preview__sev hero-preview__sev--' + finding.severity}>
                {finding.code}
              </span>
              <button
                type="button"
                className="hero-preview__message"
                onClick={() => surface.current?.reveal(finding.line, finding.column, finding.length)}
              >
                {finding.message}
              </button>
            </div>
            <p className="hero-preview__row">
              <span className="hero-preview__label">Why</span>
              {finding.cause}
            </p>
            <p className="hero-preview__row">
              <span className="hero-preview__label hero-preview__label--fix">Fix</span>
              {finding.fix}
            </p>
          </>
        ) : (
          <p className="hero-preview__clear">
            Nothing to report. Break something and the four answers come back.
          </p>
        )}
      </div>

      {/*
        The invitation, which only appears once the demonstration has stopped.
        Showing it during the typing would ask for something the visitor cannot
        do yet, and it is the one moment worth drawing the eye to.
      */}
      <p className={'hero-preview__invite' + (typing ? '' : ' hero-preview__invite--ready')}>
        Edit the code above. It re-checks on every keystroke.
      </p>
    </div>
  );
}
