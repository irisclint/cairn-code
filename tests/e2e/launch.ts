import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Launches the built application for the end to end tests.
 *
 * Playwright's own `_electron.launch` cannot be used: it passes `--inspect` to
 * the binary, which makes Electron parse the rest of the command line with
 * Node's option parser, and Node then rejects `--remote-debugging-port`. The
 * app fails before it starts.
 *
 * So the process is started the way a user would start it, with the Chromium
 * remote debugging port enabled, and Playwright attaches over CDP afterwards.
 * That also matches what the app does in production far more closely than an
 * instrumented launch would.
 */

const require = createRequire(import.meta.url);

export interface LaunchedApp {
  browser: Browser;
  page: Page;
  process: ChildProcess;
  /** Stdout and stderr of the main process, for diagnosing a failed start. */
  output: () => string;
  close: () => Promise<void>;
}

/** Resolves the Electron executable that the `electron` package downloaded. */
function electronBinary(): string {
  const resolved = require('electron') as unknown;
  if (typeof resolved !== 'string') {
    throw new Error(
      'The electron package did not resolve to a binary path. ' +
        'Run "node node_modules/electron/install.js" to download it.'
    );
  }
  return resolved;
}

/** Polls the DevTools endpoint until the app is ready to accept a connection. */
async function waitForDevTools(port: number, timeoutMs: number, describe: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made yet';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(
    `cairn-code did not expose its DevTools endpoint on port ${port} within ${timeoutMs} ms ` +
      `(last error: ${lastError}).\nApplication output:\n${describe()}`
  );
}

export interface LaunchOptions {
  /** Port for the Chromium remote debugging endpoint. */
  port?: number;
  timeoutMs?: number;
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  // A per-run port keeps parallel or repeated runs from colliding.
  const port = options.port ?? 9300 + Math.floor(Math.random() * 400);
  const timeoutMs = options.timeoutMs ?? 40_000;

  // A throwaway profile means one run cannot inherit settings from another.
  const userDataDir = await mkdtemp(join(tmpdir(), 'cairn-e2e-profile-'));

  const environment = { ...process.env };
  // Set by some Electron based terminals. It would make the binary run as
  // plain Node, and `require('electron').protocol` would be undefined.
  delete environment.ELECTRON_RUN_AS_NODE;

  const chunks: string[] = [];
  const child = spawn(
    electronBinary(),
    ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`],
    { cwd: process.cwd(), env: environment, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

  const output = (): string => chunks.join('').slice(-4000);

  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    if (code !== 0 && code !== null) chunks.push(`\n[process exited with code ${code}]`);
  });

  try {
    await waitForDevTools(port, timeoutMs, output);
  } catch (error) {
    child.kill();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }

  if (exited) {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    throw new Error(`cairn-code exited before the tests could attach.\nApplication output:\n${output()}`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];

  if (!context) {
    throw new Error(`cairn-code exposed no browser context.\nApplication output:\n${output()}`);
  }

  // The renderer is the page serving index.html; Electron may also expose
  // other targets such as a devtools window.
  const page =
    context.pages().find((candidate) => candidate.url().includes('index.html')) ?? context.pages()[0];

  if (!page) {
    throw new Error(`cairn-code opened no window.\nApplication output:\n${output()}`);
  }

  return {
    browser,
    page,
    process: child,
    output,
    close: async () => {
      await browser.close().catch(() => undefined);
      child.kill();
      // Give the process a moment to release the profile directory on Windows.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  };
}
