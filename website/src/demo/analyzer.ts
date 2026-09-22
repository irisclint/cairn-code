/**
 * The rule engine behind the live demo.
 *
 * This is not the editor's diagnostic pipeline. The real one runs the
 * TypeScript language service in a worker and looks the explanation up in a
 * catalog of compiler codes. What this shares with it is the part the demo
 * exists to show: every finding carries a cause and a fix, and a rule that
 * cannot say both does not get added.
 *
 * Every rule runs against the masked source, where the insides of strings and
 * comments have been blanked out, so a `==` in a message string is not
 * reported as a comparison.
 */

import { maskLiterals, type DemoLanguage } from './highlight';

export interface Finding {
  /** The compiler code or lint rule, shown as the source badge. */
  code: string;
  source: string;
  severity: 'error' | 'warning';
  /** What is wrong. */
  message: string;
  /** One based, to match what the gutter shows. */
  line: number;
  /** One based column of the first character of the offending range. */
  column: number;
  length: number;
  /** Why it happened, in plain language. */
  cause: string;
  /** The concrete change to make. */
  fix: string;
}

/** Runs every rule that applies to the language and returns findings in order. */
export function analyze(source: string, language: DemoLanguage): Finding[] {
  const masked = maskLiterals(source, language);
  const findings: Finding[] = language === 'python' ? analyzePython(masked) : analyzeScript(masked, language);

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/* -------------------------------------------------------------------------- */
/* TypeScript and JavaScript                                                   */
/* -------------------------------------------------------------------------- */

function analyzeScript(lines: string[], language: DemoLanguage): Finding[] {
  const findings: Finding[] = [];

  if (language === 'typescript') {
    findings.push(...assignmentTypeMismatches(lines));
    findings.push(...implicitAnyParameters(lines));
  }

  findings.push(...looseEquality(lines));
  findings.push(...varDeclarations(lines));
  findings.push(...debuggerStatements(lines));
  findings.push(...unusedBindings(lines));

  return findings;
}

interface InterfaceShape {
  /** Property name to its declared primitive type. */
  properties: Map<string, string>;
}

/** Collects `interface X { a: string }` declarations and their line ranges. */
function collectInterfaces(lines: string[]): Map<string, InterfaceShape> {
  const shapes = new Map<string, InterfaceShape>();

  for (let index = 0; index < lines.length; index += 1) {
    const header = /^\s*(?:export\s+)?interface\s+(\w+)\s*\{/.exec(lines[index] as string);
    if (!header) continue;

    const properties = new Map<string, string>();
    let depth = 1;
    let cursor = index + 1;

    while (cursor < lines.length && depth > 0) {
      const line = lines[cursor] as string;
      depth += countChar(line, '{') - countChar(line, '}');
      if (depth <= 0) break;

      const property = /^\s*(\w+)\??\s*:\s*([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(line);
      if (property) properties.set(property[1] as string, property[2] as string);
      cursor += 1;
    }

    shapes.set(header[1] as string, { properties });
    index = cursor;
  }

  return shapes;
}

/**
 * Reports a literal assigned to a property the interface declares as another
 * primitive type.
 *
 * Only objects that carry an explicit annotation are checked, because that is
 * the only case where the compiler itself has a type to compare against.
 */
function assignmentTypeMismatches(lines: string[]): Finding[] {
  const shapes = collectInterfaces(lines);
  if (shapes.size === 0) return [];

  const findings: Finding[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const annotated = /(?:const|let|var)\s+\w+\s*:\s*(\w+)\s*=\s*\{/.exec(lines[index] as string);
    if (!annotated) continue;

    const shape = shapes.get(annotated[1] as string);
    if (!shape) continue;

    let depth = countChar(lines[index] as string, '{') - countChar(lines[index] as string, '}');
    let cursor = index + 1;

    while (cursor < lines.length && depth > 0) {
      const line = lines[cursor] as string;
      const entry = /^(\s*)(\w+)\s*:\s*(\S.*?),?\s*$/.exec(line);

      if (entry) {
        const property = entry[2] as string;
        const declared = shape.properties.get(property);
        const actual = literalType(entry[3] as string);

        if (declared && actual && declared !== actual) {
          const column = (entry[1] as string).length + property.length + 2;
          const value = (entry[3] as string).replace(/,$/, '');

          findings.push({
            code: 'TS2322',
            source: 'TypeScript',
            severity: 'error',
            message: `Type '${actual}' is not assignable to type '${declared}'.`,
            line: cursor + 1,
            column: line.indexOf(value, column) + 1,
            length: value.length,
            cause: `${property} is declared as ${declared} on ${annotated[1]}, and the value written here is a ${actual}. The two types have no common shape, so the compiler cannot accept one where the other is required.`,
            fix:
              declared === 'number'
                ? `Drop the quotes to write a number literal, or convert at the boundary with Number(${value}) if the value genuinely arrives as text.`
                : `Write the value as a ${declared}, or widen ${property} on ${annotated[1]} if it really can hold both.`
          });
        }
      }

      depth += countChar(line, '{') - countChar(line, '}');
      cursor += 1;
    }
  }

  return findings;
}

/** `'a'` to string, `12` to number, `true` to boolean, anything else unknown. */
function literalType(raw: string): string | null {
  const value = raw.replace(/,$/, '').trim();
  if (/^['"`]/.test(value)) return 'string';
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
  if (value === 'true' || value === 'false') return 'boolean';
  return null;
}

/**
 * Reports a parameter of a named function that has no type annotation.
 *
 * Only named declarations are checked. A callback parameter usually gets its
 * type from the surrounding call, so flagging those would report errors the
 * compiler does not raise.
 */
function implicitAnyParameters(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    const declaration = /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/.exec(line);
    if (!declaration) return;

    const list = declaration[1] as string;
    if (list.trim().length === 0) return;

    const listStart = line.indexOf(list, declaration.index ?? 0);
    let offset = 0;

    for (const part of list.split(',')) {
      const name = part.trim();
      const start = listStart + offset + (part.length - part.trimStart().length);
      offset += part.length + 1;

      // A destructured, defaulted, rest or already annotated parameter is not
      // an implicit any, so only a bare identifier is reported.
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;

      findings.push({
        code: 'TS7006',
        source: 'TypeScript',
        severity: 'error',
        message: `Parameter '${name}' implicitly has an 'any' type.`,
        line: index + 1,
        column: start + 1,
        length: name.length,
        cause: `Under strict mode every parameter needs a type, and there is nothing here for the compiler to infer one from. A named function is called from anywhere, so no call site can supply the type.`,
        fix: `Annotate it, as in ${name}: string. If it really can be anything, write ${name}: unknown and narrow it, which keeps the checks the code needs.`
      });
    }
  });

  return findings;
}

function looseEquality(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    const pattern = /(?<![=!<>])(==|!=)(?!=)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      const operator = match[1] as string;
      const strict = operator === '==' ? '===' : '!==';

      findings.push({
        code: 'eqeqeq',
        source: 'ESLint',
        severity: 'warning',
        message: `Expected '${strict}' and instead saw '${operator}'.`,
        line: index + 1,
        column: match.index + 1,
        length: operator.length,
        cause: `${operator} converts its operands before comparing, so '' equals 0 and '1' equals 1. The rule that decides what converts to what is long enough that almost nobody holds it in their head.`,
        fix: `Use ${strict}, which compares type and value. If a conversion is genuinely wanted, do it explicitly first so the next reader can see it.`
      });
    }
  });

  return findings;
}

function varDeclarations(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    const match = /\bvar\s+(\w+)/.exec(line);
    if (!match) return;

    findings.push({
      code: 'no-var',
      source: 'ESLint',
      severity: 'warning',
      message: 'Unexpected var, use let or const instead.',
      line: index + 1,
      column: (match.index ?? 0) + 1,
      length: 3,
      cause: `var is scoped to the whole function and is hoisted, so ${match[1]} exists before this line as undefined, and a loop that closes over it shares one binding rather than one per iteration.`,
      fix: `Use const if ${match[1]} is never reassigned, and let if it is. Both are scoped to the block, which is what the code already looks like it means.`
    });
  });

  return findings;
}

function debuggerStatements(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    const match = /\bdebugger\b/.exec(line);
    if (!match) return;

    findings.push({
      code: 'no-debugger',
      source: 'ESLint',
      severity: 'warning',
      message: 'Unexpected debugger statement.',
      line: index + 1,
      column: (match.index ?? 0) + 1,
      length: 8,
      cause:
        'A debugger statement halts execution whenever developer tools are open. Shipped to production it freezes the page for anyone who happens to have them open.',
      fix: 'Remove it and set the breakpoint in the debugger instead, where it lives outside the source and cannot be committed by accident.'
    });
  });

  return findings;
}

function unusedBindings(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  const source = lines.join('\n');

  lines.forEach((line, index) => {
    const match = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (!match) return;

    const name = match[1] as string;
    const uses = source.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'))?.length ?? 0;
    if (uses > 1) return;

    findings.push({
      code: 'no-unused-vars',
      source: 'ESLint',
      severity: 'warning',
      message: `'${name}' is assigned a value but never used.`,
      line: index + 1,
      column: line.indexOf(name, match.index ?? 0) + 1,
      length: name.length,
      cause: `Nothing reads ${name} after this line. Either the code that was going to use it was never written, or it was replaced and this was left behind.`,
      fix: `Delete the declaration, or use the value. If it is kept deliberately as documentation of a returned shape, prefix it with an underscore so the rule knows it is intentional.`
    });
  });

  return findings;
}

/* -------------------------------------------------------------------------- */
/* Python                                                                      */
/* -------------------------------------------------------------------------- */

function analyzePython(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  const source = lines.join('\n');

  lines.forEach((line, index) => {
    const mutable = /def\s+\w+\s*\([^)]*?(\w+)\s*=\s*(\[\]|\{\})/.exec(line);
    if (mutable) {
      const literal = mutable[2] as string;
      findings.push({
        code: 'W0102',
        source: 'Python',
        severity: 'warning',
        message: `Dangerous default value ${literal} as argument.`,
        line: index + 1,
        column: line.indexOf(literal, mutable.index ?? 0) + 1,
        length: literal.length,
        cause: `A default is evaluated once, when the function is defined, not on each call. Every call that omits ${mutable[1]} therefore shares the same ${literal === '[]' ? 'list' : 'dict'}, and anything one call appends is still there for the next.`,
        fix: `Default to None and build it inside: if ${mutable[1]} is None: ${mutable[1]} = ${literal}. That gives each call its own.`
      });
    }

    const bare = /^(\s*)except\s*:/.exec(line);
    if (bare) {
      findings.push({
        code: 'E722',
        source: 'Python',
        severity: 'warning',
        message: 'Do not use bare except.',
        line: index + 1,
        column: (bare[1] as string).length + 1,
        length: 6,
        cause:
          'A bare except catches everything, including KeyboardInterrupt and SystemExit, so it swallows the signal that asks the program to stop and hides the bug you were not expecting.',
        fix: 'Catch the exception you can actually handle, as in except ValueError. Use except Exception only when something really must survive any failure, and log what it caught.'
      });
    }

    const none = /(==|!=)\s*None\b/.exec(line);
    if (none) {
      const operator = none[1] as string;
      findings.push({
        code: 'E711',
        source: 'Python',
        severity: 'warning',
        message: `Comparison to None should be 'if cond is${operator === '!=' ? ' not' : ''} None:'.`,
        line: index + 1,
        column: (none.index ?? 0) + 1,
        length: (none[0] as string).length,
        cause: `${operator} calls __eq__, which a class can define, so an object is free to claim it equals None. There is only ever one None, so identity is what the comparison actually means.`,
        fix: `Write is${operator === '!=' ? ' not' : ''} None. It compares identity, cannot be overridden, and is faster.`
      });
    }

    const imported = /^\s*import\s+(\w+)\s*$/.exec(line);
    if (imported) {
      const name = imported[1] as string;
      const uses = source.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'))?.length ?? 0;
      if (uses <= 1) {
        findings.push({
          code: 'F401',
          source: 'Python',
          severity: 'warning',
          message: `'${name}' imported but unused.`,
          line: index + 1,
          column: line.indexOf(name) + 1,
          length: name.length,
          cause: `Nothing in this file refers to ${name}. The import still runs, so it costs start-up time and pulls in whatever that module imports in turn.`,
          fix: `Remove the import. If it is here for a side effect, say so in a comment, because the next person will otherwise delete it.`
        });
      }
    }
  });

  return findings;
}

/* -------------------------------------------------------------------------- */

function countChar(text: string, char: string): number {
  let total = 0;
  for (const current of text) if (current === char) total += 1;
  return total;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
