import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, type LaunchedApp } from './launch';

/**
 * End to end smoke tests.
 *
 * These drive the real build in out/, so they fail if the bundle is broken, if
 * the preload bridge is missing, or if the renderer throws while mounting. Run
 * `npm run build` first.
 *
 * The suite is deliberately one serial session rather than a fresh window per
 * test: starting Electron costs seconds, and the flow being checked is the one
 * a person actually performs, opening a folder and then working in it.
 */

let app: LaunchedApp;
let page: Page;
let workspace: string;
const consoleErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'causeway-e2e-'));
  await mkdir(join(workspace, 'src'), { recursive: true });

  await writeFile(
    join(workspace, 'hello.ts'),
    'export const greeting: string = "hello from causeway";\n',
    'utf8'
  );
  // A deliberate type error, so the diagnostic pipeline has something to report.
  await writeFile(join(workspace, 'src', 'broken.ts'), 'const count: number = "not a number";\n', 'utf8');
  await writeFile(join(workspace, 'main.py'), 'def greet(name):\n    return name\n', 'utf8');
  await writeFile(join(workspace, 'notes.md'), '# Notes\n', 'utf8');

  app = await launchApp();
  page = app.page;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.waitForSelector('.workbench:not(.workbench--loading)', { timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
  if (workspace) await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
});

test('the workbench renders its main regions', async () => {
  await expect(page.locator('.title-bar')).toBeVisible();
  await expect(page.locator('.activity-bar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.status-bar')).toBeVisible();
  await expect(page.locator('.welcome__title')).toHaveText('causeway');
});

test('the preload bridge exposes exactly the expected surface', async () => {
  const surface = await page.evaluate(() => Object.keys(window.causeway).sort());

  // An allowlist, not a sample. Every name here is a door into the main
  // process, so a new one has to be added deliberately and reviewed, and this
  // test is what forces that. It went stale when source control, debugging,
  // extensions and lint shipped without it being updated, which left the whole
  // end to end suite red and the eight tests after this one never running.
  expect(surface).toEqual([
    'app',
    'debug',
    'dialog',
    'extensions',
    'fs',
    'git',
    'lint',
    'menu',
    'search',
    'settings',
    'shortcut',
    'terminal',
    'update',
    'window',
    'workspace'
  ]);
});

test('Node internals are not reachable from the renderer', async () => {
  const leaked = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    ipcRenderer: typeof (globalThis as { ipcRenderer?: unknown }).ipcRenderer,
    module: typeof (globalThis as { module?: unknown }).module
  }));

  expect(leaked.require).toBe('undefined');
  expect(leaked.ipcRenderer).toBe('undefined');
  expect(leaked.module).toBe('undefined');
});

test('the command palette opens, filters and closes', async () => {
  await page.keyboard.press('Control+Shift+P');
  const palette = page.locator('.quick-pick');
  await expect(palette).toBeVisible();

  await page.keyboard.type('color theme');
  await expect(palette.locator('.quick-pick__item').first()).toContainText('Color Theme');

  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('a chord shortcut opens the theme picker and applies a theme', async () => {
  const before = await page.evaluate(() => document.documentElement.dataset.theme);

  // Ctrl+K Ctrl+T exercises the chord handling, which a repeated modifier
  // keydown used to cancel.
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+T');
  await expect(page.locator('.theme-picker')).toBeVisible();

  await page.locator('.theme-card', { hasText: 'Nordic' }).first().click();
  await expect(page.locator('.theme-picker')).toBeHidden();

  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).toBe('nordic');
  expect(after).not.toBe(before);

  // Put the signature theme back so later screenshots stay representative.
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+T');
  await page.locator('.theme-card', { hasText: 'Dark Modern' }).first().click();
  await expect(page.locator('.theme-picker')).toBeHidden();
});

test('opening a folder lists its files with their type icons', async () => {
  // Driven through the public bridge; the renderer adopts the folder from the
  // workspace:changed broadcast, exactly as it does for the native menu.
  await page.evaluate(async (root) => {
    await window.causeway.workspace.open(root);
  }, workspace);

  await expect(page.locator('.explorer__row', { hasText: 'hello.ts' })).toBeVisible({ timeout: 15_000 });

  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('.explorer__row')].map((row) => ({
      name: row.querySelector('.explorer__label')?.textContent,
      monogram: row.querySelector('.file-icon text')?.textContent ?? null,
      isFolder: Boolean(row.querySelector('.folder-icon'))
    }))
  );

  expect(icons.find((icon) => icon.name === 'hello.ts')?.monogram).toBe('TS');
  expect(icons.find((icon) => icon.name === 'main.py')?.monogram).toBe('PY');
  expect(icons.find((icon) => icon.name === 'notes.md')?.monogram).toBe('MD');
  expect(icons.find((icon) => icon.name === 'src')?.isFolder).toBe(true);
});

test('opening a file shows the editor and detects its language', async () => {
  await page.locator('.explorer__row', { hasText: 'main.py' }).first().click();

  await expect(page.locator('.editor-tab', { hasText: 'main.py' })).toBeVisible();
  await expect(page.locator('.monaco-host')).toBeVisible();
  await expect(page.locator('.status-bar')).toContainText('Python');

  // The tab carries the same icon as the explorer row.
  const tabMonogram = await page.evaluate(
    () => document.querySelector('.editor-tab--active .file-icon text')?.textContent ?? null
  );
  expect(tabMonogram).toBe('PY');
});

test('a type error is reported with its cause and its fix', async () => {
  await page.locator('.explorer__row', { hasText: 'src' }).first().click();
  await page.locator('.explorer__row', { hasText: 'broken.ts' }).first().click();

  // The TypeScript worker needs a moment to produce its first diagnostics.
  await page.waitForTimeout(4000);
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('.problems')).toBeVisible();

  const row = page.locator('.problems__row').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.locator('.problems__message')).toContainText('not assignable');

  await row.locator('.problems__expander').click();

  const detail = page.locator('.problems__details').first();
  await expect(detail).toContainText('Where');
  await expect(detail).toContainText('Why');
  await expect(detail).toContainText('Fix');
  // The two lines the compiler never gives you must be non-empty.
  await expect(detail).toContainText('string');
  await expect(detail).toContainText('number');
});

test('the terminal panel starts exactly one shell', async () => {
  await page.keyboard.press('Control+`');
  await expect(page.locator('.terminal-panel')).toBeVisible();
  await expect(page.locator('.terminal-panel__tab').first()).toBeVisible({ timeout: 20_000 });

  await page.waitForTimeout(1500);

  // A single keypress used to spawn two shells, because the command and the
  // panel both created the first terminal.
  const terminals = await page.evaluate(() => document.querySelectorAll('.xterm-screen').length);
  expect(terminals).toBe(1);
});

test('no errors were logged to the console during the whole session', () => {
  expect(consoleErrors).toEqual([]);
});
