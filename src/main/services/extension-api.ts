import { resolve, sep } from 'node:path';
import { ExtensionError } from '@shared/errors';
import {
  PERMISSION_DESCRIPTIONS,
  type ExtensionManifest,
  type ExtensionPermission
} from '@shared/types';

/**
 * The gate every extension call passes through.
 *
 * The sandbox stops an extension reaching the system directly; this decides
 * what it may ask the editor to do on its behalf. The two are separate on
 * purpose: a hole in one is not a hole in the other.
 *
 * Every method is listed here with the single permission it needs. A method
 * that is not in the table does not exist, so adding a capability means adding
 * a row, in front of a reviewer, rather than as a side effect of some other
 * change.
 */

/** What the gate needs from the rest of the application. */
export interface ExtensionCapabilities {
  /** The open folder, or null when none is. */
  workspaceRoot: () => string | null;
  readFile: (absolutePath: string) => Promise<string>;
  writeFile: (absolutePath: string, text: string) => Promise<void>;
  listFiles: (absoluteDirectory: string) => Promise<string[]>;
  notify: (notification: {
    severity: string;
    message: string;
    cause: string;
    solution: string;
  }) => void;
  registerCommand: (extensionId: string, commandId: string, title: string) => void;
  addExplanation: (explanation: {
    code: string;
    cause: string;
    solution: string;
    documentationUrl?: string;
  }) => void;
  // Async because Electron's clipboard is: it was aligned with the W3C API,
  // which is promise based.
  readClipboard: () => string | Promise<string>;
  writeClipboard: (text: string) => void | Promise<void>;
  /** True when a command id already belongs to the editor itself. */
  isBuiltInCommand: (commandId: string) => boolean;
}

/** Which permission each method needs. The table is the API surface. */
const REQUIRED: Record<string, ExtensionPermission> = {
  'commands.register': 'commands',
  'notifications.show': 'notifications',
  'workspace.readFile': 'workspace.read',
  'workspace.listFiles': 'workspace.read',
  'workspace.writeFile': 'workspace.write',
  'diagnostics.explain': 'diagnostics',
  'clipboard.read': 'clipboard',
  'clipboard.write': 'clipboard'
};

export class ExtensionApi {
  #capabilities: ExtensionCapabilities;

  constructor(capabilities: ExtensionCapabilities) {
    this.#capabilities = capabilities;
  }

  /** Every method an extension may call, for documentation and for tests. */
  static methods(): string[] {
    return Object.keys(REQUIRED).sort();
  }

  /**
   * Runs one call on behalf of one extension.
   *
   * Refusals carry the permission that was missing and the line to add, so a
   * developer whose extension is refused can fix it without guessing.
   */
  async call(manifest: ExtensionManifest, method: string, args: unknown[]): Promise<unknown> {
    const required = REQUIRED[method];

    if (required === undefined) {
      throw new ExtensionError({
        code: 'EXTENSION_UNKNOWN_METHOD',
        message: `${manifest.id} called a method that does not exist`,
        cause: `There is no extension API called "${method}".`,
        solution: `The methods that exist are: ${ExtensionApi.methods().join(', ')}.`
      });
    }

    if (!manifest.permissions.includes(required)) {
      throw new ExtensionError({
        code: 'EXTENSION_PERMISSION_DENIED',
        message: `${manifest.id} is not allowed to do that`,
        cause: `Calling ${method} needs the "${required}" permission, which lets an extension ${PERMISSION_DESCRIPTIONS[required].toLowerCase()}. ${manifest.id} did not ask for it.`,
        solution: `Add "${required}" to the permissions list in the extension manifest, and tell the user why it is needed. The user sees the list before installing.`
      });
    }

    switch (method) {
      case 'commands.register':
        return this.#registerCommand(manifest, args);
      case 'notifications.show':
        return this.#notify(manifest, args);
      case 'workspace.readFile':
        return this.#readFile(manifest, args);
      case 'workspace.listFiles':
        return this.#listFiles(manifest, args);
      case 'workspace.writeFile':
        return this.#writeFile(manifest, args);
      case 'diagnostics.explain':
        return this.#explain(manifest, args);
      case 'clipboard.read':
        return await this.#capabilities.readClipboard();
      case 'clipboard.write':
        return await this.#capabilities.writeClipboard(text(manifest, args[0], 'the text to copy'));
      default:
        // Unreachable: the table above is the only way in.
        throw new ExtensionError({
          code: 'EXTENSION_UNKNOWN_METHOD',
          message: `${manifest.id} called a method that does not exist`,
          cause: `"${method}" is listed as a permission but has no implementation.`,
          solution: 'Report this as a defect in causeway; the table and the switch have drifted apart.'
        });
    }
  }

  /* ------------------------------------------------------------------ */

  /**
   * Registers a command.
   *
   * Only commands the manifest already declared, so that the list a user saw
   * before installing is the list that can appear in their palette. And never
   * one of the editor's own, so a shortcut cannot be taken over.
   */
  #registerCommand(manifest: ExtensionManifest, args: unknown[]): void {
    const id = text(manifest, args[0], 'the command id');
    const declared = manifest.contributes.commands?.find((command) => command.id === id);

    if (!declared) {
      throw new ExtensionError({
        code: 'EXTENSION_COMMAND_UNDECLARED',
        message: `${manifest.id} tried to register a command it did not declare`,
        cause: `"${id}" is not in contributes.commands, so nobody reviewing or installing this extension was shown it.`,
        solution: `Add { "id": "${id}", "title": "..." } to contributes.commands in the manifest.`
      });
    }

    if (this.#capabilities.isBuiltInCommand(id)) {
      throw new ExtensionError({
        code: 'EXTENSION_COMMAND_RESERVED',
        message: `${manifest.id} tried to take over a built-in command`,
        cause: `"${id}" is one of the editor's own commands, and replacing it would let an extension change what a familiar shortcut does.`,
        solution: `Choose an id of your own, such as "${manifest.id}.${id.split('.').pop() ?? 'action'}".`
      });
    }

    this.#capabilities.registerCommand(manifest.id, id, declared.title);
  }

  #notify(manifest: ExtensionManifest, args: unknown[]): void {
    const message = text(manifest, args[0], 'the message');
    const cause = typeof args[1] === 'string' ? args[1] : '';
    const solution = typeof args[2] === 'string' ? args[2] : '';

    this.#capabilities.notify({
      // Shown as coming from the extension, so a message is never mistaken for
      // one of the editor's own.
      severity: 'info',
      message: `${manifest.name}: ${message}`,
      cause,
      solution
    });
  }

  async #readFile(manifest: ExtensionManifest, args: unknown[]): Promise<string> {
    return this.#capabilities.readFile(this.#inWorkspace(manifest, args[0]));
  }

  async #listFiles(manifest: ExtensionManifest, args: unknown[]): Promise<string[]> {
    return this.#capabilities.listFiles(this.#inWorkspace(manifest, args[0]));
  }

  async #writeFile(manifest: ExtensionManifest, args: unknown[]): Promise<void> {
    const path = this.#inWorkspace(manifest, args[0]);
    await this.#capabilities.writeFile(path, text(manifest, args[1], 'the file contents'));
  }

  #explain(manifest: ExtensionManifest, args: unknown[]): void {
    const code = text(manifest, args[0], 'the diagnostic code');
    const cause = text(manifest, args[1], 'the cause');
    const solution = text(manifest, args[2], 'the solution');

    this.#capabilities.addExplanation({
      code,
      cause,
      solution,
      ...(typeof args[3] === 'string' && args[3].length > 0 ? { documentationUrl: args[3] } : {})
    });
  }

  /**
   * Turns a path from an extension into an absolute one inside the workspace.
   *
   * The permission grants access to the open folder, not to the disk, so a
   * path that resolves anywhere else is refused however it was written.
   */
  #inWorkspace(manifest: ExtensionManifest, raw: unknown): string {
    const root = this.#capabilities.workspaceRoot();

    if (!root) {
      throw new ExtensionError({
        code: 'EXTENSION_NO_WORKSPACE',
        message: `${manifest.id} asked for a file, and no folder is open`,
        cause: 'Workspace permissions apply to the open folder, and there is none.',
        solution: 'Open a folder first. An extension can check by handling this error.'
      });
    }

    const relative = text(manifest, raw, 'the file path');

    // Both sides are resolved before they are compared. Comparing against the
    // root as it was handed in would make the guard depend on how that string
    // happened to be written, which is not a property to rest a boundary on.
    const base = resolve(root);
    const target = resolve(base, relative);

    if (target !== base && !target.startsWith(base + sep)) {
      throw new ExtensionError({
        code: 'EXTENSION_PATH_ESCAPES',
        message: `${manifest.id} tried to reach outside the open folder`,
        cause: `"${relative}" resolves to ${target}, which is not inside ${base}. The workspace permission covers the open folder only.`,
        solution: 'Use a path relative to the workspace root, with no ".." segments and no drive letter.'
      });
    }

    return target;
  }
}

/** Reads a string argument, refusing anything else with the same shape of message. */
function text(manifest: ExtensionManifest, value: unknown, what: string): string {
  if (typeof value === 'string' && value.length > 0) return value;

  throw new ExtensionError({
    code: 'EXTENSION_BAD_ARGUMENT',
    message: `${manifest.id} called the API with a bad argument`,
    cause: `${what} has to be a non-empty string, and ${describe(value)} arrived instead.`,
    solution: 'Check the argument before calling. The extension API never coerces, because a silent coercion hides the mistake.'
  });
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'nothing';
  if (typeof value === 'string') return 'an empty string';
  return `a ${typeof value}`;
}
