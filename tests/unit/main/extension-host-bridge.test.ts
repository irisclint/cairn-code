import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { IpcChannel } from '@shared/ipc-channels';

/**
 * The extension host preload writes its two channel names out as literals
 * rather than importing them, because a preload for a sandboxed window cannot
 * require the chunk the bundler would put a shared constant in.
 *
 * That duplication is only safe if something notices when it drifts, which is
 * what this does. It reads the source rather than importing it, because
 * importing a preload outside Electron fails on contextBridge.
 */
describe('the extension host preload', () => {
  it('should use exactly the channel names the rest of the application uses', async () => {
    const source = await readFile(resolve('src/preload/extension-host.ts'), 'utf8');

    const toMain = /const TO_MAIN = '([^']+)'/.exec(source)?.[1];
    const toHost = /const TO_HOST = '([^']+)'/.exec(source)?.[1];

    expect(toMain).toBe(IpcChannel.ExtensionHostToMain);
    expect(toHost).toBe(IpcChannel.ExtensionHostToHost);
  });

  it('should import nothing but electron, so a sandboxed require can load it', async () => {
    const source = await readFile(resolve('src/preload/extension-host.ts'), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);

    // Anything else ends up in a shared chunk that the sandbox refuses, and
    // the bridge is then never exposed at all.
    expect(imports).toEqual(['electron']);
  });
});
