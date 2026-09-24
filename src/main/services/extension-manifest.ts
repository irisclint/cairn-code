import { ExtensionError } from '@shared/errors';
import {
  EXTENSION_PERMISSIONS,
  type ExtensionManifest,
  type ExtensionPermission
} from '@shared/types';

/**
 * Reads and checks an extension manifest.
 *
 * Everything here runs before a single line of extension code does, so it is
 * the last point at which a bad extension can be turned away cheaply. It is
 * deliberately strict: an unknown permission is refused rather than ignored,
 * because ignoring it would mean installing something whose manifest claims
 * more than the editor understood.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMMAND_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Parses the manifest text and checks every field. */
export function parseManifest(text: string, source: string): ExtensionManifest {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ExtensionError({
      code: 'EXTENSION_MANIFEST_INVALID_JSON',
      message: 'The extension manifest is not valid JSON',
      cause: `${source} could not be parsed: ${String(error)}`,
      solution: 'Open the file and fix the syntax. The position in the message above is where the parser gave up.'
    });
  }

  return validateManifest(raw, source);
}

/** Checks an already-parsed manifest. Exported for the marketplace client. */
export function validateManifest(raw: unknown, source: string): ExtensionManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw fail(source, 'the manifest is not a JSON object', 'Wrap the fields in { } at the top level.');
  }

  const record = raw as Record<string, unknown>;

  const id = requireString(record, 'id', source);
  if (!ID_PATTERN.test(id)) {
    throw fail(
      source,
      `the id "${id}" is not in publisher.name form`,
      'Use lowercase letters, digits and hyphens, with exactly one dot between the publisher and the name, as in acme.hello-world.'
    );
  }

  const version = requireString(record, 'version', source);
  if (!VERSION_PATTERN.test(version)) {
    throw fail(
      source,
      `the version "${version}" is not a semantic version`,
      'Write three numbers separated by dots, as in 1.0.0, optionally followed by a pre-release such as 1.0.0-beta.1.'
    );
  }

  const publisher = requireString(record, 'publisher', source);
  if (!id.startsWith(publisher + '.')) {
    throw fail(
      source,
      `the id "${id}" does not begin with the publisher "${publisher}"`,
      'Make the id publisher.name, so that one publisher can never claim another publisher\'s identifier.'
    );
  }

  const manifest: ExtensionManifest = {
    id,
    version,
    publisher,
    name: requireString(record, 'name', source),
    description: requireString(record, 'description', source),
    permissions: readPermissions(record['permissions'], source),
    contributes: readContributions(record['contributes'], source)
  };

  const main = record['main'];
  if (main !== undefined) {
    if (typeof main !== 'string' || main.trim().length === 0) {
      throw fail(source, '"main" is present but is not a file name', 'Remove it, or point it at the entry file relative to the extension folder.');
    }
    if (main.includes('..') || main.startsWith('/') || /^[A-Za-z]:/.test(main)) {
      throw fail(
        source,
        `"main" points outside the extension folder: ${main}`,
        'Use a path relative to the extension folder, with no leading slash, no drive letter and no ".." segments.'
      );
    }
    manifest.main = main;
  }

  // Code needs a permission to be worth granting; a manifest that asks for
  // permissions and then runs nothing is either a mistake or a probe.
  if (manifest.main === undefined && manifest.permissions.length > 0) {
    throw fail(
      source,
      'the manifest asks for permissions but has no code to use them',
      'Add "main" pointing at the entry file, or remove the permissions if this extension only contributes data.'
    );
  }

  return manifest;
}

/* -------------------------------------------------------------------------- */

function readPermissions(raw: unknown, source: string): ExtensionPermission[] {
  if (raw === undefined) return [];

  if (!Array.isArray(raw)) {
    throw fail(source, '"permissions" is not a list', 'Write it as an array, for example ["commands", "notifications"].');
  }

  const permissions: ExtensionPermission[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string' || !isPermission(entry)) {
      throw fail(
        source,
        `"${String(entry)}" is not a permission cairn-code knows`,
        `The permissions that exist are: ${EXTENSION_PERMISSIONS.join(', ')}. An unknown one is refused rather than ignored, because ignoring it would install an extension whose manifest claims more than the editor understood.`
      );
    }
    // Duplicates are harmless, but keeping the list unique means the consent
    // prompt never shows the same line twice.
    if (!permissions.includes(entry)) permissions.push(entry);
  }

  return permissions;
}

function isPermission(value: string): value is ExtensionPermission {
  return (EXTENSION_PERMISSIONS as readonly string[]).includes(value);
}

function readContributions(raw: unknown, source: string): ExtensionManifest['contributes'] {
  if (raw === undefined) return {};

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw fail(source, '"contributes" is not an object', 'Write it as { "commands": [...] }, or leave it out.');
  }

  const record = raw as Record<string, unknown>;
  const contributes: ExtensionManifest['contributes'] = {};

  if (record['commands'] !== undefined) {
    if (!Array.isArray(record['commands'])) {
      throw fail(source, '"contributes.commands" is not a list', 'Write it as an array of { "id", "title" } objects.');
    }

    contributes.commands = record['commands'].map((entry, index) => {
      const command = entry as Record<string, unknown>;
      const id = command?.['id'];
      const title = command?.['title'];

      if (typeof id !== 'string' || !COMMAND_PATTERN.test(id)) {
        throw fail(
          source,
          `command ${index + 1} has no usable id`,
          'Give each command an id of letters, digits, dots, dashes or underscores, as in hello.say.'
        );
      }
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw fail(
          source,
          `command "${id}" has no title`,
          'Add a title; it is the text the Command Palette shows, so an empty one is invisible.'
        );
      }

      return { id, title };
    });
  }

  if (record['diagnosticExplanations'] !== undefined) {
    if (!Array.isArray(record['diagnosticExplanations'])) {
      throw fail(
        source,
        '"contributes.diagnosticExplanations" is not a list',
        'Write it as an array of { "code", "cause", "solution" } objects.'
      );
    }

    contributes.diagnosticExplanations = record['diagnosticExplanations'].map((entry, index) => {
      const explanation = entry as Record<string, unknown>;
      const code = explanation?.['code'];
      const cause = explanation?.['cause'];
      const solution = explanation?.['solution'];

      if (typeof code !== 'string' || code.trim().length === 0) {
        throw fail(source, `explanation ${index + 1} has no code`, 'Name the compiler code or lint rule it explains, as in TS2532.');
      }

      // The rule the whole product is built on applies to contributions too:
      // an explanation without both halves is not an explanation.
      if (typeof cause !== 'string' || cause.trim().length === 0) {
        throw fail(
          source,
          `the explanation for ${code} has no cause`,
          'Say why the problem happens. An explanation with only a fix tells the reader what to type without telling them what went wrong.'
        );
      }
      if (typeof solution !== 'string' || solution.trim().length === 0) {
        throw fail(
          source,
          `the explanation for ${code} has no solution`,
          'Say what to change. An explanation with only a cause leaves the reader exactly where they started.'
        );
      }

      const url = explanation?.['documentationUrl'];
      return {
        code,
        cause,
        solution,
        ...(typeof url === 'string' && url.length > 0 ? { documentationUrl: url } : {})
      };
    });
  }

  return contributes;
}

function requireString(record: Record<string, unknown>, field: string, source: string): string {
  const value = record[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw fail(source, `"${field}" is missing or empty`, `Add a "${field}" field with a non-empty string value.`);
  }

  return value;
}

function fail(source: string, cause: string, solution: string): ExtensionError {
  return new ExtensionError({
    code: 'EXTENSION_MANIFEST_INVALID',
    message: 'The extension manifest was refused',
    cause: `In ${source}, ${cause}.`,
    solution
  });
}
