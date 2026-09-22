import { useMemo, useState, type JSX } from 'react';
import { useUiStore } from '../../store/ui-store';
import { listKeybindings } from '../../services/register-commands';
import { formatKeybinding } from '../../services/keyboard-service';

/** Searchable reference of every keyboard shortcut. */
export function ShortcutsDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const [query, setQuery] = useState('');
  const bindings = useMemo(() => listKeybindings(), []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return bindings;
    return bindings.filter(
      (binding) =>
        binding.title.toLowerCase().includes(needle) ||
        binding.category.toLowerCase().includes(needle) ||
        formatKeybinding(binding.key).toLowerCase().includes(needle)
    );
  }, [bindings, query]);

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={closeDialog}>
      <div
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shortcuts-dialog__header">
          <h2>Keyboard Shortcuts</h2>
          <input
            className="input"
            autoFocus
            placeholder="Search shortcuts"
            aria-label="Search shortcuts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeDialog();
            }}
          />
        </div>

        <table className="shortcuts-table">
          <thead>
            <tr>
              <th scope="col">Command</th>
              <th scope="col">Category</th>
              <th scope="col">Shortcut</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((binding) => (
              <tr key={binding.key + binding.title}>
                <td>{binding.title}</td>
                <td>{binding.category}</td>
                <td>
                  <kbd>{formatKeybinding(binding.key)}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visible.length === 0 ? <p className="shortcuts-dialog__empty">No shortcut matches.</p> : null}

        <div className="shortcuts-dialog__footer">
          <span>{visible.length} shortcuts</span>
          <button type="button" className="button button--primary" onClick={closeDialog}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
