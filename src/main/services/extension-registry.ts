import { readFile, writeFile, readdir, mkdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, sep } from 'node:path';
import { ExtensionError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { parseManifest, validateManifest } from './extension-manifest';
import type { ExtensionManifest, InstalledExtension } from '@shared/types';

const log = createLogger('extensions');

const MANIFEST_NAME = 'causeway.extension.json';
const ENABLEMENT_FILE = 'enabled.json';

/** A file inside a bundle may not be larger than this. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Nor may a bundle hold more files than this. */
const MAX_FILES = 200;

/**
 * A packaged extension.
 *
 * Deliberately a JSON document rather than a zip. Unpacking an archive is the
 * source of a whole family of path traversal bugs, and reading one needs a
 * dependency that ships with the installer. A bundle is a manifest and a map
 * of file name to text: every path is checked by the same code that checks
 * everything else, and there is nothing to decompress.
 *
 * The cost is that extensions are text only, which suits an editor extension
 * and rules out shipping a binary, which is the point.
 */
export interface ExtensionBundle {
  manifest: unknown;
  /** File contents by path, relative to the extension folder. */
  files: Record<string, string>;
}

/**
 * Manages what is installed.
 *
 * Owns one folder under the user's data directory. Nothing outside it is ever
 * written, and nothing inside it is ever executed by this class: running an
 * extension is the host's job, and keeping the two apart means the code that
 * unpacks a bundle has no way to run one.
 */
export class ExtensionRegistry {
  readonly root: string;
  #enabled = new Map<string, boolean>();
  #loaded = false;

  constructor(root: string) {
    this.root = root;
  }

  /* ------------------------------------------------------------------ */
  /* Reading                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Everything installed, with its status.
   *
   * An extension whose manifest no longer parses is reported as failed rather
   * than hidden, because an extension that silently disappears is the kind of
   * thing people spend an afternoon on.
   */
  async list(): Promise<InstalledExtension[]> {
    await this.#loadEnablement();

    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch {
      // No folder yet simply means nothing is installed.
      return [];
    }

    const installed: InstalledExtension[] = [];

    for (const entry of entries) {
      const path = join(this.root, entry);

      try {
        if (!(await stat(path)).isDirectory()) continue;
      } catch {
        continue;
      }

      try {
        const manifest = parseManifest(await readFile(join(path, MANIFEST_NAME), 'utf8'), `${entry}/${MANIFEST_NAME}`);

        if (manifest.id !== entry) {
          throw new ExtensionError({
            code: 'EXTENSION_ID_MISMATCH',
            message: 'An extension folder does not match its id',
            cause: `The folder is named ${entry} but the manifest declares ${manifest.id}. One extension could then shadow another by folder name alone.`,
            solution: `Rename the folder to ${manifest.id}, or reinstall the extension.`
          });
        }

        installed.push({
          manifest,
          path,
          status: this.#enabled.get(manifest.id) === false ? 'disabled' : 'enabled'
        });
      } catch (error) {
        installed.push({
          manifest: placeholderManifest(entry),
          path,
          status: 'failed',
          failure: error instanceof Error ? error.message : String(error)
        });
        log.warn(`Extension ${entry} could not be read: ${String(error)}`);
      }
    }

    return installed.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  }

  /** The manifests of everything that should actually run. */
  async enabled(): Promise<InstalledExtension[]> {
    return (await this.list()).filter((entry) => entry.status === 'enabled');
  }

  /* ------------------------------------------------------------------ */
  /* Installing                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Writes a bundle into the extensions folder.
   *
   * The manifest is checked before a single file is written, and every path in
   * the bundle is resolved and confirmed to land inside the extension's own
   * folder. A bundle that fails either check leaves nothing behind.
   */
  async install(bundle: ExtensionBundle): Promise<ExtensionManifest> {
    const manifest = validateManifest(bundle.manifest, 'the downloaded bundle');
    const files = bundle.files ?? {};
    const names = Object.keys(files);

    if (names.length === 0) {
      throw new ExtensionError({
        code: 'EXTENSION_BUNDLE_EMPTY',
        message: `${manifest.id} contains no files`,
        cause: 'The bundle declared a manifest but carried nothing to install.',
        solution: 'Repackage the extension, or report it to its publisher.'
      });
    }

    if (names.length > MAX_FILES) {
      throw new ExtensionError({
        code: 'EXTENSION_BUNDLE_TOO_LARGE',
        message: `${manifest.id} has too many files`,
        cause: `The bundle holds ${names.length} files, and the limit is ${MAX_FILES}.`,
        solution: 'Bundle the extension rather than shipping its sources, or report it to its publisher.'
      });
    }

    const target = join(this.root, manifest.id);

    // Every path is resolved against the target and checked before anything is
    // created, so a bundle cannot write outside its own folder.
    for (const name of names) {
      const destination = resolve(target, name);
      if (destination !== target && !destination.startsWith(target + sep)) {
        throw new ExtensionError({
          code: 'EXTENSION_BUNDLE_ESCAPES',
          message: `${manifest.id} tried to write outside its own folder`,
          cause: `The bundle contains the path "${name}", which resolves to ${destination}, outside ${target}.`,
          solution: 'Do not install this extension. Report it to whoever published it, and to the registry it came from.'
        });
      }

      const size = Buffer.byteLength(files[name] ?? '', 'utf8');
      if (size > MAX_FILE_BYTES) {
        throw new ExtensionError({
          code: 'EXTENSION_FILE_TOO_LARGE',
          message: `${manifest.id} contains a file that is too large`,
          cause: `"${name}" is ${size} bytes, and the limit for one file is ${MAX_FILE_BYTES}.`,
          solution: 'Report it to the publisher. An editor extension has no reason to ship a file this size.'
        });
      }
    }

    if (manifest.main !== undefined && files[manifest.main] === undefined) {
      throw new ExtensionError({
        code: 'EXTENSION_MAIN_MISSING',
        message: `${manifest.id} is missing its entry file`,
        cause: `The manifest names "${manifest.main}" as the entry point, and the bundle does not contain it.`,
        solution: 'Repackage the extension with its entry file included.'
      });
    }

    // A reinstall replaces rather than merges, so a file removed in the new
    // version does not survive from the old one.
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });

    for (const name of names) {
      const destination = resolve(target, name);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, files[name] ?? '', 'utf8');
    }

    await writeFile(join(target, MANIFEST_NAME), JSON.stringify(bundle.manifest, null, 2), 'utf8');

    log.info(`Installed ${manifest.id} ${manifest.version}`);
    return manifest;
  }

  /** Removes an extension and forgets whether it was enabled. */
  async uninstall(id: string): Promise<void> {
    const target = this.#folderFor(id);
    await rm(target, { recursive: true, force: true });

    await this.#loadEnablement();
    this.#enabled.delete(id);
    await this.#saveEnablement();

    log.info(`Uninstalled ${id}`);
  }

  /** Turns an extension on or off without removing it. */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    // Confirms the extension exists, so enabling a typo fails loudly.
    this.#folderFor(id);
    await stat(this.#folderFor(id)).catch(() => {
      throw new ExtensionError({
        code: 'EXTENSION_NOT_INSTALLED',
        message: `${id} is not installed`,
        cause: 'There is no folder for it under the extensions directory.',
        solution: 'Install it first, or refresh the Extensions panel if it was removed outside the editor.'
      });
    });

    await this.#loadEnablement();
    this.#enabled.set(id, enabled);
    await this.#saveEnablement();
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  /** Resolves an extension folder, refusing an id that escapes the root. */
  #folderFor(id: string): string {
    const target = resolve(this.root, id);

    if (!target.startsWith(resolve(this.root) + sep)) {
      throw new ExtensionError({
        code: 'EXTENSION_BAD_ID',
        message: 'That extension id cannot be used',
        cause: `"${id}" resolves to ${target}, which is outside the extensions folder.`,
        solution: 'Use the id exactly as the Extensions panel shows it.'
      });
    }

    return target;
  }

  async #loadEnablement(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;

    try {
      const raw = JSON.parse(await readFile(join(this.root, ENABLEMENT_FILE), 'utf8')) as Record<
        string,
        boolean
      >;
      for (const [id, value] of Object.entries(raw)) this.#enabled.set(id, value === true);
    } catch {
      // No file yet: everything installed counts as enabled.
    }
  }

  async #saveEnablement(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(
      join(this.root, ENABLEMENT_FILE),
      JSON.stringify(Object.fromEntries(this.#enabled), null, 2),
      'utf8'
    );
  }
}

/** Stands in for a manifest that could not be read, so the panel can show it. */
function placeholderManifest(folder: string): ExtensionManifest {
  return {
    id: folder,
    name: folder,
    version: '0.0.0',
    publisher: 'unknown',
    description: 'This extension could not be read.',
    permissions: [],
    contributes: {}
  };
}

/** SHA-256 of a bundle's text, hex encoded, for verifying a download. */
export function hashBundle(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
