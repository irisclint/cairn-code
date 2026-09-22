import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandService, type Command } from '@renderer/services/command-service';
import { KeyboardService, eventToKey, formatKeybinding } from '@renderer/services/keyboard-service';
import { commandService } from '@renderer/services/command-service';

function makeCommand(overrides: Partial<Command> & Pick<Command, 'id' | 'title'>): Command {
  return {
    category: 'View',
    run: vi.fn(),
    ...overrides
  } as Command;
}

describe('CommandService', () => {
  let service: CommandService;

  beforeEach(() => {
    service = new CommandService();
  });

  it('should register and resolve a command', () => {
    service.register(makeCommand({ id: 'test.one', title: 'One' }));
    expect(service.get('test.one')?.title).toBe('One');
  });

  it('should unregister through the returned disposer', () => {
    const dispose = service.register(makeCommand({ id: 'test.one', title: 'One' }));
    dispose();
    expect(service.get('test.one')).toBeUndefined();
  });

  it('should execute a registered command', async () => {
    const run = vi.fn();
    service.register(makeCommand({ id: 'test.run', title: 'Run', run }));

    await expect(service.execute('test.run')).resolves.toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('should report false for an unknown command instead of throwing', async () => {
    await expect(service.execute('nope')).resolves.toBe(false);
  });

  it('should not execute a disabled command', async () => {
    const run = vi.fn();
    service.register(makeCommand({ id: 'test.off', title: 'Off', enabled: () => false, run }));

    await expect(service.execute('test.off')).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('should await an async command', async () => {
    let finished = false;
    service.register(
      makeCommand({
        id: 'test.async',
        title: 'Async',
        run: async () => {
          await Promise.resolve();
          finished = true;
        }
      })
    );

    await service.execute('test.async');
    expect(finished).toBe(true);
  });

  it('should notify listeners when the registry changes', () => {
    const listener = vi.fn();
    service.onDidChange(listener);
    service.register(makeCommand({ id: 'test.one', title: 'One' }));
    expect(listener).toHaveBeenCalled();
  });

  describe('search', () => {
    beforeEach(() => {
      service.registerAll([
        makeCommand({ id: 'file.save', title: 'Save', category: 'File' }),
        makeCommand({ id: 'file.saveAs', title: 'Save As...', category: 'File' }),
        makeCommand({ id: 'view.themePicker', title: 'Color Theme', category: 'Preferences' }),
        makeCommand({ id: 'view.hidden', title: 'Hidden', category: 'View', enabled: () => false })
      ]);
    });

    it('should list every enabled command for an empty query', () => {
      const results = service.search('');
      expect(results).toHaveLength(3);
      expect(results.map((match) => match.command.id)).not.toContain('view.hidden');
    });

    it('should rank matching commands by score', () => {
      const results = service.search('color theme');
      expect(results[0]?.command.id).toBe('view.themePicker');
    });

    it('should match against the category as well as the title', () => {
      const results = service.search('file save');
      expect(results.map((match) => match.command.id)).toContain('file.save');
    });

    it('should return match indices for highlighting', () => {
      const results = service.search('save');
      expect(results[0]?.indices.length).toBe(4);
    });

    it('should exclude disabled commands from a search', () => {
      expect(service.search('hidden')).toHaveLength(0);
    });

    it('should list recently used commands first on an empty query', async () => {
      await service.execute('view.themePicker');
      expect(service.search('')[0]?.command.id).toBe('view.themePicker');
    });
  });
});

describe('eventToKey', () => {
  const makeEvent = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

  it('should render a plain letter', () => {
    expect(eventToKey(makeEvent({ key: 'p' }))).toBe('p');
  });

  it('should prefix modifiers in a stable order', () => {
    expect(eventToKey(makeEvent({ key: 'P', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+p');
  });

  it('should treat the meta key as ctrl so macOS shares the binding table', () => {
    expect(eventToKey(makeEvent({ key: 's', metaKey: true }))).toBe('ctrl+s');
  });

  it('should name punctuation keys', () => {
    expect(eventToKey(makeEvent({ key: '`', ctrlKey: true }))).toBe('ctrl+backquote');
    expect(eventToKey(makeEvent({ key: ',', ctrlKey: true }))).toBe('ctrl+comma');
    expect(eventToKey(makeEvent({ key: '/', ctrlKey: true }))).toBe('ctrl+slash');
  });

  it('should lowercase named keys', () => {
    expect(eventToKey(makeEvent({ key: 'F12' }))).toBe('f12');
    expect(eventToKey(makeEvent({ key: 'Escape' }))).toBe('escape');
  });

  it('should reduce a bare modifier to its prefix alone', () => {
    expect(eventToKey(makeEvent({ key: 'Control', ctrlKey: true }))).toBe('ctrl');
    expect(eventToKey(makeEvent({ key: 'Shift', shiftKey: true }))).toBe('shift');
  });
});

describe('formatKeybinding', () => {
  it('should render modifiers and punctuation for display', () => {
    expect(formatKeybinding('ctrl+shift+p')).toBe('Ctrl+Shift+P');
    expect(formatKeybinding('ctrl+backquote')).toBe('Ctrl+`');
    expect(formatKeybinding('ctrl+comma')).toBe('Ctrl+,');
  });

  it('should render a chord as two groups', () => {
    expect(formatKeybinding('ctrl+k ctrl+t')).toBe('Ctrl+K Ctrl+T');
  });

  it('should capitalise a named key', () => {
    expect(formatKeybinding('f12')).toBe('F12');
  });
});

describe('KeyboardService', () => {
  let keyboard: KeyboardService;
  let executed: string[];

  const press = (init: Partial<KeyboardEvent>): boolean => {
    const event = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...init
    } as unknown as KeyboardEvent;
    return keyboard.handleKeyDown(event);
  };

  beforeEach(() => {
    executed = [];
    keyboard = new KeyboardService();

    for (const id of ['view.commandPalette', 'view.themePicker', 'file.openFolder', 'file.save']) {
      commandService.register({
        id,
        title: id,
        category: 'View',
        run: () => {
          executed.push(id);
        }
      });
    }

    keyboard.bind([
      { key: 'ctrl+shift+p', commandId: 'view.commandPalette' },
      { key: 'ctrl+s', commandId: 'file.save' },
      { key: 'ctrl+k ctrl+t', commandId: 'view.themePicker' },
      { key: 'ctrl+k ctrl+o', commandId: 'file.openFolder' }
    ]);
  });

  it('should run the bound command for a simple binding', async () => {
    expect(press({ key: 'P', ctrlKey: true, shiftKey: true })).toBe(true);
    await vi.waitFor(() => expect(executed).toContain('view.commandPalette'));
  });

  it('should ignore an unbound key', () => {
    expect(press({ key: 'q', ctrlKey: true })).toBe(false);
    expect(executed).toHaveLength(0);
  });

  it('should complete a two-key chord', async () => {
    expect(press({ key: 'k', ctrlKey: true })).toBe(true);
    expect(executed).toHaveLength(0);

    expect(press({ key: 't', ctrlKey: true })).toBe(true);
    await vi.waitFor(() => expect(executed).toContain('view.themePicker'));
  });

  it('should keep a pending chord alive across a repeated modifier keydown', async () => {
    // Holding Ctrl auto-repeats its keydown between the two halves of a chord.
    press({ key: 'k', ctrlKey: true });
    press({ key: 'Control', ctrlKey: true });
    press({ key: 'Control', ctrlKey: true });
    press({ key: 't', ctrlKey: true });

    await vi.waitFor(() => expect(executed).toContain('view.themePicker'));
  });

  it('should discard a chord whose second key matches nothing', () => {
    press({ key: 'k', ctrlKey: true });
    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(executed).toHaveLength(0);
  });

  it('should dispatch the correct command for each chord sharing a prefix', async () => {
    press({ key: 'k', ctrlKey: true });
    press({ key: 'o', ctrlKey: true });
    await vi.waitFor(() => expect(executed).toEqual(['file.openFolder']));
  });

  it('should report the pending chord to its listener', () => {
    const chords: Array<string | null> = [];
    keyboard.onChordStateChange((chord) => chords.push(chord));

    press({ key: 'k', ctrlKey: true });
    expect(chords).toEqual(['ctrl+k']);

    press({ key: 't', ctrlKey: true });
    expect(chords).toEqual(['ctrl+k', null]);
  });

  it('should never treat a bare modifier as a binding', () => {
    expect(press({ key: 'Control', ctrlKey: true })).toBe(false);
    expect(press({ key: 'Shift', shiftKey: true })).toBe(false);
    expect(press({ key: 'Alt', altKey: true })).toBe(false);
  });

  it('should prevent the default action for a handled key', () => {
    const preventDefault = vi.fn();
    keyboard.handleKeyDown({
      key: 's',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      preventDefault,
      stopPropagation: vi.fn()
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
  });
});
