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
            <rect x="2" y="2" width="60" height="60" rx="14" fill="var(--editor-background)" />
            <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="var(--border, #282a3a)" />
            {/*
              The crossing, at the same proportions as the application icon: a
              deck on three piers over a waterline. It takes its colours from
              the active theme rather than fixed ones, so the mark belongs to
              whichever of the twelve themes is on.
            */}
            <rect x="9" y="26" width="46" height="7.5" rx="3" fill="var(--editor-foreground)" opacity="0.94" />
            <rect x="15" y="33" width="7" height="17" rx="3" fill="var(--accent, #e11d48)" />
            <rect x="28.5" y="33" width="7" height="17" rx="3" fill="var(--accent, #e11d48)" />
            <rect x="42" y="33" width="7" height="17" rx="3" fill="var(--accent, #e11d48)" opacity="0.78" />
            <rect x="9" y="48" width="46" height="2.5" rx="1.25" fill="var(--accent, #e11d48)" opacity="0.32" />
          </svg>
          <div>
            <h1 className="welcome__title">causeway</h1>
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
