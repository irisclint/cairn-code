import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { DebugService, resolveAdapter, stripJsonComments } from '@main/services/debug-service';
import type { DebugSessionState } from '@shared/types';

/**
 * Drives the debug service against a real adapter process.
 *
 * The adapter is a small Node script in tests/fixtures that speaks the
 * protocol. Using a separate process rather than a mocked client keeps the
 * parts that actually break under test: pipe framing, the handshake ordering
 * and the teardown.
 */

const ADAPTER = resolve('tests/fixtures/fake-dap-adapter.mjs');

let root: string;
let service: DebugService;

function config(extra: Record<string, unknown> = {}) {
  return {
    name: 'Fake',
    type: 'fake',
    request: 'launch' as const,
    debugAdapter: process.execPath,
    debugAdapterArgs: [ADAPTER],
    ...extra
  };
}

/** Waits for the session to reach a status, or fails with what it reached. */
/*
 * These tests spawn a real Node process for the fake adapter and wait on a
 * handshake over stdio, which under a full parallel run takes longer than the
 * five seconds Vitest allows a test by default. The helper below asks for ten,
 * so without this the framework killed the test half way through a wait it had
 * been told to make, and the file went red at random.
 */
vi.setConfig({ testTimeout: 20_000 });

async function waitForStatus(expected: DebugSessionState['status']): Promise<void> {
  await vi.waitFor(() => expect(service.state.status).toBe(expected), { timeout: 10_000 });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'causeway-debug-'));
  service = new DebugService();
});

afterEach(async () => {
  await service.stop();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

describe('reading launch.json', () => {
  it('should return nothing when the workspace has none', async () => {
    expect(await service.listConfigurations(root)).toEqual([]);
  });

  it('should read the configurations a project defines', async () => {
    await mkdir(join(root, '.vscode'), { recursive: true });
    await writeFile(
      join(root, '.vscode', 'launch.json'),
      JSON.stringify({
        version: '0.2.0',
        configurations: [{ name: 'Run tests', type: 'python', request: 'launch', program: 'main.py' }]
      })
    );

    const [first] = await service.listConfigurations(root);
    expect(first?.name).toBe('Run tests');
    expect(first?.['program']).toBe('main.py');
  });

  it('should accept the comments and trailing commas launch.json allows', async () => {
    await mkdir(join(root, '.vscode'), { recursive: true });
    await writeFile(
      join(root, '.vscode', 'launch.json'),
      `{
  // The editor writes this comment by default.
  "version": "0.2.0",
  /* Block comments are allowed too. */
  "configurations": [
    {
      "name": "Debug: with // in a string",
      "type": "node",
      "request": "launch",
    },
  ],
}`
    );

    const configs = await service.listConfigurations(root);
    expect(configs).toHaveLength(1);
    // A // inside a string literal is not a comment.
    expect(configs[0]?.name).toBe('Debug: with // in a string');
  });

  it('should explain a file it cannot parse rather than pretending it is empty', async () => {
    await mkdir(join(root, '.vscode'), { recursive: true });
    await writeFile(join(root, '.vscode', 'launch.json'), '{ "configurations": [ }');

    await expect(service.listConfigurations(root)).rejects.toMatchObject({
      code: 'DEBUG_BAD_CONFIG',
      solution: expect.stringContaining('missing comma')
    });
  });
});

describe('choosing the adapter command', () => {
  it('should prefer an explicit command with an argument list', () => {
    expect(
      resolveAdapter({
        name: 'x',
        type: 'node',
        request: 'launch',
        debugAdapter: 'C:/Program Files/node.exe',
        debugAdapterArgs: ['adapter.js']
      })
    ).toEqual({ command: 'C:/Program Files/node.exe', args: ['adapter.js'] });
  });

  it('should default Python to debugpy, which is the module name pip installs', () => {
    expect(resolveAdapter({ name: 'x', type: 'python', request: 'launch' })).toEqual({
      command: 'python',
      args: ['-m', 'debugpy.adapter']
    });
  });
});

describe('stripping comments', () => {
  it('should leave a // that is inside a string alone', () => {
    expect(stripJsonComments('{"url": "https://example.com"}')).toBe('{"url": "https://example.com"}');
  });

  it('should leave an escaped quote alone', () => {
    expect(stripJsonComments('{"q": "a \\" // b"}')).toBe('{"q": "a \\" // b"}');
  });
});

/* -------------------------------------------------------------------------- */
/* A session                                                                   */
/* -------------------------------------------------------------------------- */

describe('running a session', () => {
  it('should complete the handshake and land on the breakpoint the adapter reports', async () => {
    await service.setBreakpoints('/app/cart.js', [{ line: 12 }]);
    await service.start(root, config());

    // The adapter announces the stop before answering configurationDone, so a
    // client that sets "running" at the end of the handshake would lose it.
    await waitForStatus('stopped');
    expect(service.state.stoppedReason).toBe('breakpoint');
    expect(service.state.threadId).toBe(1);
    expect(service.state.configurationName).toBe('Fake');
  });

  it('should refuse a second session while one is running', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    await expect(service.start(root, config())).rejects.toMatchObject({
      code: 'DEBUG_ALREADY_RUNNING'
    });
  });

  it('should report the stack, the scopes and the variables', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    const frames = await service.stackTrace();
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ name: 'total', line: 12, source: '/app/cart.js' });

    const scopes = await service.scopes(frames[0]?.id as number);
    expect(scopes.map((scope) => scope.name)).toEqual(['Local', 'Global']);
    expect(scopes[1]?.expensive).toBe(true);

    const variables = await service.variables(scopes[0]?.variablesReference as number);
    expect(variables[0]).toMatchObject({ name: 'sum', value: '101', type: 'number' });
    // A value with children carries a reference to fetch them with.
    expect(variables[1]?.variablesReference).toBeGreaterThan(0);
  });

  it('should evaluate an expression in a frame', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    expect(await service.evaluate('sum + 1', 1000)).toBe('evaluated:sum + 1');
  });

  it('should step and stop again', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    await service.next();
    await vi.waitFor(() => expect(service.state.stoppedReason).toBe('step'), { timeout: 10_000 });
    expect(service.state.status).toBe('stopped');
  });

  it('should end the session when the program finishes', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    await service.continue();
    // The adapter terminates shortly after continuing.
    await waitForStatus('inactive');
  });

  it('should pass the breakpoints it was given before the session started', async () => {
    await service.setBreakpoints('/app/cart.js', [{ line: 12 }, { line: 20, condition: 'sum > 5' }]);
    expect(service.allBreakpoints()['/app/cart.js']).toHaveLength(2);

    await service.start(root, config());
    await waitForStatus('stopped');
    // Still remembered after the handshake sent them.
    expect(service.allBreakpoints()['/app/cart.js']).toHaveLength(2);
  });

  it('should forget a file whose breakpoints are all removed', async () => {
    await service.setBreakpoints('/app/cart.js', [{ line: 12 }]);
    await service.setBreakpoints('/app/cart.js', []);
    expect(service.allBreakpoints()['/app/cart.js']).toBeUndefined();
  });
});

describe('when the session cannot start', () => {
  it('should surface the adapter own reason for refusing to launch', async () => {
    await expect(service.start(root, config({ program: 'MISSING' }))).rejects.toMatchObject({
      message: 'Cannot find program MISSING'
    });

    // And it must not be left half-started.
    expect(service.state.status).toBe('inactive');
  });

  it('should explain a missing adapter instead of failing silently', async () => {
    await expect(
      service.start(root, {
        name: 'Nope',
        type: 'python',
        request: 'launch',
        debugAdapter: 'definitely-not-installed-anywhere',
        debugAdapterArgs: []
      })
    ).rejects.toMatchObject({ code: 'DEBUG_ADAPTER_MISSING' });
  }, 20_000);

  it('should refuse inspection when nothing is running', async () => {
    await expect(service.stackTrace()).rejects.toMatchObject({ code: 'DEBUG_NOT_RUNNING' });
    await expect(service.continue()).rejects.toMatchObject({ code: 'DEBUG_NOT_RUNNING' });
  });
});

describe('stopping', () => {
  it('should return to inactive and stay usable', async () => {
    await service.start(root, config());
    await waitForStatus('stopped');

    await service.stop();
    expect(service.state.status).toBe('inactive');
    expect(service.state.configurationName).toBeNull();

    // A second session is allowed once the first has ended.
    await service.start(root, config());
    await waitForStatus('stopped');
  });

  it('should be safe to stop when nothing is running', async () => {
    await expect(service.stop()).resolves.toBeUndefined();
  });
});
