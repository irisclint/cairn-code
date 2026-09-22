import { app, shell } from 'electron';
import { writeFile, mkdir, access, symlink, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { APP_NAME } from '@shared/constants';
import { CairnError } from '@shared/errors';
import { createLogger } from '@shared/logger';

const log = createLogger('shortcut');

export interface ShortcutState {
  /** True when a desktop shortcut already exists. */
  exists: boolean;
  /** Where the shortcut is, or would be created. */
  path: string;
  /**
   * False when the running build manages its own shortcuts, so offering to
   * create one would duplicate what the installer already did.
   */
  canCreate: boolean;
  /** Why creation is unavailable, when it is. */
  reason?: string;
}

/**
 * Creates the desktop shortcut that launches cairn-code.
 *
 * The platform installers cover the common case: the Windows installer writes
 * a desktop and Start menu entry, the macOS disk image offers the Applications
 * folder, and the deb and rpm packages register a desktop entry. None of that
 * happens for the portable Windows zip, for an AppImage, or for anyone who
 * deleted the shortcut and wants it back, which is exactly when a person is
 * most likely to go looking for one.
 */
export class ShortcutService {
  /** Resolves the user's desktop directory. */
  #desktopDirectory(): string {
    try {
      return app.getPath('desktop');
    } catch {
      // getPath throws when the shell folder is not configured, which happens
      // on minimal Linux installs without a desktop environment.
      return join(homedir(), 'Desktop');
    }
  }

  /** The file the shortcut is written to on this platform. */
  #shortcutPath(): string {
    const desktop = this.#desktopDirectory();
    if (process.platform === 'win32') return join(desktop, `${APP_NAME}.lnk`);
    if (process.platform === 'darwin') return join(desktop, APP_NAME);
    return join(desktop, `${APP_NAME.toLowerCase()}.desktop`);
  }

  /**
   * The executable a shortcut should point at.
   *
   * In development this is the Electron binary running the project, which is
   * not a useful shortcut target, so creation is refused instead.
   */
  #target(): string {
    if (process.platform === 'darwin') {
      // execPath is inside the bundle; the shortcut has to point at the bundle.
      const match = /^(.*\.app)\//.exec(app.getPath('exe'));
      return match?.[1] ?? app.getPath('exe');
    }
    return app.getPath('exe');
  }

  async #exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Reports whether a shortcut exists and whether one can be created. */
  async getState(): Promise<ShortcutState> {
    const path = this.#shortcutPath();
    const exists = await this.#exists(path);

    if (!app.isPackaged) {
      return {
        exists,
        path,
        canCreate: false,
        reason:
          'A shortcut would point at the Electron binary used for development rather than at an installed application.'
      };
    }

    return { exists, path, canCreate: true };
  }

  /**
   * Creates the desktop shortcut, replacing an existing one.
   *
   * Returns the path it wrote, so the caller can name it in a confirmation.
   */
  async create(): Promise<string> {
    const state = await this.getState();

    if (!state.canCreate) {
      throw new CairnError({
        code: 'SHORTCUT_UNAVAILABLE',
        message: 'A desktop shortcut cannot be created for this build',
        cause: state.reason ?? 'The running build does not support shortcut creation.',
        solution: 'Install cairn-code with the installer for your platform, then try again.'
      });
    }

    const path = state.path;
    const target = this.#target();

    try {
      await mkdir(dirname(path), { recursive: true });

      if (process.platform === 'win32') {
        this.#createWindowsShortcut(path, target);
      } else if (process.platform === 'darwin') {
        await this.#createMacAlias(path, target);
      } else {
        await this.#createLinuxEntry(path, target);
      }
    } catch (error) {
      if (error instanceof CairnError) throw error;
      throw new CairnError({
        code: 'SHORTCUT_FAILED',
        message: 'Could not create the desktop shortcut',
        cause: `Writing ${path} failed: ${String(error)}`,
        solution:
          'Check that your desktop folder exists and is writable, then try again from the Command Palette.',
        original: error
      });
    }

    log.info(`Created desktop shortcut at ${path}`);
    return path;
  }

  #createWindowsShortcut(path: string, target: string): void {
    const created = shell.writeShortcutLink(path, 'create', {
      target,
      // Launching from the executable's own folder keeps relative paths sane.
      cwd: dirname(target),
      icon: target,
      iconIndex: 0,
      description: `${APP_NAME} code editor`,
      appUserModelId: 'dev.cairn.editor'
    });

    if (!created) {
      throw new CairnError({
        code: 'SHORTCUT_FAILED',
        message: 'Windows refused to write the shortcut',
        cause: 'The shell reported that the shortcut file could not be created.',
        solution: 'Check that your Desktop folder is writable and not managed by a policy.'
      });
    }
  }

  /** A desktop alias on macOS is a symbolic link to the application bundle. */
  async #createMacAlias(path: string, target: string): Promise<void> {
    if (await this.#exists(path)) await unlink(path);
    await symlink(target, path, 'dir');
  }

  /**
   * Writes a freedesktop .desktop entry.
   *
   * The file goes on the desktop and into the applications directory, so the
   * entry also appears in the launcher, which is where most people look before
   * they look at the desktop.
   */
  async #createLinuxEntry(path: string, target: string): Promise<void> {
    const iconPath = join(process.resourcesPath ?? '', 'icons', 'cairn-logo-512.png');
    const icon = (await this.#exists(iconPath)) ? iconPath : 'cairn';

    const entry = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${APP_NAME}`,
      'GenericName=Code Editor',
      'Comment=A code editor that explains its errors',
      // The path is quoted so an install directory containing a space works.
      `Exec="${target}" %U`,
      `Icon=${icon}`,
      'Terminal=false',
      'Categories=Development;IDE;TextEditor;',
      'MimeType=text/plain;inode/directory;',
      `StartupWMClass=${APP_NAME}`,
      'Keywords=editor;code;programming;',
      ''
    ].join('\n');

    // 0o755: a desktop entry has to be executable before a file manager will
    // treat it as a launcher rather than as a text file.
    await writeFile(path, entry, { encoding: 'utf8', mode: 0o755 });

    const applications = join(homedir(), '.local', 'share', 'applications');
    try {
      await mkdir(applications, { recursive: true });
      await writeFile(join(applications, 'cairn.desktop'), entry, { encoding: 'utf8', mode: 0o755 });
    } catch (error) {
      // The desktop entry is the part the user asked for; the launcher entry is
      // a bonus, and failing to write it must not fail the whole operation.
      log.warn(`Could not register the launcher entry: ${String(error)}`);
    }
  }

  /** Removes the desktop shortcut, if there is one. */
  async remove(): Promise<boolean> {
    const path = this.#shortcutPath();
    if (!(await this.#exists(path))) return false;

    try {
      await unlink(path);
      log.info(`Removed desktop shortcut at ${path}`);
      return true;
    } catch (error) {
      throw new CairnError({
        code: 'SHORTCUT_REMOVE_FAILED',
        message: 'Could not remove the desktop shortcut',
        cause: `Deleting ${path} failed: ${String(error)}`,
        solution: 'Delete the shortcut from your desktop by hand.',
        original: error
      });
    }
  }
}
