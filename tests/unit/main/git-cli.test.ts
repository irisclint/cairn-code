import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitCliService } from '@main/services/git-cli';

const run = promisify(execFile);

// Every test here starts real git processes, and process creation on Windows
// under a parallel test run is slow enough to pass the default timeout. The
// limit is raised for this file rather than globally, so a genuinely hung test
// elsewhere still fails fast.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

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

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

describe('staging and committing', () => {
  it.runIf(hasGit)('should stage a file and report it on the staged side', async () => {
    await writeFile(join(repo, 'staged-me.txt'), 'hello\n');
    await git.stage(repo, ['staged-me.txt']);

    const staged = (await git.getStatus(repo)).changes.filter((change) => change.staged);
    expect(staged.map((change) => change.path)).toContain('staged-me.txt');
  });

  it.runIf(hasGit)('should list a file twice when the index and the working tree differ', async () => {
    await writeFile(join(repo, 'both-sides.txt'), 'first\n');
    await git.stage(repo, ['both-sides.txt']);
    await writeFile(join(repo, 'both-sides.txt'), 'first\nsecond\n');

    const entries = (await git.getStatus(repo)).changes.filter(
      (change) => change.path === 'both-sides.txt'
    );

    // One for what a commit would contain, one for what is still only on disk.
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => entry.staged)).toBe(true);
    expect(entries.some((entry) => !entry.staged)).toBe(true);
  });

  it.runIf(hasGit)('should unstage without touching the working tree', async () => {
    await writeFile(join(repo, 'unstage-me.txt'), 'content\n');
    await git.stage(repo, ['unstage-me.txt']);
    await git.unstage(repo, ['unstage-me.txt']);

    const entries = (await git.getStatus(repo)).changes.filter(
      (change) => change.path === 'unstage-me.txt'
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.staged).toBe(false);
    // The file itself is still there; only the index entry went away.
    expect(entries[0]?.status).toBe('untracked');
  });

  it.runIf(hasGit)('should commit what is staged and return the new hash', async () => {
    await writeFile(join(repo, 'to-commit.txt'), 'payload\n');
    await git.stage(repo, ['to-commit.txt']);

    const hash = await git.commit(repo, 'Add a file worth committing');
    expect(hash).toMatch(/^[0-9a-f]{7,}$/);

    const after = (await git.getStatus(repo)).changes.filter(
      (change) => change.path === 'to-commit.txt'
    );
    expect(after).toEqual([]);
  });

  it.runIf(hasGit)('should refuse an empty message and say what to do', async () => {
    await expect(git.commit(repo, '   ')).rejects.toMatchObject({ code: 'GIT_EMPTY_MESSAGE' });

    try {
      await git.commit(repo, '');
    } catch (error) {
      const failure = error as { userCause: string; solution: string };
      expect(failure.userCause.length).toBeGreaterThan(0);
      expect(failure.solution).toContain('what the change does');
    }
  });

  it.runIf(hasGit)('should explain a commit with nothing staged', async () => {
    await expect(git.commit(repo, 'nothing here')).rejects.toMatchObject({
      code: 'GIT_NOTHING_STAGED'
    });
  });

  it.runIf(hasGit)('should discard a working tree change', async () => {
    await writeFile(join(repo, 'committed.txt'), 'edited\n');
    expect((await git.getStatus(repo)).changes.some((c) => c.path === 'committed.txt')).toBe(true);

    await git.discard(repo, ['committed.txt']);
    expect((await git.getStatus(repo)).changes.some((c) => c.path === 'committed.txt')).toBe(false);
  });
});

describe('branches', () => {
  it.runIf(hasGit)('should create a branch and switch to it', async () => {
    await git.createBranch(repo, 'feature/parser');

    const status = await git.getStatus(repo);
    expect(status.branch).toBe('feature/parser');
    expect(await git.listBranches(repo)).toContain('feature/parser');
  });

  it.runIf(hasGit)('should switch back to an existing branch', async () => {
    await git.switchBranch(repo, 'main');
    expect((await git.getStatus(repo)).branch).toBe('main');
  });

  it.runIf(hasGit)('should explain a name that is already taken', async () => {
    await expect(git.createBranch(repo, 'main')).rejects.toMatchObject({ code: 'GIT_BRANCH_EXISTS' });
  });

  it.runIf(hasGit)('should treat a branch name as data, not as arguments', async () => {
    // A name that looks like a flag must not be parsed as one. The `--`
    // separator in switchBranch is what makes this safe.
    await expect(git.switchBranch(repo, '--orphan')).rejects.toMatchObject({ code: 'GIT_FAILED' });
    expect((await git.getStatus(repo)).branch).toBe('main');
  });
});

describe('when the folder is not a repository', () => {
  it.runIf(hasGit)('should fail a commit with a cause and a concrete next step', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'cairn-notrepo-'));

    try {
      await git.commit(plain, 'this cannot work');
      expect.unreachable('committing outside a repository should throw');
    } catch (error) {
      const failure = error as { code: string; userCause: string; solution: string };
      expect(failure.code).toBe('GIT_NOT_A_REPOSITORY');
      expect(failure.userCause.length).toBeGreaterThan(0);
      expect(failure.solution).toContain('git init');
    } finally {
      await rm(plain, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    }
  });

  it.runIf(hasGit)('should read a status of nothing rather than throwing', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'cairn-notrepo-'));
    const status = await git.getStatus(plain);

    expect(status.isRepository).toBe(false);
    expect(status.changes).toEqual([]);
    await rm(plain, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });
});
