import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@shared/logger';
import { CairnError } from '@shared/errors';
import type { GitChange, GitFileStatus, GitStatus } from '@shared/types';

const execFileAsync = promisify(execFile);
const log = createLogger('git');

const EMPTY_STATUS: GitStatus = {
  isRepository: false,
  branch: null,
  ahead: 0,
  behind: 0,
  changes: []
};

/**
 * Thin wrapper over the git command line.
 *
 * cairn-code shells out instead of bundling a git implementation so that the
 * user's own configuration (credential helpers, hooks, signing keys) applies
 * exactly as it does in a terminal. Every call passes an argument array, never
 * an interpolated string, so a branch or path containing a space, a quote or a
 * semicolon is data rather than syntax.
 */
export class GitCliService {
  /* ------------------------------------------------------------------ */
  /* Reading                                                             */
  /* ------------------------------------------------------------------ */

  async getStatus(cwd: string): Promise<GitStatus> {
    const porcelain = await this.#run(cwd, ['status', '--porcelain=v2', '--branch', '--untracked-files=all']);
    if (porcelain === null) return EMPTY_STATUS;
    return this.#parsePorcelain(porcelain);
  }

  /**
   * The unified diff for one file.
   *
   * An untracked file has nothing to diff against, so it is rendered as an
   * addition of every line, which is what the user expects to see.
   */
  async getDiff(cwd: string, filePath: string, staged: boolean): Promise<string | null> {
    const args = staged
      ? ['diff', '--cached', '--no-color', '--', filePath]
      : ['diff', '--no-color', '--', filePath];

    const diff = await this.#run(cwd, args);
    if (diff && diff.trim().length > 0) return diff;

    // `git diff` says nothing about a file git does not track yet.
    if (!staged) {
      const untracked = await this.#run(cwd, [
        'diff',
        '--no-color',
        '--no-index',
        '--',
        this.#nullDevice(),
        filePath
      ]);
      if (untracked && untracked.trim().length > 0) return untracked;
    }

    return diff;
  }

  async listBranches(cwd: string): Promise<string[]> {
    const output = await this.#run(cwd, ['branch', '--format=%(refname:short)']);
    if (output === null) return [];
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /* ------------------------------------------------------------------ */
  /* Writing                                                             */
  /* ------------------------------------------------------------------ */

  /** Adds paths to the index. Paths are repository-relative. */
  async stage(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.#runStrict(cwd, ['add', '--', ...paths], 'stage those changes');
  }

  /** Removes paths from the index, leaving the working tree alone. */
  async unstage(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    // `restore --staged` is the modern spelling and, unlike `reset`, it says
    // plainly that the working tree is untouched.
    await this.#runStrict(cwd, ['restore', '--staged', '--', ...paths], 'unstage those changes');
  }

  /**
   * Throws away working tree changes for the given paths.
   *
   * This is the one operation here that destroys work, so the caller is
   * expected to have confirmed it first.
   */
  async discard(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.#runStrict(cwd, ['checkout', '--', ...paths], 'discard those changes');
  }

  /** Commits whatever is in the index. */
  async commit(cwd: string, message: string): Promise<string> {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
      throw new CairnError({
        code: 'GIT_EMPTY_MESSAGE',
        message: 'A commit needs a message',
        cause: 'The message box is empty, and git refuses a commit without one.',
        solution: 'Write one line saying what the change does, then commit again.'
      });
    }

    await this.#runStrict(cwd, ['commit', '-m', trimmed], 'commit');
    const head = await this.#run(cwd, ['rev-parse', '--short', 'HEAD']);
    return head?.trim() ?? '';
  }

  /** Switches to an existing branch. */
  async switchBranch(cwd: string, name: string): Promise<void> {
    await this.#runStrict(cwd, ['switch', '--', name], `switch to ${name}`);
  }

  /** Creates a branch from the current HEAD and switches to it. */
  async createBranch(cwd: string, name: string): Promise<void> {
    await this.#runStrict(cwd, ['switch', '--create', name], `create the branch ${name}`);
  }

  /* ------------------------------------------------------------------ */
  /* Running git                                                         */
  /* ------------------------------------------------------------------ */

  /** Reads from git. Returns null when git fails, which reading can tolerate. */
  async #run(cwd: string, args: string[]): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      });
      return stdout;
    } catch (error) {
      // Not a repository, or git is not installed. Both are normal states for
      // a workspace, so the source control view simply stays empty.
      log.debug(`git ${args.join(' ')} failed in ${cwd}: ${String(error)}`);
      return null;
    }
  }

  /**
   * Runs git for an operation the user asked for, and explains any failure.
   *
   * Reading can shrug and show nothing. An action the user clicked cannot:
   * silence there looks like the editor ignoring them.
   */
  async #runStrict(cwd: string, args: string[], intent: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      });
      return stdout;
    } catch (error) {
      throw this.#explain(error, intent);
    }
  }

  /**
   * Turns a git failure into an error that says what to do.
   *
   * The cases listed here are the ones people actually hit, especially the
   * first time: git missing from PATH, no identity configured, and nothing
   * staged. Anything else falls back to git's own message, which is usually
   * the useful part.
   */
  #explain(error: unknown, intent: string): CairnError {
    const shell = error as { code?: string | number; stderr?: string; stdout?: string };
    const output = `${shell.stderr ?? ''}${shell.stdout ?? ''}`.trim();
    const lower = output.toLowerCase();

    if (shell.code === 'ENOENT') {
      return new CairnError({
        code: 'GIT_NOT_FOUND',
        message: 'git is not installed, or not on the PATH',
        cause: `cairn-code runs the git command line rather than bundling its own, and could not start it to ${intent}.`,
        solution:
          'Install git from git-scm.com, then restart cairn-code so it picks up the updated PATH.',
        original: error
      });
    }

    if (lower.includes('not a git repository')) {
      return new CairnError({
        code: 'GIT_NOT_A_REPOSITORY',
        message: 'This folder is not a git repository',
        cause: `There is no .git directory here, so there is nothing to ${intent} against.`,
        solution: 'Run git init in the terminal to start tracking this folder, or open a folder that is already a repository.',
        original: error
      });
    }

    if (lower.includes('please tell me who you are') || lower.includes('empty ident name')) {
      return new CairnError({
        code: 'GIT_NO_IDENTITY',
        message: 'git does not know who you are yet',
        cause: 'Every commit records an author, and no user.name and user.email are configured for this repository or globally.',
        solution:
          'Run git config --global user.name "Your Name" and git config --global user.email "you@example.com" in the terminal, then commit again.',
        original: error
      });
    }

    if (lower.includes('nothing to commit') || lower.includes('no changes added to commit')) {
      return new CairnError({
        code: 'GIT_NOTHING_STAGED',
        message: 'There is nothing staged to commit',
        cause: 'A commit records what is in the index, and the index currently matches the last commit.',
        solution: 'Stage the changes you want to include first, then commit.',
        original: error
      });
    }

    if (lower.includes('already exists')) {
      return new CairnError({
        code: 'GIT_BRANCH_EXISTS',
        message: 'That branch already exists',
        cause: output || 'A branch with this name is already in the repository.',
        solution: 'Switch to the existing branch, or choose a different name.',
        original: error
      });
    }

    if (lower.includes('local changes') || lower.includes('would be overwritten')) {
      return new CairnError({
        code: 'GIT_DIRTY_WORKTREE',
        message: `Uncommitted changes are in the way`,
        cause: output || 'Switching branches here would overwrite work that is not committed.',
        solution: 'Commit or stash the changes first, then try again.',
        original: error
      });
    }

    return new CairnError({
      code: 'GIT_FAILED',
      message: `Could not ${intent}`,
      cause: output || `git exited with ${String(shell.code ?? 'an error')} and said nothing.`,
      solution:
        'Run the same operation in the integrated terminal to see git\'s full output, which usually names the cause exactly.',
      original: error
    });
  }

  /** The path git treats as an empty file on this platform. */
  #nullDevice(): string {
    return process.platform === 'win32' ? 'NUL' : '/dev/null';
  }

  /* ------------------------------------------------------------------ */
  /* Parsing                                                             */
  /* ------------------------------------------------------------------ */

  #parsePorcelain(output: string): GitStatus {
    const status: GitStatus = { ...EMPTY_STATUS, isRepository: true, changes: [] };

    for (const line of output.split('\n')) {
      if (line.length === 0) continue;

      if (line.startsWith('# branch.head ')) {
        const head = line.slice('# branch.head '.length).trim();
        status.branch = head === '(detached)' ? null : head;
        continue;
      }
      if (line.startsWith('# branch.ab ')) {
        const parts = line.slice('# branch.ab '.length).trim().split(' ');
        status.ahead = Math.abs(Number.parseInt(parts[0] ?? '+0', 10)) || 0;
        status.behind = Math.abs(Number.parseInt(parts[1] ?? '-0', 10)) || 0;
        continue;
      }
      if (line.startsWith('#')) continue;

      status.changes.push(...this.#parseChangeLine(line));
    }

    return status;
  }

  /**
   * Parses one porcelain v2 line into zero, one or two changes.
   *
   * Two, because a file can differ from the index and the index can differ
   * from HEAD at the same time. Reporting a single entry would make staging
   * part of a file look like staging all of it, and the panel would then lie
   * about what a commit is going to contain.
   */
  #parseChangeLine(line: string): GitChange[] {
    const kind = line[0];

    // Untracked: "? path"
    if (kind === '?') {
      return [{ path: line.slice(2), status: 'untracked', staged: false }];
    }

    // Unmerged: "u <XY> ... <path>"
    if (kind === 'u') {
      const path = line.split(' ').slice(10).join(' ');
      return [{ path, status: 'conflicted', staged: false }];
    }

    // Ordinary: "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
    // Renamed:  "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><orig>"
    if (kind === '1' || kind === '2') {
      const fields = line.split(' ');
      const xy = fields[1] ?? '..';
      const pathFields = kind === '1' ? fields.slice(8) : fields.slice(9);
      const path = pathFields.join(' ').split('\t')[0] ?? '';

      const indexCode = xy[0] ?? '.';
      const worktreeCode = xy[1] ?? '.';
      const changes: GitChange[] = [];

      if (indexCode !== '.') {
        changes.push({ path, status: CODE_TO_STATUS[indexCode] ?? 'modified', staged: true });
      }
      if (worktreeCode !== '.') {
        changes.push({ path, status: CODE_TO_STATUS[worktreeCode] ?? 'modified', staged: false });
      }

      return changes;
    }

    return [];
  }
}

const CODE_TO_STATUS: Record<string, GitFileStatus> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'added'
};
