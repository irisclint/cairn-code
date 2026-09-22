import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { SearchFileResult, SearchMatch, SearchQuery } from '@shared/types';
import { IGNORED_DIRECTORIES } from '@shared/constants';
import { escapeRegExp, globToRegExp, fuzzyScore, toPosixPath } from '@shared/utils';
import { WorkspaceError } from '@shared/errors';
import { createLogger } from '@shared/logger';

const log = createLogger('search');

/** Files above this size are skipped by content search to keep it responsive. */
const MAX_SEARCHABLE_FILE_BYTES = 2 * 1024 * 1024;

/** Upper bound on files visited per query, protects against runaway trees. */
const MAX_VISITED_FILES = 20_000;

/** Heuristic binary check: a NUL byte in the first KB means "not text". */
function looksBinary(content: string): boolean {
  const sampleLength = Math.min(content.length, 1024);
  for (let i = 0; i < sampleLength; i += 1) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

/**
 * Workspace-wide file name and content search.
 *
 * Runs in the main process so the renderer never blocks on disk traversal.
 */
export class SearchService {
  /** Finds files whose path fuzzy-matches the query, ranked best first. */
  async searchFileNames(rootPath: string, query: string, limit = 50): Promise<string[]> {
    const files = await this.#collectFiles(rootPath);
    if (query.trim().length === 0) return files.slice(0, limit);

    const scored: Array<{ path: string; score: number }> = [];
    for (const path of files) {
      const result = fuzzyScore(query, toPosixPath(relative(rootPath, path)));
      if (result) scored.push({ path, score: result.score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((entry) => entry.path);
  }

  /** Searches file contents and returns matches grouped by file. */
  async searchInFiles(rootPath: string, query: SearchQuery): Promise<SearchFileResult[]> {
    if (query.query.length === 0) return [];

    const matcher = this.#buildMatcher(query);
    const includeMatcher = query.includeGlob ? globToRegExp(query.includeGlob) : null;
    const excludeMatcher = query.excludeGlob ? globToRegExp(query.excludeGlob) : null;
    const maxResults = query.maxResults ?? 2000;

    const files = await this.#collectFiles(rootPath);
    const results: SearchFileResult[] = [];
    let totalMatches = 0;

    for (const path of files) {
      if (totalMatches >= maxResults) break;

      const relativePath = toPosixPath(relative(rootPath, path));
      if (includeMatcher && !includeMatcher.test(relativePath)) continue;
      if (excludeMatcher && excludeMatcher.test(relativePath)) continue;

      let content: string;
      try {
        const stats = await stat(path);
        if (stats.size > MAX_SEARCHABLE_FILE_BYTES) continue;
        content = await readFile(path, 'utf8');
      } catch {
        continue;
      }
      if (looksBinary(content)) continue;

      const matches = this.#matchLines(content, matcher, maxResults - totalMatches);
      if (matches.length > 0) {
        results.push({ path, matches });
        totalMatches += matches.length;
      }
    }

    log.debug(`Search for "${query.query}" found ${totalMatches} matches in ${results.length} files`);
    return results;
  }

  #buildMatcher(query: SearchQuery): RegExp {
    let source = query.isRegex ? query.query : escapeRegExp(query.query);
    if (query.wholeWord) source = `\\b${source}\\b`;

    const flags = query.matchCase ? 'g' : 'gi';
    try {
      return new RegExp(source, flags);
    } catch (error) {
      throw new WorkspaceError({
        code: 'SEARCH_BAD_REGEX',
        message: `The search pattern is not a valid regular expression: ${query.query}`,
        cause: `The regular expression engine rejected the pattern: ${String(error)}`,
        solution: 'Fix the pattern, or turn off the regular expression toggle to search for literal text.',
        original: error
      });
    }
  }

  #matchLines(content: string, matcher: RegExp, remaining: number): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= remaining) break;
      const lineText = lines[index] ?? '';
      matcher.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = matcher.exec(lineText)) !== null) {
        matches.push({
          lineNumber: index + 1,
          column: match.index,
          length: match[0].length,
          lineText: lineText.length > 400 ? `${lineText.slice(0, 400)}...` : lineText
        });
        if (match[0].length === 0) matcher.lastIndex += 1;
        if (matches.length >= remaining) break;
      }
    }
    return matches;
  }

  /** Breadth-first walk that skips ignored directories and symlinked folders. */
  async #collectFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const queue: string[] = [rootPath];

    while (queue.length > 0 && files.length < MAX_VISITED_FILES) {
      const current = queue.shift();
      if (current === undefined) break;

      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = join(current, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (IGNORED_DIRECTORIES.includes(entry.name)) continue;
          queue.push(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
          if (files.length >= MAX_VISITED_FILES) break;
        }
      }
    }

    return files;
  }
}
