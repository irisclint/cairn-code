import { useEffect, useState, type JSX } from 'react';
import type { SettingKey, Settings, ShortcutState } from '@shared/types';
import { useSettingsStore } from '../../store/settings-store';
import { useThemeStore } from '../../store/theme-store';
import { useNotificationStore } from '../../store/notification-store';
import { getShortcutState, removeDesktopShortcut } from '../../services/shortcut-prompt';
import { commandService } from '../../services/command-service';

type FieldKind = 'boolean' | 'number' | 'select' | 'text';

interface FieldDescriptor {
  key: SettingKey;
  label: string;
  description: string;
  kind: FieldKind;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

interface SettingsSection {
  title: string;
  fields: FieldDescriptor[];
}

const SECTIONS: SettingsSection[] = [
  {
    title: 'Workbench',
    fields: [
      {
        key: 'workbench.showMinimap',
        label: 'Show minimap',
        description: 'Displays the code overview on the right edge of the editor.',
        kind: 'boolean'
      },
      {
        key: 'workbench.showBreadcrumbs',
        label: 'Show breadcrumbs',
        description: 'Shows the path of the open file above the editor.',
        kind: 'boolean'
      }
    ]
  },
  {
    title: 'Editor',
    fields: [
      {
        key: 'editor.fontSize',
        label: 'Font size',
        description: 'Size of the editor text in pixels.',
        kind: 'number',
        min: 8,
        max: 40
      },
      {
        key: 'editor.fontFamily',
        label: 'Font family',
        description: 'Font stack used by the editor. The first installed font wins.',
        kind: 'text'
      },
      {
        key: 'editor.tabSize',
        label: 'Tab size',
        description: 'Number of spaces one indentation level represents.',
        kind: 'number',
        min: 1,
        max: 16
      },
      {
        key: 'editor.insertSpaces',
        label: 'Insert spaces',
        description: 'Inserts spaces instead of a tab character when indenting.',
        kind: 'boolean'
      },
      {
        key: 'editor.wordWrap',
        label: 'Word wrap',
        description: 'Controls how long lines are wrapped.',
        kind: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
          { value: 'bounded', label: 'Bounded' }
        ]
      },
      {
        key: 'editor.lineNumbers',
        label: 'Line numbers',
        description: 'Controls the line number gutter.',
        kind: 'select',
        options: [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
          { value: 'relative', label: 'Relative' }
        ]
      },
      {
        key: 'editor.renderWhitespace',
        label: 'Render whitespace',
        description: 'Controls when whitespace characters are drawn.',
        kind: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'boundary', label: 'Boundary' },
          { value: 'all', label: 'All' }
        ]
      }
    ]
  },
  {
    title: 'Terminal',
    fields: [
      {
        key: 'terminal.fontSize',
        label: 'Font size',
        description: 'Size of the terminal text in pixels.',
        kind: 'number',
        min: 8,
        max: 32
      },
      {
        key: 'terminal.cursorBlink',
        label: 'Blinking cursor',
        description: 'Controls whether the terminal cursor blinks.',
        kind: 'boolean'
      }
    ]
  },
  {
    title: 'Diagnostics',
    fields: [
      {
        key: 'diagnostics.enableTypeScript',
        label: 'TypeScript and JavaScript diagnostics',
        description: 'Reports type and syntax problems while you type.',
        kind: 'boolean'
      },
      {
        key: 'diagnostics.enableEslint',
        label: 'ESLint diagnostics',
        description: 'Runs ESLint for the open file when the workspace provides a configuration.',
        kind: 'boolean'
      }
    ]
  },
  {
    title: 'Privacy and updates',
    fields: [
      {
        key: 'telemetry.enabled',
        label: 'Send anonymous usage data',
        description: 'Off by default. causeway never sends anything until this is switched on.',
        kind: 'boolean'
      },
      {
        key: 'update.checkAutomatically',
        label: 'Check for updates automatically',
        description: 'Looks for a new version shortly after startup in packaged builds.',
        kind: 'boolean'
      }
    ]
  }
];

/**
 * Desktop shortcut control.
 *
 * Sits in Settings as well as the Command Palette, because someone looking for
 * this is far more likely to open Settings than to guess a command name.
 */
function ShortcutField(): JSX.Element | null {
  const [shortcut, setShortcut] = useState<ShortcutState | null>(null);
  const notify = useNotificationStore((store) => store.notify);

  const refresh = (): void => {
    void getShortcutState().then(setShortcut);
  };

  useEffect(refresh, []);

  if (!shortcut) return null;

  return (
    <div className="settings__field">
      <span className="settings__label">Desktop shortcut</span>
      <p className="settings__description">
        {shortcut.canCreate
          ? shortcut.exists
            ? 'A shortcut is on your desktop.'
            : 'Put a shortcut on your desktop so causeway is one double click away.'
          : (shortcut.reason ?? 'Not available for this build.')}
      </p>

      {shortcut.canCreate ? (
        <button
          type="button"
          className="button"
          onClick={async () => {
            if (shortcut.exists) {
              const removed = await removeDesktopShortcut().catch(() => false);
              if (removed) {
                notify({ severity: 'success', message: 'Desktop shortcut removed' });
              }
            } else {
              await commandService.execute('app.createDesktopShortcut');
            }
            refresh();
          }}
        >
          {shortcut.exists ? 'Remove shortcut' : 'Create shortcut'}
        </button>
      ) : null}
    </div>
  );
}

function SettingField({ field }: { field: FieldDescriptor }): JSX.Element {
  const settings = useSettingsStore((state) => state.settings);
  const setSetting = useSettingsStore((state) => state.set);
  const value = settings[field.key];
  const inputId = 'setting-' + field.key.replace(/\./g, '-');

  return (
    <div className="settings__field">
      <label className="settings__label" htmlFor={inputId}>
        {field.label}
      </label>
      <p className="settings__description">{field.description}</p>

      {field.kind === 'boolean' ? (
        <input
          id={inputId}
          type="checkbox"
          className="settings__checkbox"
          checked={Boolean(value)}
          onChange={(event) => void setSetting(field.key, event.target.checked as Settings[SettingKey])}
        />
      ) : field.kind === 'number' ? (
        <input
          id={inputId}
          type="number"
          className="input input--small"
          value={Number(value)}
          min={field.min}
          max={field.max}
          onChange={(event) => void setSetting(field.key, Number(event.target.value) as Settings[SettingKey])}
        />
      ) : field.kind === 'select' ? (
        <select
          id={inputId}
          className="input input--small"
          value={String(value)}
          onChange={(event) => void setSetting(field.key, event.target.value as Settings[SettingKey])}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type="text"
          className="input input--small"
          value={String(value ?? '')}
          onChange={(event) => void setSetting(field.key, event.target.value as Settings[SettingKey])}
        />
      )}
    </div>
  );
}

/** Settings editor rendered in the sidebar. */
export function SettingsView(): JSX.Element {
  const themes = useThemeStore((state) => state.themes);
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const setTheme = useThemeStore((state) => state.setTheme);
  const reset = useSettingsStore((state) => state.reset);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Settings</h2>
      </div>

      <div className="settings">
        <section className="settings__section">
          <h3 className="settings__section-title">Appearance</h3>
          <div className="settings__field">
            <label className="settings__label" htmlFor="setting-theme">
              Color theme
            </label>
            <p className="settings__description">Applies immediately and is remembered across restarts.</p>
            <select
              id="setting-theme"
              className="input input--small"
              value={currentThemeId}
              onChange={(event) => setTheme(event.target.value)}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {SECTIONS.map((section) => (
          <section key={section.title} className="settings__section">
            <h3 className="settings__section-title">{section.title}</h3>
            {section.fields.map((field) => (
              <SettingField key={field.key} field={field} />
            ))}
            {section.title === 'Workbench' ? <ShortcutField /> : null}
          </section>
        ))}

        <button type="button" className="button button--block" onClick={() => void reset()}>
          Reset all settings
        </button>
      </div>
    </div>
  );
}
