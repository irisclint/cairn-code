import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';

export interface QuickPickItem {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  /** Indices into `label` that matched the query, for highlighting. */
  matchIndices?: number[];
  /** Right-aligned text, used for keybindings. */
  trailing?: string;
}

export interface QuickPickDialogProps {
  title: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  items: QuickPickItem[];
  onAccept: (item: QuickPickItem) => void;
  onClose: () => void;
  /** Called as the highlighted item changes, used for live theme previews. */
  onHighlight?: (item: QuickPickItem | null) => void;
  emptyMessage?: string;
  footer?: ReactNode;
}

/** Renders a label with the fuzzy-matched characters emphasised. */
function HighlightedLabel({ label, indices }: { label: string; indices?: number[] }): JSX.Element {
  if (!indices || indices.length === 0) return <>{label}</>;

  const marked = new Set(indices);
  return (
    <>
      {[...label].map((character, index) =>
        marked.has(index) ? (
          <mark key={index} className="quick-pick__highlight">
            {character}
          </mark>
        ) : (
          <span key={index}>{character}</span>
        )
      )}
    </>
  );
}

/**
 * The shared dropdown used by the Command Palette, Quick Open and the theme
 * picker.
 *
 * Keeping one implementation means keyboard handling, focus trapping and
 * scrolling behave identically everywhere, and a fix applies to all three.
 */
export function QuickPickDialog({
  title,
  placeholder,
  query,
  onQueryChange,
  items,
  onAccept,
  onClose,
  onHighlight,
  emptyMessage = 'No matching results',
  footer
}: QuickPickDialogProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items.length]);

  useEffect(() => {
    onHighlight?.(items[activeIndex] ?? null);
  }, [activeIndex, items, onHighlight]);

  /* Keeps the highlighted row inside the scroll viewport. */
  useEffect(() => {
    const list = listRef.current;
    const active = list?.children[activeIndex];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (items.length === 0 ? 0 : (index + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) onAccept(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(items.length - 1, 0));
    }
  };

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="quick-pick"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-pick__input"
          placeholder={placeholder}
          aria-label={title}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="quick-pick-list"
          aria-activedescendant={items[activeIndex] ? 'quick-pick-item-' + items[activeIndex].id : undefined}
        />

        {items.length === 0 ? (
          <p className="quick-pick__empty">{emptyMessage}</p>
        ) : (
          <ul id="quick-pick-list" className="quick-pick__list" role="listbox" ref={listRef}>
            {items.map((item, index) => (
              <li
                key={item.id}
                id={'quick-pick-item-' + item.id}
                role="option"
                aria-selected={index === activeIndex}
                className={'quick-pick__item' + (index === activeIndex ? ' quick-pick__item--active' : '')}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onAccept(item);
                }}
              >
                <div className="quick-pick__item-main">
                  <span className="quick-pick__label">
                    <HighlightedLabel label={item.label} indices={item.matchIndices} />
                  </span>
                  {item.description ? (
                    <span className="quick-pick__description">{item.description}</span>
                  ) : null}
                </div>
                {item.detail ? <span className="quick-pick__detail">{item.detail}</span> : null}
                {item.trailing ? <kbd className="quick-pick__trailing">{item.trailing}</kbd> : null}
              </li>
            ))}
          </ul>
        )}

        {footer ? <div className="quick-pick__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
