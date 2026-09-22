import type { JSX } from 'react';
import { commandService } from '../../services/command-service';
import { formatKeybinding } from '../../services/keyboard-service';
import { LANGUAGE_COUNT } from '../../editor/language-support';
import { listThemes } from '../../theme-engine/theme-registry';

interface StartAction {
  commandId: string;
  label: string;
}

const START_ACTIONS: StartAction[] = [
  { commandId: 'file.new', label: 'New File' },
  { commandId: 'file.open', label: 'Open File' },
  { commandId: 'file.openFolder', label: 'Open Folder' }
];

const LEARN_ACTIONS: StartAction[] = [
  { commandId: 'view.commandPalette', label: 'Show all commands' },
  { commandId: 'view.quickOpen', label: 'Jump to a file' },
  { commandId: 'view.toggleTerminal', label: 'Open the terminal' },
  { commandId: 'view.themePicker', label: 'Change the color theme' },
  { commandId: 'help.keyboardShortcuts', label: 'See all keyboard shortcuts' }
];

function ActionRow({ action }: { action: StartAction }): JSX.Element {
  const command = commandService.get(action.commandId);
  return (
    <li className="welcome__action">
      <button
        type="button"
        className="welcome__link"
        onClick={() => void commandService.execute(action.commandId)}
      >
        {action.label}
      </button>
      {command?.keybinding ? (
        <kbd className="welcome__keybinding">{formatKeybinding(command.keybinding)}</kbd>
      ) : null}
    </li>
  );
}

/** Shown when no editor is open. */
export function WelcomeView(): JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome__content">
        <div className="welcome__header">
          <svg className="welcome__logo" viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
            <defs>
              <linearGradient id="welcome-logo-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="14" fill="var(--editor-background)" />
            <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="var(--border, #282a3a)" />
            {/* The stack, at the same proportions as the application icon. */}
            <rect x="14" y="39.5" width="36" height="11" rx="4.1" fill="url(#welcome-logo-gradient)" />
            <rect
              x="18.3"
              y="26.8"
              width="27.5"
              height="10.5"
              rx="3.9"
              fill="url(#welcome-logo-gradient)"
              opacity="0.9"
            />
            <rect
              x="23.3"
              y="14.3"
              width="17.5"
              height="9.8"
              rx="3.6"
              fill="var(--editor-foreground)"
              opacity="0.94"
              transform="rotate(-8 32 19.1)"
            />
          </svg>
          <div>
            <h1 className="welcome__title">cairn-code</h1>
            <p className="welcome__tagline">Fast. Beautiful. For every language.</p>
          </div>
        </div>

        <div className="welcome__columns">
          <section className="welcome__section">
            <h2 className="welcome__section-title">Start</h2>
            <ul className="welcome__list">
              {START_ACTIONS.map((action) => (
                <ActionRow key={action.commandId} action={action} />
              ))}
            </ul>
          </section>

          <section className="welcome__section">
            <h2 className="welcome__section-title">Learn</h2>
            <ul className="welcome__list">
              {LEARN_ACTIONS.map((action) => (
                <ActionRow key={action.commandId} action={action} />
              ))}
            </ul>
          </section>
        </div>

        <p className="welcome__footer">
          {LANGUAGE_COUNT} languages recognised, {listThemes().length} color themes installed.
        </p>
      </div>
    </div>
  );
}
