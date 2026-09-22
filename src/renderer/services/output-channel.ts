export interface OutputEntry {
  timestamp: number;
  channel: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

type Listener = (entries: OutputEntry[]) => void;

/** Entries kept in memory before the oldest are dropped. */
const MAX_ENTRIES = 2000;

/**
 * In-memory log shown in the Output panel.
 *
 * Services append here instead of only writing to the developer console, so a
 * user who never opens developer tools can still see what cairn-code is doing.
 */
export class OutputChannelService {
  #entries: OutputEntry[] = [];
  #listeners = new Set<Listener>();

  append(channel: string, message: string, level: OutputEntry['level'] = 'info'): void {
    this.#entries.push({ timestamp: Date.now(), channel, level, message });
    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries = this.#entries.slice(-MAX_ENTRIES);
    }
    this.#notify();
  }

  clear(channel?: string): void {
    this.#entries = channel ? this.#entries.filter((entry) => entry.channel !== channel) : [];
    this.#notify();
  }

  entries(channel?: string): OutputEntry[] {
    return channel ? this.#entries.filter((entry) => entry.channel === channel) : [...this.#entries];
  }

  channels(): string[] {
    return [...new Set(this.#entries.map((entry) => entry.channel))].sort();
  }

  onDidChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.#entries);
  }
}

export const outputChannel = new OutputChannelService();
