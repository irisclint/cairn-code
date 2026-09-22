import type { JSX } from 'react';

/**
 * The cairn-code icon set.
 *
 * Icons are inline SVG paths on a 16x16 grid and inherit `currentColor`, so a
 * theme change recolours them with no extra work and there is no icon font or
 * sprite sheet to load before first paint.
 */
const PATHS: Record<string, string> = {
  explorer: 'M2 3h4.5l1.5 2H14v8H2V3zm1 1v8h10V6H7.5L6 4H3z',
  search:
    'M10.5 9h-.8l-.3-.3A4.5 4.5 0 1 0 8.6 9.7l.3.3v.8l3.5 3.5 1-1L10.5 9zm-4 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  'source-control':
    'M11.5 3a2 2 0 0 0-1 3.7V7a1.5 1.5 0 0 1-1.5 1.5H7A2 2 0 0 0 5.5 9V6.7a2 2 0 1 0-1 0v2.6a2 2 0 1 0 1 0V9A.5.5 0 0 1 6 9h3A2.5 2.5 0 0 0 11.5 6.5v-.8A2 2 0 0 0 11.5 3z',
  debug:
    'M8 2a3 3 0 0 1 2.8 2H12l1 1-1.2.6c.1.3.2.7.2 1.1V8h2v1h-2v.3c0 .4-.1.8-.2 1.1L13 11l-1 1h-1.2A3 3 0 0 1 5.2 12H4l-1-1 1.2-.6A4 4 0 0 1 4 9.3V9H2V8h2v-.3c0-.4.1-.8.2-1.1L3 6l1-1h1.2A3 3 0 0 1 8 2z',
  extensions: 'M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm8 0h2v2h2v2h-2v2h-2v-2H9v-2h2V9z',
  settings:
    'M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5zm0 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM13.4 8c0-.3 0-.6-.1-.9l1.3-1-1.3-2.2-1.5.6a5 5 0 0 0-1.6-.9L10 2H6l-.2 1.6c-.6.2-1.1.5-1.6.9l-1.5-.6L1.4 6.1l1.3 1a5.3 5.3 0 0 0 0 1.8l-1.3 1 1.3 2.2 1.5-.6c.5.4 1 .7 1.6.9L6 14h4l.2-1.6c.6-.2 1.1-.5 1.6-.9l1.5.6 1.3-2.2-1.3-1c.1-.3.1-.6.1-.9z',
  problems: 'M8 1.5 1 14h14L8 1.5zm0 3L12.8 13H3.2L8 4.5zM7.4 7h1.2v3H7.4V7zm0 4h1.2v1.2H7.4V11z',
  terminal: 'M2 3h12v10H2V3zm1 1v8h10V4H3zm1.5 1.5L7 8l-2.5 2.5-.7-.7L5.6 8 3.8 6.2l.7-.7zM8 10h4v1H8v-1z',
  output: 'M2 3h12v10H2V3zm1 1v8h10V4H3zm1 1.5h8v1H4v-1zm0 2.5h8v1H4V8zm0 2.5h5v1H4v-1z',
  close: 'M8 8.7 4.5 12.2l-.7-.7L7.3 8 3.8 4.5l.7-.7L8 7.3l3.5-3.5.7.7L8.7 8l3.5 3.5-.7.7L8 8.7z',
  'chevron-right': 'M6 3.5 10.5 8 6 12.5l-.7-.7L9.1 8 5.3 4.2l.7-.7z',
  'chevron-down': 'M3.5 6 8 10.5 12.5 6l-.7-.7L8 9.1 4.2 5.3l-.7.7z',
  'chevron-up': 'M8 5.5 3.5 10l.7.7L8 6.9l3.8 3.8.7-.7L8 5.5z',
  file: 'M4 1.5h5L12.5 5v9.5h-9V1.5zm1 1v11h7V6H8.5V2.5H5zm4.5.2V5h2.3L9.5 2.7z',
  folder: 'M1.5 3h4.2l1.4 1.8H14.5v8.2h-13V3zm1 1v7.9h11V5.8H6.6L5.2 4H2.5z',
  'folder-open': 'M1.5 3h4.2l1.4 1.8h6.4v1.7h1.3L13 13H1.5V3zm1 1v7.5l1.5-5h9V5.8H6.6L5.2 4H2.5z',
  add: 'M7.5 3h1v4.5H13v1H8.5V13h-1V8.5H3v-1h4.5V3z',
  minus: 'M3 7.5h10v1H3v-1z',
  check: 'M6.3 11.4 3 8.1l.8-.8 2.5 2.5 5.9-5.9.8.8-6.7 6.7z',
  // A commit on a branch that leaves the trunk and comes back.
  branch:
    'M4.5 2a2 2 0 0 1 .5 3.9v1.2c.5-.4 1.2-.6 2-.6h1A1.5 1.5 0 0 0 9.5 5V4.9a2 2 0 1 1 1 0V5A2.5 2.5 0 0 1 8 7.5H7c-1 0-2 .5-2 1.4v1.2a2 2 0 1 1-1 0V5.9A2 2 0 0 1 4.5 2zm0 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-6 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  // An arrow curving back on itself: undo what is in the working tree.
  discard:
    'M8 3a5 5 0 1 1-4.7 6.6l1-.3A4 4 0 1 0 8 4a4 4 0 0 0-3 1.4h1.9v1H3.2V3.1h1v1.6A5 5 0 0 1 8 3z',
  'new-file': 'M4 1.5h5L12.5 5v3h-1V6H8.5V2.5H5v11h4v1H4V1.5zM12 9.5h1V12h2.5v1H13v2.5h-1V13H9.5v-1H12V9.5z',
  'new-folder':
    'M1.5 3h4.2l1.4 1.8h4.4v2h-1V5.8H6.6L5.2 4H2.5v7.9H8v1H1.5V3zm10 4.5h1V10H15v1h-2.5v2.5h-1V11H9v-1h2.5V7.5z',
  refresh:
    'M8 3a5 5 0 0 1 4.6 3h-1.2A3.9 3.9 0 0 0 4.1 7.5H6L3.5 10.5 1 7.5h2A5 5 0 0 1 8 3zm0 10a5 5 0 0 1-4.6-3h1.2a3.9 3.9 0 0 0 7.3-1.5H10l2.5-3L15 8.5h-2A5 5 0 0 1 8 13z',
  save: 'M2.5 2.5h9L14 5v8.5h-12v-11zm1 1v9h9V5.5L11 3.5H10V7H5V3.5H3.5zm2.5 0V6h3V3.5H6zM5 9h6v3.5H5V9z',
  error: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm.6 9H7.4V9.8h1.2V11zm0-2.2H7.4V4.5h1.2v4.3z',
  warning: 'M8 2 1 14h14L8 2zm.6 9.5H7.4v-1.2h1.2v1.2zm0-2.2H7.4V6h1.2v3.3z',
  info: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm.6 9.5H7.4V7.2h1.2v4.3zm0-5.3H7.4V5h1.2v1.2z',
  success: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm-1 8.8L4.5 8.3l.8-.8L7 9.2l3.7-3.7.8.8L7 10.8z',
  lightbulb:
    'M8 1.5A4 4 0 0 0 5.6 8.7c.3.3.4.6.4.9v.4h4v-.4c0-.3.1-.6.4-.9A4 4 0 0 0 8 1.5zM6 11h4v1H6v-1zm.5 2h3l-.7 1h-1.6l-.7-1z',
  'split-horizontal': 'M2 3h12v10H2V3zm1 1v3.5h10V4H3zm0 4.5V12h10V8.5H3z',
  more: 'M4 8a1.2 1.2 0 1 1-2.4 0A1.2 1.2 0 0 1 4 8zm5.2 0a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0zm5.2 0a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z',
  'window-minimize': 'M2 7.5h12v1H2v-1z',
  'window-maximize': 'M3 3h10v10H3V3zm1 1v8h8V4H4z',
  'window-restore': 'M5 3h8v8h-2v2H3V5h2V3zm1 1v1h6v5h1V4H6zM4 6v6h6V6H4z',
  'window-close': 'M8 8.7 4.5 12.2l-.7-.7L7.3 8 3.8 4.5l.7-.7L8 7.3l3.5-3.5.7.7L8.7 8l3.5 3.5-.7.7L8 8.7z',
  // Three stacked stones, widest at the base: the cairn-code mark.
  logo: 'M3.1 10.8h9.8a1.4 1.4 0 0 1 0 2.8H3.1a1.4 1.4 0 0 1 0-2.8zm1.2-4h7.4a1.35 1.35 0 0 1 0 2.7H4.3a1.35 1.35 0 0 1 0-2.7zm1.6-4.3 4.5-.5a1.3 1.3 0 0 1 .3 2.6l-4.5.5a1.3 1.3 0 0 1-.3-2.6z'
};

export type IconName = keyof typeof PATHS | string;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, className, title }: IconProps): JSX.Element | null {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      className={['cairn-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

/** True when the icon set contains a glyph for this name. */
export function hasIcon(name: string): boolean {
  return name in PATHS;
}
