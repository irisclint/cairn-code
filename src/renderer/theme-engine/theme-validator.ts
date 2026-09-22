import {
  ANSI_COLOR_KEYS,
  REQUIRED_COLOR_KEYS,
  type Theme,
  type ThemeValidationIssue,
  type ThemeValidationResult,
  type ThemeType
} from './types';

const VALID_TYPES: readonly ThemeType[] = ['dark', 'light', 'high-contrast-dark', 'high-contrast-light'];

/** Matches #rgb, #rrggbb and #rrggbbaa. */
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** True when the value is a hex colour cairn-code can parse. */
export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_PATTERN.test(value);
}

/**
 * Checks a theme before it is applied.
 *
 * A broken theme must never leave the user with an unreadable window, so the
 * loader validates first and refuses to apply anything with errors. Every issue
 * carries a cause and a solution, matching the diagnostic contract used for
 * code problems.
 */
export function validateTheme(candidate: unknown): ThemeValidationResult {
  const issues: ThemeValidationIssue[] = [];

  if (typeof candidate !== 'object' || candidate === null) {
    return {
      valid: false,
      issues: [
        {
          key: '$root',
          message: 'The theme is not a JSON object',
          cause: 'The file content parsed to a value that is not an object.',
          solution: 'Make sure the theme file contains a single JSON object with an "id" and "colors" field.'
        }
      ]
    };
  }

  const theme = candidate as Partial<Theme>;

  if (typeof theme.id !== 'string' || theme.id.trim().length === 0) {
    issues.push({
      key: 'id',
      message: 'The theme has no id',
      cause: 'The "id" field is missing or empty.',
      solution: 'Add a unique kebab-case id, for example "my-theme".'
    });
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(theme.id)) {
    issues.push({
      key: 'id',
      message: `The theme id "${theme.id}" is not kebab-case`,
      cause:
        'Theme ids are used in CSS selectors and file names, so they are restricted to lowercase and dashes.',
      solution: 'Rename the id to lowercase letters, digits and single dashes, for example "midnight-violet".'
    });
  }

  if (typeof theme.name !== 'string' || theme.name.trim().length === 0) {
    issues.push({
      key: 'name',
      message: 'The theme has no display name',
      cause: 'The "name" field is missing or empty.',
      solution: 'Add a human readable name, for example "Midnight Violet".'
    });
  }

  if (typeof theme.type !== 'string' || !VALID_TYPES.includes(theme.type as ThemeType)) {
    issues.push({
      key: 'type',
      message: `The theme type ${String(theme.type)} is not supported`,
      cause: 'The "type" field decides the base contrast and must be one of the four known values.',
      solution: `Set "type" to one of: ${VALID_TYPES.join(', ')}.`
    });
  }

  if (typeof theme.colors !== 'object' || theme.colors === null) {
    issues.push({
      key: 'colors',
      message: 'The theme has no colors object',
      cause: 'The "colors" field is missing, so no workbench colour can be resolved.',
      solution: 'Add a "colors" object with at least the required keys listed in docs/api/theme-api.md.'
    });
    return { valid: false, issues };
  }

  const colors = theme.colors;

  for (const key of REQUIRED_COLOR_KEYS) {
    const value = colors[key];
    if (value === undefined) {
      issues.push({
        key,
        message: `Required colour "${key}" is missing`,
        cause:
          'cairn-code has no safe default for this surface, so leaving it out would make part of the UI invisible.',
        solution: `Add "${key}" to the colors object with a hex value such as "#1e1e1e".`
      });
    } else if (!isValidColor(value)) {
      issues.push({
        key,
        message: `Colour "${key}" has the invalid value ${String(value)}`,
        cause: 'Only hex colours in the form #rgb, #rrggbb or #rrggbbaa are supported.',
        solution: `Replace the value with a hex colour, for example "#1e1e1e".`
      });
    }
  }

  for (const [key, value] of Object.entries(colors)) {
    if (!isValidColor(value)) {
      const alreadyReported = issues.some((issue) => issue.key === key);
      if (!alreadyReported) {
        issues.push({
          key,
          message: `Colour "${key}" has the invalid value ${String(value)}`,
          cause: 'Only hex colours in the form #rgb, #rrggbb or #rrggbbaa are supported.',
          solution: 'Replace the value with a hex colour, or remove the key to inherit the default.'
        });
      }
    }
  }

  const missingAnsi = ANSI_COLOR_KEYS.filter((key) => colors[key] === undefined);
  if (missingAnsi.length > 0 && missingAnsi.length < ANSI_COLOR_KEYS.length) {
    issues.push({
      key: 'terminal.ansi*',
      message: `The ANSI palette is incomplete, ${missingAnsi.length} of 16 colours are missing`,
      cause: 'A partial ANSI palette makes terminal output mix theme colours with defaults.',
      solution: `Add the missing keys: ${missingAnsi.join(', ')}.`
    });
  }

  if (theme.tokenColors !== undefined && !Array.isArray(theme.tokenColors)) {
    issues.push({
      key: 'tokenColors',
      message: 'The tokenColors field is not an array',
      cause: 'Syntax rules are read as a list of scope to settings mappings.',
      solution: 'Wrap the rules in an array, or remove the field to use the defaults.'
    });
  }

  return { valid: issues.length === 0, issues };
}

/** Formats validation issues into a message suitable for a notification. */
export function formatValidationIssues(issues: ThemeValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.message}\n  Cause: ${issue.cause}\n  Fix: ${issue.solution}`)
    .join('\n\n');
}
