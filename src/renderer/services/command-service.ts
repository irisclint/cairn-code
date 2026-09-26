import { fuzzyScore } from '@shared/utils';

export type CommandCategory =
  | 'File'
  | 'Edit'
  | 'Selection'
  | 'View'
  | 'Navigate'
  | 'Terminal'
  | 'Debug'
  | 'Preferences'
  | 'Help';

export interface Command {
  id: string;
  title: string;
  category: CommandCategory;
  /** Human readable keybinding, for example "Ctrl+Shift+P". */
  keybinding?: string;
  /** Returns false when the command cannot run in the current state. */
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

export interface CommandMatch {
  command: Command;
  score: number;
  /** Indices into "Category: Title" that matched, for highlighting. */
  indices: number[];
}

/**
 * Central registry of everything causeway can do.
 *
 * The native menu, the Command Palette and the keyboard shortcuts all dispatch
 * through this registry, so a command has exactly one implementation and every
 * entry point stays in sync automatically.
 */
export class CommandService {
  #commands = new Map<string, Command>();
  #listeners = new Set<(commands: Command[]) => void>();
  #recentIds: string[] = [];

  register(command: Command): () => void {
    this.#commands.set(command.id, command);
    this.#notify();
    return () => {
      this.#commands.delete(command.id);
      this.#notify();
    };
  }

  registerAll(commands: Command[]): () => void {
    const disposers = commands.map((command) => this.register(command));
    return () => disposers.forEach((dispose) => dispose());
  }

  get(id: string): Command | undefined {
    return this.#commands.get(id);
  }

  list(): Command[] {
    return [...this.#commands.values()];
  }

  /** Runs a command by id. Unknown or disabled commands are a no-op. */
  async execute(id: string): Promise<boolean> {
    const command = this.#commands.get(id);
    if (!command) return false;
    if (command.enabled && !command.enabled()) return false;

    this.#recentIds = [id, ...this.#recentIds.filter((entry) => entry !== id)].slice(0, 20);
    await command.run();
    return true;
  }

  /**
   * Ranks commands for the palette.
   *
   * An empty query lists recently used commands first, which is what makes the
   * palette fast for the handful of commands any given user actually repeats.
   */
  search(query: string): CommandMatch[] {
    const commands = this.list().filter((command) => !command.enabled || command.enabled());

    if (query.trim().length === 0) {
      const recent = this.#recentIds
        .map((id) => this.#commands.get(id))
        .filter((command): command is Command => command !== undefined);
      const rest = commands
        .filter((command) => !this.#recentIds.includes(command.id))
        .sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title));
      return [...recent, ...rest].map((command) => ({ command, score: 0, indices: [] }));
    }

    const matches: CommandMatch[] = [];
    for (const command of commands) {
      const label = command.category + ': ' + command.title;
      const result = fuzzyScore(query, label);
      if (result) matches.push({ command, score: result.score, indices: result.indices });
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  onDidChange(listener: (commands: Command[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    const commands = this.list();
    for (const listener of this.#listeners) listener(commands);
  }
}

export const commandService = new CommandService();
