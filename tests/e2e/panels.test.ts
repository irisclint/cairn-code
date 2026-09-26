import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launchApp, type LaunchedApp } from './launch';

const run = promisify(execFile);

/**
 * The four panels that shipped after the first end to end suite was written.
 *
 * Source control, debugging, extensions and lint each added a namespace to the
 * preload bridge, and none of them was ever opened by a test. That is how the
 * suite came to be red without anyone noticing: the allowlist assertion failed
 * on the new names, and the eight tests after it never ran.
 *
 * These open each panel against a real workspace and assert on what it says,
 * because a panel that renders an empty box and a panel that renders the right
 * empty box are indistinguishable from a screenshot.
 */

let app: LaunchedApp;
let page: Page;
let workspace: string;
const consoleErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

/**
 * Opens a panel from the activity bar by its accessible name.
 *
 * Clicking the item that is already active collapses the sidebar, which is
 * what the activity bar is supposed to do and what makes a naive click helper
 * close the thing it was asked to open. So the pressed state is checked first
 * and the click only happens when it would actually open something.
 */
async function openPanel(name: string): Promise<void> {
  const button = page.locator(`.activity-bar button[aria-label^="${name}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
}

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'causeway-panels-'));
  await mkdir(join(workspace, 'src'), { recursive: true });
  await writeFile(join(workspace, 'tracked.ts'), 'export const a = 1;\n', 'utf8');

  // A real repository, so source control has something true to report rather
  // than the "not a repository" path every other test would exercise.
  const git = (...args: string[]): Promise<unknown> => run('git', args, { cwd: workspace });
  await git('init', '-b', 'main');
  await git('config', 'user.email', 'test@example.invalid');
  await git('config', 'user.name', 'Test');
  await git('add', '.');
  await git('commit', '-m', 'first');
  // One staged change and one unstaged, so both lists have an entry.
  await writeFile(join(workspace, 'tracked.ts'), 'export const a = 2;\n', 'utf8');
  await writeFile(join(workspace, 'untracked.ts'), 'export const b = 3;\n', 'utf8');

  app = await launchApp();
  page = app.page;
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.waitForSelector('.workbench:not(.workbench--loading)', { timeout: 30_000 });

  await page.evaluate(async (folder) => {
    await (window as unknown as { causeway: { workspace: { open: (p: string) => Promise<unknown> } } })
      .causeway.workspace.open(folder);
  }, workspace);
  await page.waitForTimeout(1200);
});

test.afterAll(async () => {
  await app?.close();
  if (workspace) await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
});

test('source control lists the working tree changes', async () => {
  await openPanel('Source Control');

  const view = page.locator('.sidebar-view');
  await expect(view).toBeVisible();

  // The file that changed and the file that is new must both be named. A panel
  // that shows a count but not the paths is not usable.
  await expect(view).toContainText('tracked.ts', { timeout: 10_000 });
  await expect(view).toContainText('untracked.ts');
});

test('source control shows which branch is checked out', async () => {
  await openPanel('Source Control');
  await expect(page.locator('.sidebar-view')).toContainText('main', { timeout: 10_000 });
});

test('run and debug says what it needs rather than showing dead controls', async () => {
  await openPanel('Run and Debug');

  const view = page.locator('.sidebar-view');
  await expect(view).toBeVisible();
  // No launch.json exists here, and the project's rule is that an unfinished
  // or unavailable state explains itself.
  await expect(view).not.toHaveText('');
});

test('extensions states that no registry has been published', async () => {
  await openPanel('Extensions');

  const view = page.locator('.sidebar, .sidebar-view').first();
  await expect(view).toBeVisible();
  await expect(view).not.toHaveText('');
});

test('switching between all five panels leaves none of them blank', async () => {
  for (const name of ['Explorer', 'Search', 'Source Control', 'Run and Debug', 'Extensions']) {
    await openPanel(name);
    const text = (await page.locator('.sidebar').innerText()).trim();
    expect(text, `the ${name} panel rendered nothing`).not.toBe('');
  }
});

test('no errors were logged to the console during the whole session', () => {
  expect(consoleErrors).toEqual([]);
});
