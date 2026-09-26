import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, type LaunchedApp } from './launch';

/**
 * Diagnostics while typing.
 *
 * The existing suite opens a file that already contains a mistake, which
 * proves the analyser runs once. It never presses a key. So nothing covered
 * the thing the editor is actually for: you type, and the four answers keep up.
 *
 * Both directions matter. A diagnostic that never arrives is a broken editor,
 * and a diagnostic that arrives and then never clears is worse, because it
 * tells you your fix did not work when it did.
 */

let app: LaunchedApp;
let page: Page;
let workspace: string;
const consoleErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

/*
 * Where to click to put the cursor in the code.
 *
 * Not the textarea. Monaco keeps several, including a hidden one for input
 * method composition, and the one that takes keystrokes is a pixel tall behind
 * the text. Clicking the rendered lines is what a person does and what places
 * the caret; clicking anywhere near the left edge lands on the line number
 * margin instead, which swallows the event.
 */
const EDITOR_LINES = '.monaco-editor .view-lines';

/** Replaces the whole buffer with `text`, the way a person would. */
async function retype(text: string): Promise<void> {
  await page.locator(EDITOR_LINES).first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text, { delay: 12 });
}

/** Problem messages currently listed in the panel. */
async function problems(): Promise<string[]> {
  return page.locator('.problems__message').allInnerTexts();
}

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'causeway-typing-'));
  // Deliberately clean. The mistake has to be typed, not opened.
  await writeFile(join(workspace, 'clean.ts'), 'export const ok: number = 1;\n', 'utf8');

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
  await page.waitForTimeout(1000);

  await page.locator('.explorer__row', { hasText: 'clean.ts' }).first().click();
  await page.waitForSelector('.monaco-editor', { timeout: 20_000 });
  // The TypeScript worker takes a moment to come up on the first file.
  await page.waitForTimeout(5000);
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('.problems')).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  if (workspace) await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
});

test('a clean file reports nothing', async () => {
  await expect.poll(problems, { timeout: 15_000 }).toEqual([]);
});

test('a mistake typed into the editor is reported', async () => {
  await retype('export const broken: number = "not a number";\n');

  await expect
    .poll(problems, { timeout: 20_000, message: 'typing a type error produced no diagnostic' })
    .toContainEqual(expect.stringContaining('not assignable'));
});

test('the cause and the fix arrive with it, not only the message', async () => {
  const row = page.locator('.problems__row').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('.problems__expander').click();

  const detail = page.locator('.problems__details').first();
  await expect(detail).toContainText('Why');
  await expect(detail).toContainText('Fix');
});

test('correcting the mistake by typing clears the diagnostic', async () => {
  await retype('export const broken: number = 42;\n');

  await expect
    .poll(problems, { timeout: 20_000, message: 'the diagnostic outlived the mistake' })
    .toEqual([]);
});

test('a second mistake is reported after the first one cleared', async () => {
  await retype('export const again: string = 7;\n');

  await expect
    .poll(problems, { timeout: 20_000, message: 'the analyser stopped after the first round' })
    .toContainEqual(expect.stringContaining('not assignable'));
});

test('no errors were logged to the console during the whole session', () => {
  expect(consoleErrors).toEqual([]);
});
