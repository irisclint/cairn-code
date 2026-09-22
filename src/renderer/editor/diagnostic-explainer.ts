/**
 * Turns a raw tool diagnostic into an explanation the user can act on.
 *
 * Every entry answers two questions the underlying compiler does not:
 *   cause    - why this happened, in plain language
 *   solution - the concrete next action
 *
 * Entries are keyed by the diagnostic code. When no entry matches, the
 * heuristic pass derives an explanation from the message text, and the generic
 * fallback still produces something better than a bare compiler string. This is
 * the reason the cairn-code diagnostic contract requires both fields: a message like
 * "Type 'string' is not assignable to type 'number'" states a fact, it does not
 * tell a newcomer what to change.
 */

export interface Explanation {
  cause: string;
  solution: string;
  documentationUrl?: string;
}

interface ExplanationTemplate {
  cause: string | ((match: RegExpMatchArray | null, message: string) => string);
  solution: string | ((match: RegExpMatchArray | null, message: string) => string);
  /** Applied to the message to extract names quoted in the compiler output. */
  extract?: RegExp;
  documentationUrl?: string;
}

/** Pulls the first single-quoted identifier out of a compiler message. */
const QUOTED = /'([^']+)'/;

const TYPESCRIPT_EXPLANATIONS: Record<string, ExplanationTemplate> = {
  TS1002: {
    cause: 'A string literal was opened but never closed before the end of the line.',
    solution: 'Add the missing closing quote, or escape the quote inside the string with a backslash.'
  },
  TS1005: {
    cause: 'The parser expected a specific token at this position and found something else.',
    extract: QUOTED,
    solution: (match) =>
      match
        ? `Insert the missing ${match[1]} at the marked position.`
        : 'Insert the token named in the message at the marked position.'
  },
  TS1109: {
    cause: 'An expression was expected here, for example after an operator or inside brackets.',
    solution: 'Complete the expression, or remove the trailing operator that has no right-hand side.'
  },
  TS1128: {
    cause:
      'A statement or declaration was expected. This usually follows an unbalanced brace or a stray character.',
    solution: 'Check the braces above this line; a missing or extra } shifts every following statement.'
  },
  TS1155: {
    cause: 'A const declaration must be given a value at the point it is declared.',
    solution: 'Assign a value on the same line, or use let if the value is only known later.'
  },
  TS2304: {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `The name ${match[1]} is not declared in this file and is not imported from anywhere.`
        : 'The name used here is not declared in this file and is not imported.',
    solution: (match) =>
      match
        ? `Import ${match[1]}, declare it in this file, or install the package and its type definitions if it comes from a dependency.`
        : 'Import the name, declare it locally, or install the package that provides it.'
  },
  TS2307: {
    extract: /'([^']+)'/,
    cause: (match) =>
      match
        ? `The module ${match[1]} could not be resolved from this file. The package is not installed, the path is wrong, or the module has no type declarations.`
        : 'The imported module could not be resolved from this file.',
    solution: (match) =>
      match
        ? `Run your package manager install command, check the spelling of ${match[1]}, and for third party packages add its @types package if it ships no types.`
        : 'Install the package, or correct the import path relative to this file.'
  },
  TS2322: {
    extract: /Type '([^']+)' is not assignable to type '([^']+)'/,
    cause: (match) =>
      match
        ? `A value of type ${match[1]} was assigned where ${match[2]} is required. The two types have no common shape.`
        : 'A value was assigned to a target that expects a different type.',
    solution: (match) =>
      match
        ? `Convert the value to ${match[2]}, widen the target type, or fix the source so it produces ${match[2]}.`
        : 'Convert the value to the expected type, or widen the type of the target.'
  },
  TS2339: {
    extract: /Property '([^']+)' does not exist on type '([^']+)'/,
    cause: (match) =>
      match
        ? `The type ${match[2]} has no member named ${match[1]}. Either the name is misspelled or the value is not the type you expect here.`
        : 'The property accessed here is not part of the value type.',
    solution: (match) =>
      match
        ? `Check the spelling of ${match[1]}, add it to the type ${match[2]}, or narrow the value with a type guard before accessing it.`
        : 'Check the spelling, add the property to the type, or narrow the value first.'
  },
  TS2345: {
    extract: /Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/,
    cause: (match) =>
      match
        ? `The argument has type ${match[1]} but the parameter expects ${match[2]}.`
        : 'An argument does not match the parameter type of the called function.',
    solution: (match) =>
      match
        ? `Pass a value of type ${match[2]}, or change the function signature to accept ${match[1]}.`
        : 'Pass a value of the expected type, or change the signature to accept this type.'
  },
  TS2349: {
    cause: 'The value being called is not a function at this point in the code.',
    solution:
      'Check that the name refers to a function, and that you are not calling the result of a previous call by accident.'
  },
  TS2531: {
    cause: 'The value can be null at this point, and null has no members.',
    solution:
      'Guard with an if check, use optional chaining (?.), or provide a default with ?? before accessing it.'
  },
  TS2532: {
    cause: 'The value can be undefined at this point, and undefined has no members.',
    solution:
      'Guard with an if check, use optional chaining (?.), or provide a default with ?? before accessing it.'
  },
  TS2554: {
    extract: /Expected (\d+) arguments?, but got (\d+)/,
    cause: (match) =>
      match
        ? `The function takes ${match[1]} argument(s) but ${match[2]} were passed.`
        : 'The number of arguments does not match the function signature.',
    solution: (match) =>
      match
        ? `Pass exactly ${match[1]} argument(s), or mark the extra parameters optional in the function signature.`
        : 'Match the call to the signature, or make the extra parameters optional.'
  },
  TS2564: {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `The property ${match[1]} is typed as always present but is never assigned in the constructor.`
        : 'A property is typed as always present but never assigned in the constructor.',
    solution:
      'Assign it in the constructor, give it a default value, or mark it optional with a question mark.'
  },
  TS2571: {
    cause: 'The value has type unknown, which cannot be used until its type is narrowed.',
    solution: 'Narrow the value with typeof, instanceof or a type guard before using it.'
  },
  TS2769: {
    cause: 'No overload of this function matches the arguments that were passed.',
    solution:
      'Compare the call with the available overloads in the hover tooltip and adjust the argument types or count.'
  },
  TS6133: {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `${match[1]} is declared but never read, so it is dead code.`
        : 'The declaration is never read, so it is dead code.',
    solution: (match) =>
      match
        ? `Remove ${match[1]}, or prefix it with an underscore if it must stay for an interface or signature.`
        : 'Remove the declaration, or prefix it with an underscore to mark it as intentionally unused.'
  },
  TS7006: {
    extract: /Parameter '([^']+)'/,
    cause: (match) =>
      match
        ? `The parameter ${match[1]} has no type annotation, and strict mode forbids the implicit any type.`
        : 'A parameter has no type annotation and strict mode forbids implicit any.',
    solution: (match) =>
      match
        ? `Annotate ${match[1]} with its type, for example ${match[1]}: string.`
        : 'Add an explicit type annotation to the parameter.'
  },
  TS7031: {
    cause: 'A destructured binding has no type, and strict mode forbids the implicit any type.',
    solution: 'Annotate the destructured object, for example ({ id }: { id: string }).'
  },
  TS18046: {
    cause: 'A caught error has type unknown, because any value can be thrown in JavaScript.',
    solution: 'Narrow it first, for example with if (error instanceof Error) before reading error.message.'
  },
  TS18048: {
    extract: QUOTED,
    cause: (match) => (match ? `${match[1]} can be undefined here.` : 'The value can be undefined here.'),
    solution: 'Add a guard, use optional chaining, or supply a fallback with the ?? operator.'
  }
};

const ESLINT_EXPLANATIONS: Record<string, ExplanationTemplate> = {
  'no-unused-vars': {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `${match[1]} is assigned but never used, which usually means a leftover from an earlier edit.`
        : 'The variable is assigned but never used.',
    solution:
      'Remove the declaration, or prefix the name with an underscore if it is required by a signature.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-unused-vars'
  },
  'no-undef': {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `${match[1]} is used without being defined or imported in this scope.`
        : 'An undefined name is used.',
    solution:
      'Import or declare the name, or add the correct environment (browser, node) to the ESLint config.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-undef'
  },
  'no-console': {
    cause: 'A console call was left in code that is checked by this rule, usually debug output.',
    solution: 'Remove the call, or route the message through the project logger instead.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-console'
  },
  eqeqeq: {
    cause: 'The loose == operator compares after type coercion, so "" == 0 is true and bugs slip through.',
    solution: 'Use === and !== so that the comparison also checks the type.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/eqeqeq'
  },
  'prefer-const': {
    extract: QUOTED,
    cause: (match) =>
      match
        ? `${match[1]} is never reassigned, so let signals mutability that does not exist.`
        : 'The binding is never reassigned.',
    solution: 'Change let to const to make the immutability explicit.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/prefer-const'
  },
  'no-var': {
    cause: 'var is function scoped and hoisted, which makes its lifetime surprising inside blocks and loops.',
    solution: 'Use const, or let when the value is reassigned.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-var'
  },
  'no-debugger': {
    cause: 'A debugger statement halts execution in any environment with developer tools open.',
    solution: 'Remove the statement before committing.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-debugger'
  },
  'no-empty': {
    cause: 'An empty block gives no hint whether the case was handled deliberately or forgotten.',
    solution: 'Add the intended code, or a comment explaining why the block is intentionally empty.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-empty'
  },
  'no-fallthrough': {
    cause: 'A switch case runs into the next case because it has no break, return or throw.',
    solution: 'Add a break, or a // falls through comment if the fallthrough is intended.',
    documentationUrl: 'https://eslint.org/docs/latest/rules/no-fallthrough'
  },
  'react-hooks/rules-of-hooks': {
    cause:
      'A hook is called conditionally or outside a component, so React cannot match it to the same slot on every render.',
    solution: 'Move the hook to the top level of the component or of a custom hook, before any early return.',
    documentationUrl: 'https://react.dev/reference/rules/rules-of-hooks'
  },
  'react-hooks/exhaustive-deps': {
    cause: 'The effect reads a value that is not in its dependency array, so it can run with a stale value.',
    solution:
      'Add the missing dependency, or move the value inside the effect if it should not retrigger it.',
    documentationUrl: 'https://react.dev/reference/react/useEffect'
  },
  '@typescript-eslint/no-explicit-any': {
    cause: 'any switches off type checking for this value and everything derived from it.',
    solution: 'Use a concrete type, a generic parameter, or unknown plus a narrowing check.',
    documentationUrl: 'https://typescript-eslint.io/rules/no-explicit-any/'
  },
  '@typescript-eslint/no-floating-promises': {
    cause: 'A promise is created but never awaited or handled, so a rejection would be lost.',
    solution: 'Await the call, return it, or mark it deliberately fire-and-forget with void.',
    documentationUrl: 'https://typescript-eslint.io/rules/no-floating-promises/'
  }
};

/** Message patterns used when no code-specific entry exists. */
const HEURISTICS: Array<{ pattern: RegExp; cause: string; solution: string }> = [
  {
    pattern: /unexpected (end of (file|input)|eof)/i,
    cause: 'The file ended while a block, string or bracket was still open.',
    solution: 'Look for an unclosed brace, bracket or quote, usually near the last edit.'
  },
  {
    pattern: /unexpected token/i,
    cause: 'A character appeared where the parser did not allow it, often after a missing comma or operator.',
    solution: 'Check the punctuation on this line and the line above it.'
  },
  {
    pattern: /indentation|unindent|expected an indented block/i,
    cause: 'The indentation does not match the block structure the language requires.',
    solution: 'Align the line with its block, and do not mix tabs with spaces in the same file.'
  },
  {
    pattern: /is not defined|cannot find name|undefined (variable|name)/i,
    cause: 'The name is used before it is declared, or it was never imported.',
    solution: 'Declare or import the name before this line, and check its spelling.'
  },
  {
    pattern: /cannot find module|module not found|no module named/i,
    cause: 'The import target does not resolve from this file.',
    solution: 'Install the dependency, or correct the relative path.'
  },
  {
    pattern: /is deprecated/i,
    cause: 'The API still works but is scheduled for removal in a future version.',
    solution: 'Switch to the replacement named in the message before upgrading the dependency.'
  },
  {
    pattern: /missing (semicolon|;)/i,
    cause: 'A statement was not terminated where the language requires it.',
    solution: 'Add the missing semicolon at the end of the statement.'
  },
  {
    pattern: /unreachable code/i,
    cause: 'The statements after a return, throw, break or continue can never run.',
    solution: 'Remove the dead statements, or move the terminating statement below them.'
  },
  {
    pattern: /assigned.*never used|unused/i,
    cause: 'The declaration has no reader, so it has no effect on the program.',
    solution: 'Remove it, or prefix the name with an underscore if it must stay for an interface.'
  }
];

/** Normalises a diagnostic code into the lookup key used by the tables. */
export function normalizeCode(source: string, code: string | number | undefined): string {
  if (code === undefined || code === null) return '';
  const raw = String(code);
  if (source.toLowerCase().includes('typescript') || source.toLowerCase().includes('javascript')) {
    return /^\d+$/.test(raw) ? `TS${raw}` : raw;
  }
  return raw.replace(/^eslint\//, '');
}

/**
 * Produces the cause and solution for a diagnostic.
 *
 * Resolution order: exact code entry, then message heuristics, then a generic
 * fallback that is still tied to the reporting tool.
 */
export function explainDiagnostic(params: {
  source: string;
  code: string | number | undefined;
  message: string;
}): Explanation {
  const key = normalizeCode(params.source, params.code);
  const table = key.startsWith('TS') ? TYPESCRIPT_EXPLANATIONS : ESLINT_EXPLANATIONS;
  const template = table[key] ?? TYPESCRIPT_EXPLANATIONS[key] ?? ESLINT_EXPLANATIONS[key];

  if (template) {
    const match = template.extract ? params.message.match(template.extract) : null;
    return {
      cause: typeof template.cause === 'function' ? template.cause(match, params.message) : template.cause,
      solution:
        typeof template.solution === 'function'
          ? template.solution(match, params.message)
          : template.solution,
      documentationUrl: template.documentationUrl
    };
  }

  for (const heuristic of HEURISTICS) {
    if (heuristic.pattern.test(params.message)) {
      return { cause: heuristic.cause, solution: heuristic.solution };
    }
  }

  return {
    cause: `${params.source} reported this problem for the marked range, but cairn-code has no detailed explanation for ${key || 'this code'} yet.`,
    solution: `Read the message above and check the ${params.source} documentation for ${key || 'this rule'}. You can contribute an explanation in src/renderer/editor/diagnostic-explainer.ts.`
  };
}

/** Exposed for tests and for the documentation generator. */
export const EXPLANATION_CODES = {
  typescript: Object.keys(TYPESCRIPT_EXPLANATIONS),
  eslint: Object.keys(ESLINT_EXPLANATIONS)
};
