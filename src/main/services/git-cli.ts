import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@shared/logger';

const execFileAsync = promisify(execFile);
const log = createLogger('git');

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface GitChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitStatus {
  isRepository: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  changes: GitChange[];
}

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
 * cairn-code shells out instead of bundling a git implementation so that the user's
 * own configuration (credential helpers, hooks, signing keys) applies exactly
 * as it does on the command line.
 */
export class GitCliService {
  async getStatus(cwd: string): Promise<GitStatus> {
    const porcelain = await this.#run(cwd, ['status', '--porcelain=v2', '--branch', '--untracked-files=all']);
    if (porcelain === null) return EMPTY_STATUS;
    return this.#parsePorcelain(porcelain);
  }

  async getDiff(cwd: string, filePath: string, staged: boolean): Promise<string | null> {
    const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
    return this.#run(cwd, args);
  }

  async listBranches(cwd: string): Promise<string[]> {
    const output = await this.#run(cwd, ['branch', '--format=%(refname:short)']);
    if (output === null) return [];
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

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

      const change = this.#parseChangeLine(line);
      if (change) status.changes.push(change);
    }

    return status;
  }

  #parseChangeLine(line: string): GitChange | null {
    const kind = line[0];

    // Untracked: "? path"
    if (kind === '?') {
      return { path: line.slice(2), status: 'untracked', staged: false };
    }
    // Unmerged: "u <XY> ... <path>"
    if (kind === 'u') {
      const path = line.split(' ').slice(10).join(' ');
      return { path, status: 'conflicted', staged: false };
    }
    // Ordinary: "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
    // Renamed:  "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>"
    if (kind === '1' || kind === '2') {
      const fields = line.split(' ');
      const xy = fields[1] ?? '..';
      const pathFields = kind === '1' ? fields.slice(8) : fields.slice(9);
      const path = pathFields.join(' ').split('\t')[0] ?? '';
      const stagedCode = xy[0] ?? '.';
      const worktreeCode = xy[1] ?? '.';
      const staged = stagedCode !== '.';
      const code = staged ? stagedCode : worktreeCode;

      const statusMap: Record<string, GitFileStatus> = {
        M: 'modified',
        A: 'added',
        D: 'deleted',
        R: 'renamed',
        C: 'added'
      };
      return { path, status: statusMap[code] ?? 'modified', staged };
    }

    return null;
  }
}
