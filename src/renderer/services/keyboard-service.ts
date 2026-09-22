import { commandService } from './command-service';
import { createLogger } from '@shared/logger';

const log = createLogger('keyboard');

/** How long a chord such as Ctrl+K stays armed before it is discarded. */
const CHORD_TIMEOUT_MS = 2500;

/** Keys that only ever act as modifiers, never as the key of a binding. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

export interface Keybinding {
  /** Normalised key description, for example "ctrl+shift+p" or "ctrl+k ctrl+t". */
  key: string;
  commandId: string;
}

const isMac = globalThis.navigator?.platform?.toLowerCase().includes('mac') ?? false;

/** Renders a binding for display, using the platform's modifier names. */
export function formatKeybinding(key: string): string {
  return key
    .split(' ')
    .map((chord) =>
      chord
        .split('+')
        .map((part) => {
          switch (part) {
            case 'ctrl':
              return isMac ? 'Cmd' : 'Ctrl';
            case 'alt':
              return isMac ? 'Option' : 'Alt';
            case 'shift':
              return 'Shift';
            case 'backquote':
              return '`';
            case 'comma':
              return ',';
            case 'slash':
              return '/';
            case 'period':
              return '.';
            default:
              return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
          }
        })
        .join('+')
    )
    .join(' ');
}

/** Normalises a keyboard event into the string form used by the binding table. */
export function eventToKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  // Cmd on macOS maps to the same bindings as Ctrl elsewhere.
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  const key = event.key;
  const named: Record<string, string> = {
    '`': 'backquote',
    ',': 'comma',
    '/': 'slash',
    '.': 'period',
    ' ': 'space',
    Escape: 'escape',
    Enter: 'enter',
    Backspace: 'backspace',
    Delete: 'delete',
    Tab: 'tab',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right'
  };

  // A modifier contributes only its prefix, never a key name of its own.
  if (!MODIFIER_KEYS.has(key)) parts.push(named[key] ?? key.toLowerCase());

  return parts.join('+');
}

/**
 * Global keyboard dispatcher.
 *
 * Monaco handles keys while the editor has focus, so this listener runs in the
 * capture phase only for bindings the workbench owns. Chords such as
 * Ctrl+K Ctrl+T are supported through a short-lived pending prefix.
 */
export class KeyboardService {
  #bindings = new Map<string, string>();
  #pendingChord: string | null = null;
  #chordTimer: ReturnType<typeof setTimeout> | null = null;
  #onChordStateChange: ((chord: string | null) => void) | null = null;
  #attached = false;

  bind(bindings: Keybinding[]): void {
    for (const binding of bindings) this.#bindings.set(binding.key, binding.commandId);
  }

  onChordStateChange(listener: (chord: string | null) => void): void {
    this.#onChordStateChange = listener;
  }

  attach(target: Window | HTMLElement = globalThis.window): () => void {
    if (this.#attached) return () => undefined;
    this.#attached = true;

    const handler = (event: Event): void => {
      this.handleKeyDown(event as KeyboardEvent);
    };
    target.addEventListener('keydown', handler, { capture: true });

    return () => {
      target.removeEventListener('keydown', handler, { capture: true });
      this.#attached = false;
    };
  }

  /** Exposed separately from `attach` so tests can drive it directly. */
  handleKeyDown(event: KeyboardEvent): boolean {
    // A modifier on its own is never a binding, and it must not disturb a
    // pending chord: holding Ctrl auto-repeats its keydown, which would
    // otherwise cancel the chord before the second key ever arrives.
    if (MODIFIER_KEYS.has(event.key)) return false;

    const key = eventToKey(event);
    if (key.length === 0 || key.endsWith('+')) return false;

    const candidate = this.#pendingChord ? this.#pendingChord + ' ' + key : key;

    const commandId = this.#bindings.get(candidate);
    if (commandId) {
      event.preventDefault();
      event.stopPropagation();
      this.#clearChord();
      void commandService.execute(commandId);
      return true;
    }

    // The key may be the first half of a chord such as "ctrl+k ctrl+t".
    const startsChord = [...this.#bindings.keys()].some((binding) => binding.startsWith(key + ' '));
    if (!this.#pendingChord && startsChord) {
      event.preventDefault();
      this.#setChord(key);
      return true;
    }

    if (this.#pendingChord) {
      log.debug('Chord ' + candidate + ' matched no binding');
      this.#clearChord();
    }
    return false;
  }

  #setChord(chord: string): void {
    this.#pendingChord = chord;
    this.#onChordStateChange?.(chord);
    if (this.#chordTimer !== null) clearTimeout(this.#chordTimer);
    this.#chordTimer = setTimeout(() => this.#clearChord(), CHORD_TIMEOUT_MS);
  }

  #clearChord(): void {
    if (this.#chordTimer !== null) clearTimeout(this.#chordTimer);
    this.#chordTimer = null;
    if (this.#pendingChord !== null) {
      this.#pendingChord = null;
      this.#onChordStateChange?.(null);
    }
  }
}

export const keyboardService = new KeyboardService();
