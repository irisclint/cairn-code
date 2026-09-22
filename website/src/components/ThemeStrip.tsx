import { useState, type JSX } from 'react';

/**
 * Theme swatches.
 *
 * Each card paints a miniature of the workbench in that theme's real colours,
 * taken from the theme files the editor ships. Selecting one is the same
 * gesture as the picker inside the editor, so the site teaches the interface a
 * little before it is installed.
 */

interface ThemePreview {
  id: string;
  name: string;
  kind: string;
  bg: string;
  alt: string;
  deep: string;
  accent: string;
  fg: string;
  keyword: string;
  string: string;
  fn: string;
}

const THEMES: ThemePreview[] = [
  {
    id: 'dark-modern',
    name: 'Dark Modern',
    kind: 'Dark',
    bg: '#1a1b26',
    alt: '#16161e',
    deep: '#13131a',
    accent: '#3b82f6',
    fg: '#c8d0e0',
    keyword: '#8b5cf6',
    string: '#9ece6a',
    fn: '#7aa2f7'
  },
  {
    id: 'midnight-violet',
    name: 'Midnight Violet',
    kind: 'Dark',
    bg: '#17141f',
    alt: '#131020',
    deep: '#0f0d1a',
    accent: '#a855f7',
    fg: '#d6d0e8',
    keyword: '#c084fc',
    string: '#86efac',
    fn: '#60a5fa'
  },
  {
    id: 'nordic',
    name: 'Nordic',
    kind: 'Dark',
    bg: '#2e3440',
    alt: '#2b303b',
    deep: '#272c36',
    accent: '#5e81ac',
    fg: '#d8dee9',
    keyword: '#81a1c1',
    string: '#a3be8c',
    fn: '#88c0d0'
  },
  {
    id: 'oceanic',
    name: 'Oceanic',
    kind: 'Dark',
    bg: '#0f1c2e',
    alt: '#0c1826',
    deep: '#09131f',
    accent: '#22d3ee',
    fg: '#c3d0e0',
    keyword: '#22d3ee',
    string: '#7ee787',
    fn: '#79c0ff'
  },
  {
    id: 'forest',
    name: 'Forest',
    kind: 'Dark',
    bg: '#12211a',
    alt: '#0e1b15',
    deep: '#0a1611',
    accent: '#4ade80',
    fg: '#c5d8cb',
    keyword: '#6ee7b7',
    string: '#fcd34d',
    fn: '#7dd3fc'
  },
  {
    id: 'crimson',
    name: 'Crimson',
    kind: 'Dark',
    bg: '#1a1416',
    alt: '#161012',
    deep: '#120d0f',
    accent: '#e11d48',
    fg: '#e0d2d5',
    keyword: '#fb7185',
    string: '#fcd34d',
    fn: '#f9a8d4'
  },
  {
    id: 'solar-dusk',
    name: 'Solar Dusk',
    kind: 'Dark',
    bg: '#002b36',
    alt: '#01252e',
    deep: '#011f27',
    accent: '#b58900',
    fg: '#93a1a1',
    keyword: '#859900',
    string: '#2aa198',
    fn: '#268bd2'
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    kind: 'Dark',
    bg: '#161616',
    alt: '#121212',
    deep: '#0e0e0e',
    accent: '#8a8a8a',
    fg: '#d4d4d4',
    keyword: '#ffffff',
    string: '#b8b8b8',
    fn: '#e8e8e8'
  },
  {
    id: 'light-modern',
    name: 'Light Modern',
    kind: 'Light',
    bg: '#ffffff',
    alt: '#f5f6f8',
    deep: '#eceef2',
    accent: '#2563eb',
    fg: '#24283b',
    keyword: '#7c3aed',
    string: '#0f7b3f',
    fn: '#1d4ed8'
  },
  {
    id: 'solar-dawn',
    name: 'Solar Dawn',
    kind: 'Light',
    bg: '#fdf6e3',
    alt: '#f5eed8',
    deep: '#eee8d5',
    accent: '#b58900',
    fg: '#586e75',
    keyword: '#859900',
    string: '#2aa198',
    fn: '#268bd2'
  },
  {
    id: 'high-contrast-dark',
    name: 'High Contrast Dark',
    kind: 'Accessible',
    bg: '#000000',
    alt: '#000000',
    deep: '#000000',
    accent: '#1aebff',
    fg: '#ffffff',
    keyword: '#1aebff',
    string: '#3ff23f',
    fn: '#ffff00'
  },
  {
    id: 'high-contrast-light',
    name: 'High Contrast Light',
    kind: 'Accessible',
    bg: '#ffffff',
    alt: '#ffffff',
    deep: '#ffffff',
    accent: '#0f4a85',
    fg: '#000000',
    keyword: '#0f4a85',
    string: '#0a6b28',
    fn: '#6a1b9a'
  }
];

export function ThemeStrip(): JSX.Element {
  const [active, setActive] = useState(THEMES[0]?.id ?? 'dark-modern');
  const current = THEMES.find((theme) => theme.id === active) ?? (THEMES[0] as ThemePreview);

  return (
    <div className="themes">
      <div className="themes__stage">
        <div className="themes__window" style={{ background: current.bg, borderColor: current.deep }}>
          <div className="themes__chrome" style={{ background: current.deep }}>
            <span className="themes__chrome-name" style={{ color: current.fg, opacity: 0.6 }}>
              {current.name}
            </span>
          </div>

          <div className="themes__body">
            <div className="themes__rail" style={{ background: current.deep }}>
              <span style={{ background: current.accent }} />
              <span style={{ background: current.fg, opacity: 0.22 }} />
              <span style={{ background: current.fg, opacity: 0.22 }} />
            </div>

            <div className="themes__side" style={{ background: current.alt }}>
              {[70, 52, 60, 44, 66].map((width, index) => (
                <span
                  key={index}
                  style={{
                    width: width + '%',
                    background: current.fg,
                    opacity: index === 1 ? 0.75 : 0.26
                  }}
                />
              ))}
            </div>

            <pre className="themes__code" style={{ color: current.fg }}>
              <code>
                <span style={{ color: current.keyword }}>export function</span>{' '}
                <span style={{ color: current.fn }}>total</span>
                {'(items) {\n  '}
                <span style={{ color: current.keyword }}>return</span>
                {' items.'}
                <span style={{ color: current.fn }}>reduce</span>
                {'((sum, item) =>\n    sum + item.price, '}
                <span style={{ color: current.string }}>0</span>
                {');\n}'}
              </code>
            </pre>
          </div>

          <div className="themes__status" style={{ background: current.accent }} />
        </div>
      </div>

      <div className="themes__picker" role="radiogroup" aria-label="Preview a theme">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={theme.id === active}
            className={'themes__swatch' + (theme.id === active ? ' themes__swatch--active' : '')}
            onClick={() => setActive(theme.id)}
            onMouseEnter={() => setActive(theme.id)}
            onFocus={() => setActive(theme.id)}
          >
            <span className="themes__swatch-chip" style={{ background: theme.bg }}>
              <span style={{ background: theme.accent }} />
              <span style={{ background: theme.keyword }} />
              <span style={{ background: theme.string }} />
            </span>
            <span className="themes__swatch-name">{theme.name}</span>
            <span className="themes__swatch-kind">{theme.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
