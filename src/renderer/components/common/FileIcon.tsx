import type { JSX } from 'react';
import { detectLanguage } from '../../editor/language-support';

/**
 * File type icons.
 *
 * Each language gets a rounded tile in its own colour carrying a short
 * monogram. The alternative, one scraped vendor logo per language, falls apart
 * at 16px where most of them turn to mush, and it never covers the long tail.
 * A monogram stays legible at every size, reads as one designed set rather than
 * a grab-bag, and gives an unfamiliar language the same treatment as a
 * familiar one.
 *
 * Colours follow the conventional identity of each language so the tile is
 * recognisable before the letters are readable: Python blue, Rust orange, Go
 * cyan, and so on.
 */

interface IconStyle {
  /** Tile colour. */
  color: string;
  /** One to three characters. Two reads best at 16px. */
  label: string;
  /** Overrides the automatic light or dark text choice. */
  textColor?: string;
}

/** Keyed by the `icon` field of the language table. */
const STYLES: Record<string, IconStyle> = {
  ts: { color: '#3178c6', label: 'TS' },
  tsx: { color: '#3178c6', label: 'TX' },
  js: { color: '#f0db4f', label: 'JS', textColor: '#20201a' },
  jsx: { color: '#f0db4f', label: 'JX', textColor: '#20201a' },
  py: { color: '#3b74a8', label: 'PY' },
  java: { color: '#e35a2b', label: 'JV' },
  cs: { color: '#68217a', label: 'C#' },
  cpp: { color: '#0089d6', label: '++' },
  c: { color: '#5a7fb5', label: 'C' },
  go: { color: '#00add8', label: 'GO', textColor: '#062b33' },
  rs: { color: '#d4763a', label: 'RS' },
  rb: { color: '#cc342d', label: 'RB' },
  php: { color: '#7b7fb5', label: 'PH' },
  swift: { color: '#f05138', label: 'SW' },
  kt: { color: '#a97bff', label: 'KT' },
  scala: { color: '#dc322f', label: 'SC' },
  dart: { color: '#00b4ab', label: 'DT', textColor: '#032b29' },
  lua: { color: '#000080', label: 'LU' },
  pl: { color: '#0298c3', label: 'PL' },
  r: { color: '#1f65b7', label: 'R' },
  jl: { color: '#9558b2', label: 'JL' },
  ex: { color: '#6e4a7e', label: 'EX' },
  erl: { color: '#b83998', label: 'ER' },
  clj: { color: '#5881d8', label: 'CJ' },
  hs: { color: '#5e5086', label: 'HS' },
  fs: { color: '#378bba', label: 'F#' },
  ml: { color: '#ec6813', label: 'ML' },
  objc: { color: '#438eff', label: 'OC' },
  vb: { color: '#4f74c8', label: 'VB' },
  pas: { color: '#e3f171', label: 'PA', textColor: '#2a2d15' },
  zig: { color: '#ec915c', label: 'ZG', textColor: '#2e1c0f' },
  nim: { color: '#ffc200', label: 'NM', textColor: '#2b2100' },
  cr: { color: '#d0d0d0', label: 'CR', textColor: '#1c1c1c' },
  sol: { color: '#aa6746', label: 'SL' },
  groovy: { color: '#4298b8', label: 'GR' },

  html: { color: '#e34c26', label: '<>' },
  css: { color: '#2965f1', label: '{}' },
  scss: { color: '#c76395', label: 'SA' },
  less: { color: '#2b4c80', label: 'LE' },
  vue: { color: '#41b883', label: 'VU', textColor: '#08291c' },
  svelte: { color: '#ff3e00', label: 'SV' },
  astro: { color: '#c026d3', label: 'AS' },
  hbs: { color: '#f0772b', label: 'HB' },
  pug: { color: '#a86454', label: 'PG' },
  xml: { color: '#8a9a5b', label: 'XM' },

  json: { color: '#cbcb41', label: '{ }', textColor: '#26260c' },
  yaml: { color: '#cb4b16', label: 'YM' },
  toml: { color: '#9c4221', label: 'TM' },
  ini: { color: '#6d8086', label: 'IN' },
  md: { color: '#4a86c8', label: 'MD' },
  rst: { color: '#6d8086', label: 'RS' },
  tex: { color: '#3d6117', label: 'TX' },
  csv: { color: '#237346', label: 'CS' },

  sh: { color: '#4eaa25', label: '$_', textColor: '#06210b' },
  ps1: { color: '#0d5a9c', label: 'PS' },
  bat: { color: '#4f7942', label: 'BT' },
  docker: { color: '#2496ed', label: 'DK' },
  make: { color: '#9a7a4f', label: 'MK' },
  cmake: { color: '#0e8a16', label: 'CM' },
  tf: { color: '#7b42bc', label: 'TF' },
  hcl: { color: '#7b42bc', label: 'HC' },
  graphql: { color: '#e10098', label: 'GQ' },
  sql: { color: '#dd8c00', label: 'SQ', textColor: '#2b1c00' },
  proto: { color: '#5a7fb5', label: 'PB' },
  diff: { color: '#6d8086', label: '+-' },
  git: { color: '#f14e32', label: 'GT' },
  env: { color: '#c9a227', label: 'EN', textColor: '#2a2205' },
  log: { color: '#6d8086', label: 'LG' },
  txt: { color: '#7d8590', label: 'TT' }
};

/** Neutral tile colour for a language with no entry above. */
const FALLBACK_COLOR = '#7d8590';

/**
 * Resolves the tile for an icon key.
 *
 * A language registered at runtime by an extension will not be in the table,
 * so the fallback derives a monogram from the key itself. That keeps the set
 * complete without anyone having to add an entry before a new language looks
 * right.
 */
export function resolveIconStyle(iconKey: string): IconStyle {
  const known = STYLES[iconKey];
  if (known) return known;

  return {
    color: FALLBACK_COLOR,
    label: iconKey.slice(0, 2).toUpperCase() || '?'
  };
}

/** Picks readable text for a tile, using the relative luminance of its colour. */
function textColorFor(style: IconStyle): string {
  if (style.textColor) return style.textColor;

  const hex = style.color.replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;

  // Rec. 709 luma, good enough to choose between two text colours.
  const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luma > 0.6 ? '#1c2024' : '#ffffff';
}

export interface FileIconProps {
  /** File path or name; the language is detected from it. */
  path: string;
  size?: number;
  className?: string;
}

/**
 * Renders the icon for a file.
 *
 * A language with no entry in the table still gets a tile, with a monogram
 * derived from its icon key, so an extension that adds a language does not have
 * to touch this file to look right.
 */
export function FileIcon({ path, size = 16, className }: FileIconProps): JSX.Element {
  const style = resolveIconStyle(detectLanguage(path).icon);

  // Sized so the monogram still resolves at 15px in the explorer, which is
  // the smallest place these appear.
  const fontSize = style.label.length >= 3 ? 6 : style.label.length === 1 ? 9 : 7.6;

  return (
    <svg
      className={['file-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.4" fill={style.color} />
      <text
        x="8"
        y="8.6"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColorFor(style)}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
        letterSpacing="-0.35"
      >
        {style.label}
      </text>
    </svg>
  );
}

/** Exposed for tests and for the icon documentation. */
export const FILE_ICON_STYLES = STYLES;

/** True when a dedicated tile exists for this icon key. */
export function hasFileIcon(iconKey: string): boolean {
  return iconKey in STYLES;
}

/** Icon for a folder, open or closed. */
export function FolderIcon({
  open,
  size = 16,
  className
}: {
  open: boolean;
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      className={['folder-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {open ? (
        <path
          d="M1.75 12.6V3.4h3.7l1.3 1.7h5.5v1.6H4.6L2.4 12.6h-.65z M3.3 12.6l2-5.3h9.05l-2 5.3H3.3z"
          fill="currentColor"
          fillOpacity="0.9"
        />
      ) : (
        <path d="M1.75 3.4h3.7l1.3 1.7h7.5v7.5h-12.5V3.4z" fill="currentColor" fillOpacity="0.9" />
      )}
    </svg>
  );
}
