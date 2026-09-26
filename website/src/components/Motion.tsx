import { Fragment, useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';

/**
 * The motion primitives the site is built from.
 *
 * Written by hand rather than pulled from an animation library: between them
 * they are a few kilobytes, where a library and its transitive tree would be
 * two orders of magnitude more for effects this small.
 *
 * Every one of them checks prefers-reduced-motion and renders the finished
 * state when it is set. Motion here is decoration, so someone who has asked
 * the operating system for less of it loses nothing but the movement.
 */

/** True when the visitor has asked for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Fires once when the element first scrolls into view. */
function useInView<T extends HTMLElement>(margin = '0px 0px -12% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;

    if (typeof IntersectionObserver !== 'function') {
      setSeen(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, seen]);

  return [ref, seen];
}

/* -------------------------------------------------------------------------- */
/* Dot field                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A grid of dots that lean towards the pointer.
 *
 * Drawn on a canvas because a few hundred DOM nodes that each move on every
 * pointer event is the reliable way to make a page feel heavy. The loop only
 * runs while there is something left to settle, so an untouched page costs
 * nothing after the first paint.
 */
export function DotField({ className }: { className?: string }): JSX.Element | null {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    const SPACING = 26;
    const RADIUS = 1.1;
    const REACH = 130;

    let width = 0;
    let height = 0;
    let pointer = { x: -9999, y: -9999 };
    let strength = 0;
    let frame = 0;

    function resize(): void {
      if (!element) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const box = element.getBoundingClientRect();
      width = box.width;
      height = box.height;
      element.width = Math.floor(width * ratio);
      element.height = Math.floor(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }

    function draw(): void {
      if (!context) return;
      context.clearRect(0, 0, width, height);

      for (let x = SPACING / 2; x < width; x += SPACING) {
        for (let y = SPACING / 2; y < height; y += SPACING) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          const pull = distance < REACH ? (1 - distance / REACH) * strength : 0;

          // Dots nearest the pointer brighten and drift a little towards it,
          // which reads as the surface noticing rather than reacting.
          const offset = pull * 3;
          const angle = Math.atan2(dy, dx);
          const px = x - Math.cos(angle) * offset;
          const py = y - Math.sin(angle) * offset;

          context.beginPath();
          context.arc(px, py, RADIUS + pull * 0.9, 0, Math.PI * 2);
          context.fillStyle = `rgba(122, 140, 180, ${0.1 + pull * 0.45})`;
          context.fill();
        }
      }
    }

    function tick(): void {
      frame = 0;
      draw();
      // Keep animating only while the highlight is still fading in or out.
      if (strength > 0.01 && strength < 0.99) frame = requestAnimationFrame(tick);
    }

    function schedule(): void {
      if (frame === 0) frame = requestAnimationFrame(tick);
    }

    function onMove(event: PointerEvent): void {
      if (!element) return;
      const box = element.getBoundingClientRect();
      pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      strength = 1;
      schedule();
    }

    function onLeave(): void {
      strength = 0;
      pointer = { x: -9999, y: -9999 };
      schedule();
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={canvas} className={'dot-field ' + (className ?? '')} aria-hidden="true" />;
}

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

interface SplitTextProps {
  text: string;
  className?: string;
  /** Milliseconds between two words. */
  stagger?: number;
  delay?: number;
}

/**
 * Reveals a line word by word.
 *
 * The words are real text in the document, so the headline is selectable and
 * readable by a crawler whether or not the animation ever runs.
 */
interface ScrollSplitProps {
  text: string;
  className?: string;
  stagger?: number;
  /** The element to render, so a heading stays a heading. */
  as?: 'span' | 'h2' | 'h3';
}

export function SplitText({ text, className, stagger = 55, delay = 0 }: SplitTextProps): JSX.Element {
  const reduced = useReducedMotion();
  const words = text.split(' ');

  return (
    <span className={className}>
      {words.map((word, index) => (
        // The separating space is a text node between the inline-blocks, not
        // inside one. Trailing whitespace within an inline-block is trimmed,
        // which runs every word of the headline together.
        <Fragment key={`${word}-${index}`}>
          <span className="split-word">
            <span
              className={reduced ? undefined : 'split-word__inner'}
              style={
                reduced ? undefined : ({ animationDelay: `${delay + index * stagger}ms` } as CSSProperties)
              }
            >
              {word}
            </span>
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Reveals a line word by word, but only once it is on screen.
 *
 * SplitText starts on mount, which is right for the headline and wrong for
 * every heading below the fold: those finish animating while the reader is
 * still three screens above them, so the effect is paid for and never seen.
 * This waits for the heading to arrive and then runs the same motion.
 */
export function ScrollSplit({ text, className, stagger = 42, as = 'span' }: ScrollSplitProps): JSX.Element {
  const [ref, seen] = useInView<HTMLElement>('0px 0px -8% 0px');
  const reduced = useReducedMotion();
  const words = text.split(' ');
  const Tag = as;

  return (
    <Tag className={className} ref={ref as never}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="split-word">
            <span
              className={reduced || !seen ? undefined : 'split-word__inner'}
              style={
                reduced || !seen
                  ? undefined
                  : ({ animationDelay: `${index * stagger}ms` } as CSSProperties)
              }
            >
              {word}
            </span>
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  );
}

interface CountUpProps {
  value: number;
  /** Rendered instead of the number when the value is not numeric. */
  suffix?: string;
  duration?: number;
}

/** Counts from zero to the value the first time it scrolls into view. */
export function CountUp({ value, suffix = '', duration = 900 }: CountUpProps): JSX.Element {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!seen || reduced) return;

    let frame = 0;
    const started = performance.now();

    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration);
      // Ease out cubic, so the last digits settle rather than snap.
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, reduced, value, duration]);

  return (
    <span ref={ref}>
      {reduced || !seen ? value : shown}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Containers                                                                  */
/* -------------------------------------------------------------------------- */

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}

/** Fades and lifts its children in when they first reach the viewport. */
export function Reveal({ children, className, delay = 0, as = 'div' }: RevealProps): JSX.Element {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const Tag = as;

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={[className, reduced ? undefined : 'reveal', seen ? 'reveal--in' : undefined]
        .filter(Boolean)
        .join(' ')}
      style={reduced ? undefined : ({ transitionDelay: `${delay}ms` } as CSSProperties)}
    >
      {children}
    </Tag>
  );
}

/**
 * A card that lights up where the pointer is.
 *
 * The position is written to two custom properties and the glow is a gradient
 * in CSS, so moving the pointer never touches the React tree.
 */
export function SpotlightCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  function onMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (reduced || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
    ref.current.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
  }

  return (
    <div ref={ref} className={['spotlight', className].filter(Boolean).join(' ')} onPointerMove={onMove}>
      {children}
    </div>
  );
}

/** Pulls gently towards the pointer while it is nearby. */
export function Magnetic({
  children,
  strength = 0.25
}: {
  children: ReactNode;
  strength?: number;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  function onMove(event: React.PointerEvent<HTMLSpanElement>): void {
    if (reduced || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) * strength;
    const y = (event.clientY - (box.top + box.height / 2)) * strength;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  }

  function reset(): void {
    if (ref.current) ref.current.style.transform = '';
  }

  return (
    <span ref={ref} className="magnetic" onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </span>
  );
}
