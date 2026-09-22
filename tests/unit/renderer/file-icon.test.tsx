import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  FileIcon,
  FolderIcon,
  FILE_ICON_STYLES,
  hasFileIcon,
  resolveIconStyle
} from '@renderer/components/common/FileIcon';
import { LANGUAGES } from '@renderer/editor/language-support';

/** Reads the tile colour and monogram out of a rendered icon. */
function readTile(markup: HTMLElement): { color: string | null; label: string | null } {
  return {
    color: markup.querySelector('rect')?.getAttribute('fill') ?? null,
    label: markup.querySelector('text')?.textContent ?? null
  };
}

describe('FileIcon', () => {
  it.each([
    ['app.ts', '#3178c6', 'TS'],
    ['App.tsx', '#3178c6', 'TX'],
    ['script.js', '#f0db4f', 'JS'],
    ['main.py', '#3b74a8', 'PY'],
    ['lib.rs', '#d4763a', 'RS'],
    ['server.go', '#00add8', 'GO'],
    ['index.html', '#e34c26', '<>'],
    ['styles.css', '#2965f1', '{}'],
    ['data.json', '#cbcb41', '{ }'],
    ['README.md', '#4a86c8', 'MD'],
    ['query.sql', '#dd8c00', 'SQ'],
    ['build.sh', '#4eaa25', '$_']
  ])('should give %s its own colour and monogram', (name, color, label) => {
    const { container } = render(<FileIcon path={name} />);
    expect(readTile(container)).toEqual({ color, label });
  });

  it('should resolve the language from a full path, not only the name', () => {
    const { container } = render(<FileIcon path="C:\\Users\\dev\\project\\src\\main.py" />);
    expect(readTile(container).label).toBe('PY');
  });

  it('should recognise an extensionless file by its exact name', () => {
    const { container } = render(<FileIcon path="/project/Dockerfile" />);
    expect(readTile(container)).toEqual({ color: '#2496ed', label: 'DK' });
  });

  it('should treat an unrecognised extension as plain text', () => {
    const { container } = render(<FileIcon path="mystery.qqq" />);
    expect(readTile(container).label).toBe('TT');
  });

  it('should derive a tile for a language it has never seen', () => {
    // The case an extension adding its own language would hit.
    expect(resolveIconStyle('brainfuck')).toEqual({ color: '#7d8590', label: 'BR' });
  });

  it('should still produce a label for an empty icon key', () => {
    expect(resolveIconStyle('').label).toBe('?');
  });

  it('should honour the requested size', () => {
    const { container } = render(<FileIcon path="app.ts" size={24} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('should stay hidden from assistive technology, since the name is next to it', () => {
    const { container } = render(<FileIcon path="app.ts" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('should pass through a class name', () => {
    const { container } = render(<FileIcon path="app.ts" className="explorer__icon" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('explorer__icon');
  });
});

describe('the icon set as a whole', () => {
  it('should give every tile a valid hex colour', () => {
    for (const [key, style] of Object.entries(FILE_ICON_STYLES)) {
      expect(style.color, key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('should keep every monogram short enough to stay legible', () => {
    for (const [key, style] of Object.entries(FILE_ICON_STYLES)) {
      expect(style.label.length, key).toBeGreaterThan(0);
      expect(style.label.length, key).toBeLessThanOrEqual(3);
    }
  });

  it('should choose readable text for every tile', () => {
    // A pale tile must not get white text, and a dark one must not get dark.
    for (const key of Object.keys(FILE_ICON_STYLES)) {
      const { container } = render(<FileIcon path={'sample.' + key} />);
      const rect = container.querySelector('rect');
      const text = container.querySelector('text');

      if (!rect || !text) continue;

      const hex = (rect.getAttribute('fill') ?? '#000000').replace('#', '');
      const luma =
        (0.2126 * Number.parseInt(hex.slice(0, 2), 16) +
          0.7152 * Number.parseInt(hex.slice(2, 4), 16) +
          0.0722 * Number.parseInt(hex.slice(4, 6), 16)) /
        255;
      const fill = text.getAttribute('fill') ?? '';
      const textIsLight = fill.toLowerCase() === '#ffffff';

      if (luma > 0.62) expect(textIsLight, key + ' is pale and should use dark text').toBe(false);
    }
  });

  it('should have a tile for every language the editor lists', () => {
    const missing = LANGUAGES.filter((language) => !hasFileIcon(language.icon)).map(
      (language) => language.id + ' (' + language.icon + ')'
    );

    expect(missing, 'languages without a file icon: ' + missing.join(', ')).toEqual([]);
  });

  it('should report which icon keys exist', () => {
    expect(hasFileIcon('ts')).toBe(true);
    expect(hasFileIcon('not-an-icon')).toBe(false);
  });
});

describe('FolderIcon', () => {
  it('should render a different shape when open', () => {
    const closed = render(<FolderIcon open={false} />)
      .container.querySelector('path')
      ?.getAttribute('d');
    const open = render(<FolderIcon open />)
      .container.querySelector('path')
      ?.getAttribute('d');

    expect(closed).toBeTruthy();
    expect(open).toBeTruthy();
    expect(open).not.toBe(closed);
  });

  it('should inherit the surrounding colour so it follows the theme', () => {
    const { container } = render(<FolderIcon open={false} />);
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor');
  });

  it('should stay hidden from assistive technology', () => {
    const { container } = render(<FolderIcon open />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
