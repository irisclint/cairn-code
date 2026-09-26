import { readFile, writeFile, readdir, stat, lstat, mkdir, rename, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, basename } from 'node:path';
import type { DirectoryEntry, FileContent, FileStat } from '@shared/types';
import { LARGE_FILE_THRESHOLD_BYTES, MAX_FILE_SIZE_BYTES, IGNORED_DIRECTORIES } from '@shared/constants';
import { FileSystemError, fileSystemErrorFor } from '@shared/errors';

/**
 * All filesystem access of the application.
 *
 * The renderer never touches `node:fs` directly; it goes through IPC into this
 * service so that every path can be validated in one place.
 */
export class FileSystemService {
  async readFile(path: string): Promise<FileContent> {
    let stats;
    try {
      stats = await stat(path);
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }

    if (stats.isDirectory()) {
      throw new FileSystemError({
        code: 'FS_EISDIR',
        message: `Expected a file but found a folder: ${path}`,
        cause: 'The selected entry is a directory, which has no text content.',
        solution: 'Expand the folder in the explorer and open one of the files inside it.'
      });
    }

    if (stats.size > MAX_FILE_SIZE_BYTES) {
      throw new FileSystemError({
        code: 'FS_TOO_LARGE',
        message: `File is too large to open: ${basename(path)}`,
        cause: `The file is ${stats.size} bytes, above the ${MAX_FILE_SIZE_BYTES} byte limit causeway can hold in memory.`,
        solution: 'Open the file with a streaming viewer, or split it before editing.'
      });
    }

    try {
      const content = await readFile(path, 'utf8');
      return {
        path,
        content,
        encoding: 'utf8',
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        isLarge: stats.size > LARGE_FILE_THRESHOLD_BYTES
      };
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  async writeFile(path: string, content: string): Promise<FileStat> {
    try {
      await writeFile(path, content, 'utf8');
      return await this.stat(path);
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const stats = await lstat(path);
      return {
        path,
        name: basename(path),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        size: stats.size,
        modifiedAt: stats.mtimeMs
      };
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  /**
   * Lists one directory level. Children are loaded lazily by the explorer so
   * that opening a repository with a deep tree stays instant.
   */
  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }

    const results: DirectoryEntry[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.includes(entry.name)) continue;
      const fullPath = join(path, entry.name);
      try {
        const stats = await lstat(fullPath);
        results.push({
          path: fullPath,
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isSymbolicLink: entry.isSymbolicLink(),
          size: stats.size,
          modifiedAt: stats.mtimeMs
        });
      } catch {
        // A file can vanish between readdir and lstat; skipping it is correct.
      }
    }

    return results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  async createFile(path: string): Promise<FileStat> {
    if (await this.exists(path)) {
      throw new FileSystemError({
        code: 'FS_EEXIST',
        message: `A file named ${basename(path)} already exists`,
        cause: 'Another entry in this folder already uses that name.',
        solution: 'Pick a different name, or open the existing file instead.'
      });
    }
    try {
      await writeFile(path, '', { encoding: 'utf8', flag: 'wx' });
      return await this.stat(path);
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  async createDirectory(path: string): Promise<FileStat> {
    try {
      await mkdir(path, { recursive: true });
      return await this.stat(path);
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  async rename(from: string, to: string): Promise<FileStat> {
    if (await this.exists(to)) {
      throw new FileSystemError({
        code: 'FS_EEXIST',
        message: `Cannot rename to ${basename(to)} because that name is taken`,
        cause: 'An entry with the target name already exists in this folder.',
        solution: 'Choose a name that is not in use, or remove the existing entry first.'
      });
    }
    try {
      await rename(from, to);
      return await this.stat(to);
    } catch (error) {
      throw fileSystemErrorFor(error, from);
    }
  }

  async delete(path: string): Promise<void> {
    try {
      await rm(path, { recursive: true, force: false });
    } catch (error) {
      throw fileSystemErrorFor(error, path);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
