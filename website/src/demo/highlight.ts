/**
 * A small syntax highlighter for the live demo.
 *
 * The editor in the hero has to tokenize whatever the visitor types, on every
 * keystroke, so this is a hand written scanner rather than a grammar engine.
 * It covers what the demo languages actually contain and nothing more, which
 * keeps it at a few kilobytes instead of the few hundred a real tokenizer
 * costs.
 *
 * Tokens carry their offsets because the analyzer reports problems as column
 * ranges, and the renderer has to split a token to underline part of it.
 */

export type TokenKind =
  'keyword' | 'string' | 'number' | 'comment' | 'type' | 'function' | 'operator' | 'punct' | 'plain';

export interface Token {
  text: string;
  kind: TokenKind;
  /** Zero based offset of the first character within its line. */
  start: number;
  /** Zero based offset one past the last character. */
  end: number;
}

export type DemoLanguage = 'typescript' | 'javascript' | 'python';

const JS_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'new',
  'class',
  'extends',
  'super',
  'this',
  'typeof',
  'instanceof',
  'in',
  'of',
  'try',
  'catch',
  'finally',
  'throw',
  'switch',
  'case',
  'default',
  'import',
  'export',
  'from',
  'as',
  'async',
  'await',
  'yield',
  'delete',
  'void',
  'interface',
  'type',
  'enum',
  'implements',
  'public',
  'private',
  'protected',
  'readonly',
  'static',
  'abstract',
  'declare',
  'namespace',
  'true',
  'false',
  'null',
  'undefined',
  'debugger',
  'satisfies',
  'keyof',
  'infer'
]);

const JS_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'symbol',
  'bigint',
  'any',
  'unknown',
  'never',
  'Array',
  'Promise',
  'Record',
  'Map',
  'Set',
  'Date',
  'RegExp',
  'Error',
  'Partial',
  'Readonly'
]);

const PY_KEYWORDS = new Set([
  'def',
  'return',
  'if',
  'elif',
  'else',
  'for',
  'while',
  'break',
  'continue',
  'pass',
  'import',
  'from',
  'as',
  'class',
  'try',
  'except',
  'finally',
  'raise',
  'with',
  'lambda',
  'global',
  'nonlocal',
  'assert',
  'del',
  'yield',
  'async',
  'await',
  'and',
  'or',
  'not',
  'is',
  'in',
  'True',
  'False',
  'None',
  'self',
  'match',
  'case'
]);

const PY_TYPES = new Set(['int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'bytes']);

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const OPERATOR_CHARS = '+-*/%=<>!&|^~?:';
const PUNCT_CHARS = '()[]{};,.';

/**
 * Carried between lines, because a block comment or a triple quoted string
 * does not end where the line does.
 */
export interface ScanState {
  inBlockComment: boolean;
  /** The delimiter of an open triple quoted Python string, when one is open. */
  inTripleQuote: string | null;
}

export function initialState(): ScanState {
  return { inBlockComment: false, inTripleQuote: null };
}

/** Tokenizes one line, advancing the state that spans lines. */
export function tokenizeLine(line: string, language: DemoLanguage, state: ScanState): Token[] {
  return language === 'python' ? scanPython(line, state) : scanJs(line, state);
}

function push(tokens: Token[], text: string, kind: TokenKind, start: number): void {
  if (text.length > 0) tokens.push({ text, kind, start, end: start + text.length });
}

function scanJs(line: string, state: ScanState): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (state.inBlockComment) {
      const close = line.indexOf('*/', i);
      const end = close === -1 ? line.length : close + 2;
      push(tokens, line.slice(i, end), 'comment', i);
      state.inBlockComment = close === -1;
      i = end;
      continue;
    }

    const char = line[i] as string;

    if (char === '/' && line[i + 1] === '/') {
      push(tokens, line.slice(i), 'comment', i);
      break;
    }

    if (char === '/' && line[i + 1] === '*') {
      const close = line.indexOf('*/', i + 2);
      const end = close === -1 ? line.length : close + 2;
      push(tokens, line.slice(i, end), 'comment', i);
      state.inBlockComment = close === -1;
      i = end;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const end = scanStringBody(line, i, char);
      push(tokens, line.slice(i, end), 'string', i);
      i = end;
      continue;
    }

    if (DIGIT.test(char)) {
      let end = i;
      while (end < line.length && /[0-9._exXbo]/.test(line[end] as string)) end += 1;
      push(tokens, line.slice(i, end), 'number', i);
      i = end;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let end = i;
      while (end < line.length && IDENTIFIER_PART.test(line[end] as string)) end += 1;
      const word = line.slice(i, end);

      let kind: TokenKind = 'plain';
      if (JS_KEYWORDS.has(word)) kind = 'keyword';
      else if (JS_TYPES.has(word) || /^[A-Z]/.test(word)) kind = 'type';
      else if (line[end] === '(') kind = 'function';

      push(tokens, word, kind, i);
      i = end;
      continue;
    }

    if (OPERATOR_CHARS.includes(char)) {
      let end = i;
      while (end < line.length && OPERATOR_CHARS.includes(line[end] as string)) end += 1;
      push(tokens, line.slice(i, end), 'operator', i);
      i = end;
      continue;
    }

    push(tokens, char, PUNCT_CHARS.includes(char) ? 'punct' : 'plain', i);
    i += 1;
  }

  return tokens;
}

function scanPython(line: string, state: ScanState): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (state.inTripleQuote) {
      const close = line.indexOf(state.inTripleQuote, i);
      const end = close === -1 ? line.length : close + 3;
      push(tokens, line.slice(i, end), 'string', i);
      if (close !== -1) state.inTripleQuote = null;
      i = end;
      continue;
    }

    const char = line[i] as string;

    if (char === '#') {
      push(tokens, line.slice(i), 'comment', i);
      break;
    }

    const triple = line.slice(i, i + 3);
    if (triple === '"""' || triple === "'''") {
      const close = line.indexOf(triple, i + 3);
      const end = close === -1 ? line.length : close + 3;
      push(tokens, line.slice(i, end), 'string', i);
      state.inTripleQuote = close === -1 ? triple : null;
      i = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = scanStringBody(line, i, char);
      push(tokens, line.slice(i, end), 'string', i);
      i = end;
      continue;
    }

    if (DIGIT.test(char)) {
      let end = i;
      while (end < line.length && /[0-9._exXbo]/.test(line[end] as string)) end += 1;
      push(tokens, line.slice(i, end), 'number', i);
      i = end;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let end = i;
      while (end < line.length && IDENTIFIER_PART.test(line[end] as string)) end += 1;
      const word = line.slice(i, end);

      let kind: TokenKind = 'plain';
      if (PY_KEYWORDS.has(word)) kind = 'keyword';
      else if (PY_TYPES.has(word) || /^[A-Z]/.test(word)) kind = 'type';
      else if (line[end] === '(') kind = 'function';

      push(tokens, word, kind, i);
      i = end;
      continue;
    }

    if (OPERATOR_CHARS.includes(char)) {
      let end = i;
      while (end < line.length && OPERATOR_CHARS.includes(line[end] as string)) end += 1;
      push(tokens, line.slice(i, end), 'operator', i);
      i = end;
      continue;
    }

    push(tokens, char, PUNCT_CHARS.includes(char) ? 'punct' : 'plain', i);
    i += 1;
  }

  return tokens;
}

/** Returns the offset one past the closing quote, or the end of the line. */
function scanStringBody(line: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < line.length) {
    const char = line[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === quote) return i + 1;
    i += 1;
  }
  return line.length;
}

/**
 * Replaces the contents of strings and comments with spaces, keeping every
 * offset intact.
 *
 * The analyzer runs its patterns against this rather than the raw source, so
 * that a `==` inside a string literal or a `var` inside a comment cannot be
 * reported as a problem in code that does not contain one.
 */
export function maskLiterals(source: string, language: DemoLanguage): string[] {
  const state = initialState();

  return source.split('\n').map((line) => {
    const tokens = tokenizeLine(line, language, state);
    const masked = line.split('');

    for (const token of tokens) {
      if (token.kind !== 'string' && token.kind !== 'comment') continue;
      // The delimiters stay, so that a rule can still see that a value is a
      // string literal without being able to read what is inside it.
      const from = token.kind === 'string' ? token.start + 1 : token.start;
      const to = token.kind === 'string' ? Math.max(from, token.end - 1) : token.end;
      for (let index = from; index < to; index += 1) masked[index] = ' ';
    }

    return masked.join('');
  });
}
