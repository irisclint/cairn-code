import * as monaco from 'monaco-editor';
import type { SourceBreakpoint } from '@shared/types';

/**
 * Breakpoints in the editor's glyph margin.
 *
 * Setting one is a click in the strip left of the line numbers, which is the
 * gesture every editor uses, so nobody has to be told about it. The
 * decorations are rebuilt from the store rather than tracked here, so the
 * gutter and the Run and Debug panel can never disagree about what is set.
 */

/** Attaches the click handler. Returns a disposer. */
export function attachBreakpointMargin(
  editor: monaco.editor.IStandaloneCodeEditor,
  onToggle: (line: number) => void
): monaco.IDisposable {
  return editor.onMouseDown((event) => {
    if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;

    const line = event.target.position?.lineNumber;
    if (typeof line === 'number') onToggle(line);
  });
}

/**
 * Replaces the breakpoint decorations on a model.
 *
 * Returns the new decoration ids so the caller can hand them back next time.
 * Monaco needs the previous ids to know what to remove; keeping them outside
 * this function is what lets one editor instance swap between models without
 * leaving another file's breakpoints drawn on this one.
 */
export function renderBreakpoints(
  editor: monaco.editor.IStandaloneCodeEditor,
  previous: string[],
  breakpoints: SourceBreakpoint[]
): string[] {
  const decorations = breakpoints.map(
    (point): monaco.editor.IModelDeltaDecoration => ({
      range: new monaco.Range(point.line, 1, point.line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: point.condition ? 'breakpoint breakpoint--conditional' : 'breakpoint',
        glyphMarginHoverMessage: {
          value: point.condition
            ? `Breakpoint, only when \`${point.condition}\``
            : 'Breakpoint. Click to remove.'
        },
        // Survives edits above it, so inserting a line moves the breakpoint
        // with the code rather than leaving it on whatever ends up there.
        stickiness: monaco.editor.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter
      }
    })
  );

  return editor.deltaDecorations(previous, decorations);
}
