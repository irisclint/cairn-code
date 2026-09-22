import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

export interface ResizerProps {
  orientation: 'vertical' | 'horizontal';
  /** Current size in pixels, used as the starting point of a drag. */
  size: number;
  onResize: (size: number) => void;
  /** Inverts the drag direction, needed for panels that grow upwards. */
  invert?: boolean;
  ariaLabel: string;
  min?: number;
  max?: number;
}

/**
 * Draggable splitter between two workbench regions.
 *
 * Pointer capture is used instead of window listeners so a fast drag that
 * leaves the element still delivers its move events, and the handle stays
 * keyboard operable through the arrow keys for accessibility.
 */
export function Resizer({
  orientation,
  size,
  onResize,
  invert = false,
  ariaLabel,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
}: ResizerProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef({ position: 0, size: 0 });

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      startRef.current = {
        position: orientation === 'vertical' ? event.clientX : event.clientY,
        size
      };
      setIsDragging(true);
    },
    [orientation, size]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const current = orientation === 'vertical' ? event.clientX : event.clientY;
      const delta = (current - startRef.current.position) * (invert ? -1 : 1);
      onResize(startRef.current.size + delta);
    },
    [isDragging, orientation, invert, onResize]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 40 : 8;
      const decrease = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
      const increase = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';

      if (event.key === decrease) {
        event.preventDefault();
        onResize(size + (invert ? step : -step));
      } else if (event.key === increase) {
        event.preventDefault();
        onResize(size + (invert ? -step : step));
      }
    },
    [orientation, invert, onResize, size]
  );

  useEffect(() => {
    if (!isDragging) return undefined;
    // Prevents the editor and terminal from selecting text mid-drag.
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [isDragging]);

  return (
    <div
      className={'resizer resizer--' + orientation + (isDragging ? ' resizer--dragging' : '')}
      role="separator"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    />
  );
}
