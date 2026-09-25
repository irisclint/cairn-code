import type { JSX, SVGProps } from 'react';

/**
 * Line icons for the site.
 *
 * Drawn on a 24 unit grid with a 1.6 stroke so they sit at the same visual
 * weight as the Inter text around them, and they inherit `currentColor` so a
 * single icon works on every surface.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  </Svg>
);

export const Download = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  </Svg>
);

export const Lightbulb = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.2v1h6v-1c0-.4.2-.9.6-1.2A6 6 0 0 0 12 3z" />
    </>
  </Svg>
);

export const Terminal = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </>
  </Svg>
);

export const Palette = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M12 3a9 9 0 1 0 0 18 2.2 2.2 0 0 0 1.7-3.6 2.2 2.2 0 0 1 1.7-3.6H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z" />
      <circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </>
  </Svg>
);

export const Languages = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13.5 5-3 14" />
    </>
  </Svg>
);

export const Search = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  </Svg>
);

export const Shield = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M12 3l7.5 3v6c0 4.4-3 8.2-7.5 9.4C7.5 20.2 4.5 16.4 4.5 12V6L12 3z" />
      <path d="m9 12 2 2 4-4" />
    </>
  </Svg>
);

export const Bolt = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M13.5 3 5 13.5h5.5L10 21l8.5-10.5H13L13.5 3z" />
  </Svg>
);

export const Command = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z" />
  </Svg>
);

// A commit that leaves the trunk and rejoins it.
export const Branch = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M6 7.2v9.6" />
      <path d="M17 10.2c0 3.2-2.6 4.8-5.5 5.2-1.9.3-3.3 1-3.3 2.4" />
    </>
  </Svg>
);

// A beetle: breakpoints and stepping.
export const Bug = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M8.5 6a3.5 3.5 0 0 1 7 0" />
      <rect x="7.5" y="6" width="9" height="12" rx="4.5" />
      <path d="M7.5 10H4.5M7.5 14H4M7.5 17l-2.5 2M16.5 10h3M16.5 14h3.5M16.5 17l2.5 2" />
    </>
  </Svg>
);

// A piece that only fits one way, which is what a permission list is for.
export const Puzzle = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M10 3.5a2 2 0 0 1 4 0V5h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 0 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v-1.5a2 2 0 0 0-4 0V19H6.5a1 1 0 0 1-1-1v-3.5H4a2 2 0 0 1 0-4h1.5V6a1 1 0 0 1 1-1H10V3.5z" />
  </Svg>
);

/* Braces around a line: a settings file, rather than the usual cogwheel. */
export const Settings = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M9 4H7.5A2.5 2.5 0 0 0 5 6.5v3A2.5 2.5 0 0 1 2.5 12 2.5 2.5 0 0 1 5 14.5v3A2.5 2.5 0 0 0 7.5 20H9" />
      <path d="M15 4h1.5A2.5 2.5 0 0 1 19 6.5v3a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M9 12h6" />
    </>
  </Svg>
);

export const Check = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const Cross = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  </Svg>
);

export const Menu = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  </Svg>
);

export const GitHub = (props: IconProps): JSX.Element => (
  <svg
    width={props.size ?? 20}
    height={props.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
  </svg>
);

export const Windows = (props: IconProps): JSX.Element => (
  <svg
    width={props.size ?? 20}
    height={props.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M3 5.6 10.2 4.6v7H3v-6zM11.3 4.4 21 3v8.6h-9.7V4.4zM3 12.4h7.2v7L3 18.4v-6zM11.3 12.4H21V21l-9.7-1.4v-7.2z" />
  </svg>
);

export const Apple = (props: IconProps): JSX.Element => (
  <svg
    width={props.size ?? 20}
    height={props.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M16.3 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.7zM14.1 5.3c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z" />
  </svg>
);

export const Linux = (props: IconProps): JSX.Element => (
  <svg
    width={props.size ?? 20}
    height={props.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M12 2c-2.2 0-3.5 1.7-3.5 4.2 0 1.3.2 2 .2 2.8 0 .9-1 2-1.8 3.4-.8 1.4-1.6 2.6-2.3 3.3-.6.6-.8 1.3-.4 1.8.3.4.9.5 1.5.4.3.6.9 1.1 1.8 1.3 1.2.3 2.6 0 3.3-.6h2.4c.7.6 2.1.9 3.3.6.9-.2 1.5-.7 1.8-1.3.6.1 1.2 0 1.5-.4.4-.5.2-1.2-.4-1.8-.7-.7-1.5-1.9-2.3-3.3-.8-1.4-1.8-2.5-1.8-3.4 0-.8.2-1.5.2-2.8C15.5 3.7 14.2 2 12 2zm-1.6 3.1c.4 0 .8.5.8 1.1s-.4 1.1-.8 1.1-.8-.5-.8-1.1.4-1.1.8-1.1zm3.2 0c.4 0 .8.5.8 1.1s-.4 1.1-.8 1.1-.8-.5-.8-1.1.4-1.1.8-1.1zM12 8.4c.9 0 1.9.5 1.9 1 0 .3-.3.5-.7.8-.4.2-.8.5-1.2.5s-.8-.3-1.2-.5c-.4-.3-.7-.5-.7-.8 0-.5 1-1 1.9-1z" />
  </svg>
);
