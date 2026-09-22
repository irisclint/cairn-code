import {
  Fragment,
  useImperativeHandle,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type RefObject
} from 'react';
import { initialState, tokenizeLine, type DemoLanguage, type TokenKind } from '../demo/highlight';

/**
 * The editable, highlighted code surface.
 *
 * One implementation, used by both the demo in the hero and the lessons on the
 * Learn page. Two would drift: the alignment between the textarea and the
 * painted copy depends on a dozen text metrics agreeing exactly, and keeping
 * two copies of that in step is a losing game.
 *
 * The text is edited in a real textarea with a transparent colour, sitting on
 * top of the painted copy. That keeps the native caret, selection, undo stack
 * and screen reader behaviour, none of which a contenteditable div gets right
 * without a great deal of work.
 */

export interface Marker {
  /** One based, matching the gutter. */
  line: number;
  /** One based column of the first character of the range. */
  column: number;
  length: number;
  severity: 'error' | 'warning';
}

export interface CodeSurfaceHandle {
  /** Selects a range and scrolls it into view. */
  reveal: (line: number, column: number, length: number) => void;
  focus: () => void;
}

interface CodeSurfaceProps {
  value: string;
  onChange: (next: string) => void;
  language: DemoLanguage;
  markers?: Marker[];
  /** CSS height of the editing area. */
  height?: string;
  ariaLabel: string;
  handleRef?: RefObject<CodeSurfaceHandle | null>;
}

export function CodeSurface({
  value,
  onChange,
  language,
  markers = [],
  height,
  ariaLabel,
  handleRef
}: CodeSurfaceProps): JSX.Element {
  const input = useRef<HTMLTextAreaElement>(null);
  const paint = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [tabInserts, setTabInserts] = useState(true);

  const lines = value.split('\n');

  /** Keeps the painted copy and the gutter aligned with the textarea. */
  function syncScroll(): void {
    if (!input.current) return;
    if (paint.current) {
      paint.current.scrollTop = input.current.scrollTop;
      paint.current.scrollLeft = input.current.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = input.current.scrollTop;
  }

  useImperativeHandle(handleRef, () => ({
    focus: () => input.current?.focus(),
    reveal: (line, column, length) => {
      const area = input.current;
      if (!area) return;

      let offset = 0;
      for (let index = 0; index < line - 1; index += 1) {
        offset += (lines[index] as string).length + 1;
      }
      const start = offset + column - 1;

      area.focus();
      area.setSelectionRange(start, start + length);

      // Put the line roughly in the middle rather than at the very edge.
      const lineHeight = area.scrollHeight / Math.max(lines.length, 1);
      area.scrollTop = Math.max(0, (line - 4) * lineHeight);
      syncScroll();
    }
  }));

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Escape releases the Tab key so that the keyboard can always leave the
    // editor. Without it a textarea that swallows Tab is a focus trap.
    if (event.key === 'Escape') {
      setTabInserts(false);
      return;
    }

    if (event.key !== 'Tab') {
      setTabInserts(true);
      return;
    }
    if (!tabInserts) return;

    event.preventDefault();
    const area = event.currentTarget;
    const { selectionStart, selectionEnd } = area;
    const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd);

    onChange(next);
    requestAnimationFrame(() => area.setSelectionRange(selectionStart + 2, selectionStart + 2));
  }

  return (
    <div className="surface" style={height ? { height } : undefined}>
      <div className="surface__gutter" ref={gutter} aria-hidden="true">
        {lines.map((_, index) => {
          const here = markers.filter((marker) => marker.line === index + 1);
          const severity = here.some((marker) => marker.severity === 'error')
            ? 'error'
            : here.length > 0
              ? 'warning'
              : null;

          return (
            <div key={index} className="surface__line-number">
              {severity ? <span className={'surface__mark surface__mark--' + severity} /> : null}
              {index + 1}
            </div>
          );
        })}
      </div>

      <div className="surface__body">
        <pre className="surface__paint" ref={paint} aria-hidden="true">
          <code>
            <Painted lines={lines} language={language} markers={markers} />
          </code>
        </pre>

        <textarea
          ref={input}
          className="surface__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          aria-label={`${ariaLabel} Press Escape then Tab to leave the editor.`}
        />
      </div>
    </div>
  );
}

interface PaintedProps {
  lines: string[];
  language: DemoLanguage;
  markers: Marker[];
}

/**
 * Paints the source, underlining the ranges the markers cover.
 *
 * The whole file is rendered as one run of text with real newlines, rather
 * than one element per line, because the textarea above it lays its text out
 * that way. Anything else drifts out of alignment as soon as a scrollbar
 * appears.
 */
function Painted({ lines, language, markers }: PaintedProps): JSX.Element {
  const state = initialState();

  return (
    <>
      {lines.map((line, index) => {
        const tokens = tokenizeLine(line, language, state);
        const marks = new Array<string | null>(line.length).fill(null);

        for (const marker of markers) {
          if (marker.line !== index + 1) continue;
          const from = Math.max(0, marker.column - 1);
          const to = Math.min(line.length, from + marker.length);
          for (let at = from; at < to; at += 1) marks[at] = marker.severity;
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
