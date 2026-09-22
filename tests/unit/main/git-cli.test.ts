import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitCliService } from '@main/services/git-cli';

const run = promisify(execFile);

/**
 * Exercises the git wrapper against a real repository.
 *
 * The porcelain v2 format is what the parser reads, and it changes between git
 * versions, so parsing fixture strings would test the fixture rather than git.
 * These tests create a throwaway repository instead. When git is not installed,
 * they skip rather than fail, since git is optional for cairn-code itself.
 */

let repo: string;
let hasGit = true;
const git = new GitCliService();

async function inRepo(...args: string[]): Promise<void> {
  await run('git', args, { cwd: repo });
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'cairn-gitrepo-'));
  try {
    await inRepo('init', '--initial-branch=main');
    await inRepo('config', 'user.email', 'test@cairn.dev');
    await inRepo('config', 'user.name', 'cairn test');
    await inRepo('config', 'commit.gpgsign', 'false');

    await writeFile(join(repo, 'committed.txt'), 'original\n');
    await inRepo('add', '.');
    await inRepo('commit', '-m', 'initial commit');
  } catch {
    hasGit = false;
  }
}, 60_000);

afterAll(async () => {
  await rm(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('GitCliService against a real repository', () => {
  it.runIf(hasGit)('should recognise a repository and read its branch', async () => {
    const status = await git.getStatus(repo);

    expect(status.isRepository).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });

  it.runIf(hasGit)('should report a clean tree as having no changes', async () => {
    expect((await git.getStatus(repo)).changes).toEqual([]);
  });

  it.runIf(hasGit)('should report an untracked file', async () => {
    await writeFile(join(repo, 'untracked.txt'), 'new\n');

    const status = await git.getStatus(repo);
    const change = status.changes.find((entry) => entry.path.includes('untracked.txt'));

    expect(change?.status).toBe('untracked');
    expect(change?.staged).toBe(false);

    await rm(join(repo, 'untracked.txt'));
  });

  it.runIf(hasGit)('should report a modified file in the working tree', async () => {
    await writeFile(join(repo, 'committed.txt'), 'changed\n');

    const status = await git.getStatus(repo);
    const change = status.changes.find((entry) => entry.path.includes('committed.txt'));

    expect(change?.status).toBe('modified');
    expect(change?.staged).toBe(false);

    await writeFile(join(repo, 'committed.txt'), 'original\n');
  });

  it.runIf(hasGit)('should mark a staged change as staged', async () => {
    await writeFile(join(repo, 'staged.txt'), 'staged content\n');
    await inRepo('add', 'staged.txt');

    const status = await git.getStatus(repo);
    const change = status.changes.find((entry) => entry.path.includes('staged.txt'));

    expect(change?.status).toBe('added');
    expect(change?.staged).toBe(true);

    await inRepo('reset', 'HEAD', 'staged.txt');
    await rm(join(repo, 'staged.txt'));
  });

  it.runIf(hasGit)('should report a deleted file', async () => {
    await writeFile(join(repo, 'doomed.txt'), 'x\n');
    await inRepo('add', 'doomed.txt');
    await inRepo('commit', '-m', 'add doomed');
    await rm(join(repo, 'doomed.txt'));

    const status = await git.getStatus(repo);
    const change = status.changes.find((entry) => entry.path.includes('doomed.txt'));

    expect(change?.status).toBe('deleted');

    await inRepo('checkout', '--', 'doomed.txt');
  });

  it.runIf(hasGit)('should list the branches', async () => {
    await inRepo('branch', 'feature/test');

    const branches = await git.listBranches(repo);

    expect(branches).toContain('main');
    expect(branches).toContain('feature/test');

    await inRepo('branch', '-D', 'feature/test');
  });

  it.runIf(hasGit)('should return a diff for a modified file', async () => {
    await writeFile(join(repo, 'committed.txt'), 'diffed\n');

    const diff = await git.getDiff(repo, 'committed.txt', false);

    expect(diff).toContain('committed.txt');
    expect(diff).toContain('+diffed');

    await writeFile(join(repo, 'committed.txt'), 'original\n');
  });

  it.runIf(hasGit)('should return a staged diff separately', async () => {
    await writeFile(join(repo, 'committed.txt'), 'staged change\n');
    await inRepo('add', 'committed.txt');

    const staged = await git.getDiff(repo, 'committed.txt', true);
    expect(staged).toContain('+staged change');

    await inRepo('reset', 'HEAD', 'committed.txt');
    await inRepo('checkout', '--', 'committed.txt');
  });

  it.runIf(hasGit)('should report a detached HEAD as having no branch', async () => {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: repo });
    const head = stdout.trim();

    await inRepo('checkout', '--detach', head);
    expect((await git.getStatus(repo)).branch).toBeNull();

    await inRepo('checkout', 'main');
  });

  it.runIf(hasGit)('should see changes in a subdirectory', async () => {
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'src', 'deep.ts'), 'export const a = 1;\n');

    const status = await git.getStatus(repo);
    expect(status.changes.some((change) => change.path.includes('deep.ts'))).toBe(true);

    await rm(join(repo, 'src'), { recursive: true, force: true });
  });

  it('should treat a folder that is not a repository as empty rather than failing', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'cairn-plain-'));

    const status = await git.getStatus(plain);
    expect(status.isRepository).toBe(false);
    expect(status.branch).toBeNull();

    await rm(plain, { recursive: true, force: true });
  });
});
