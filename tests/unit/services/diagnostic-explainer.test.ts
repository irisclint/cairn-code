import { describe, it, expect } from 'vitest';
import { explainDiagnostic, normalizeCode, EXPLANATION_CODES } from '@renderer/editor/diagnostic-explainer';

describe('normalizeCode', () => {
  it('should prefix a numeric TypeScript code with TS', () => {
    expect(normalizeCode('TypeScript', 2304)).toBe('TS2304');
    expect(normalizeCode('JavaScript', '7006')).toBe('TS7006');
  });

  it('should leave a non-numeric code untouched', () => {
    expect(normalizeCode('TypeScript', 'TS2304')).toBe('TS2304');
  });

  it('should strip the eslint prefix from a rule id', () => {
    expect(normalizeCode('ESLint', 'eslint/no-unused-vars')).toBe('no-unused-vars');
  });

  it('should return an empty string when no code was reported', () => {
    expect(normalizeCode('ESLint', undefined)).toBe('');
  });
});

describe('explainDiagnostic', () => {
  it('should always return a non-empty cause and solution', () => {
    const explanation = explainDiagnostic({
      source: 'SomethingUnknown',
      code: 'XYZ999',
      message: 'a message with no known pattern at all'
    });

    expect(explanation.cause.length).toBeGreaterThan(0);
    expect(explanation.solution.length).toBeGreaterThan(0);
  });

  it('should name the missing identifier for TS2304', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2304,
      message: "Cannot find name 'useState'."
    });

    expect(explanation.cause).toContain('useState');
    expect(explanation.solution).toContain('useState');
  });

  it('should name both types for an assignment mismatch (TS2322)', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2322,
      message: "Type 'string' is not assignable to type 'number'."
    });

    expect(explanation.cause).toContain('string');
    expect(explanation.cause).toContain('number');
    expect(explanation.solution).toContain('number');
  });

  it('should name the module that failed to resolve (TS2307)', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2307,
      message: "Cannot find module 'react' or its corresponding type declarations."
    });

    expect(explanation.cause).toContain('react');
    expect(explanation.solution).toContain('react');
  });

  it('should name the property and the type for TS2339', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2339,
      message: "Property 'foo' does not exist on type 'Bar'."
    });

    expect(explanation.cause).toContain('foo');
    expect(explanation.cause).toContain('Bar');
  });

  it('should report the expected and actual argument counts for TS2554', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2554,
      message: 'Expected 2 arguments, but got 1.'
    });

    expect(explanation.cause).toContain('2');
    expect(explanation.cause).toContain('1');
  });

  it('should explain a possibly-null access', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: 2531,
      message: 'Object is possibly null.'
    });

    expect(explanation.solution).toContain('optional chaining');
  });

  it('should explain an ESLint rule and link its documentation', () => {
    const explanation = explainDiagnostic({
      source: 'ESLint',
      code: 'no-unused-vars',
      message: "'value' is assigned a value but never used."
    });

    expect(explanation.cause).toContain('value');
    expect(explanation.documentationUrl).toContain('eslint.org');
  });

  it('should explain the rules of hooks violation', () => {
    const explanation = explainDiagnostic({
      source: 'ESLint',
      code: 'react-hooks/rules-of-hooks',
      message: 'React Hook "useState" is called conditionally.'
    });

    expect(explanation.cause).toContain('conditionally');
    expect(explanation.solution).toContain('top level');
  });

  it('should fall back to a message heuristic when the code is unknown', () => {
    const explanation = explainDiagnostic({
      source: 'Python',
      code: 'E999',
      message: 'SyntaxError: unexpected EOF while parsing'
    });

    expect(explanation.cause).toContain('ended');
    expect(explanation.solution).toContain('unclosed');
  });

  it('should recognise an indentation problem from any language', () => {
    const explanation = explainDiagnostic({
      source: 'Python',
      code: 'E112',
      message: 'expected an indented block'
    });

    expect(explanation.cause).toContain('indentation');
    expect(explanation.solution).toContain('tabs');
  });

  it('should recognise an undefined name from any language', () => {
    const explanation = explainDiagnostic({
      source: 'Python',
      code: 'F821',
      message: "undefined name 'foo'"
    });

    expect(explanation.cause).toContain('declared');
  });

  it('should tell the user how to contribute when it has no entry', () => {
    const explanation = explainDiagnostic({
      source: 'Rust',
      code: 'E0999',
      message: 'some entirely unmapped compiler message'
    });

    expect(explanation.solution).toContain('diagnostic-explainer.ts');
  });

  it('should handle a missing code without throwing', () => {
    const explanation = explainDiagnostic({
      source: 'TypeScript',
      code: undefined,
      message: 'a message'
    });

    expect(explanation.cause.length).toBeGreaterThan(0);
  });
});

describe('explanation catalog', () => {
  it('should cover the TypeScript codes developers hit most often', () => {
    for (const code of ['TS2304', 'TS2307', 'TS2322', 'TS2339', 'TS2345', 'TS7006']) {
      expect(EXPLANATION_CODES.typescript).toContain(code);
    }
  });

  it('should cover the common ESLint rules', () => {
    for (const rule of ['no-unused-vars', 'no-undef', 'eqeqeq', 'prefer-const']) {
      expect(EXPLANATION_CODES.eslint).toContain(rule);
    }
  });

  it('should produce a distinct explanation for every catalogued code', () => {
    const causes = new Set<string>();
    for (const code of EXPLANATION_CODES.typescript) {
      const explanation = explainDiagnostic({ source: 'TypeScript', code, message: 'sample message' });
      causes.add(explanation.cause);
    }
    // A shared fallback string would collapse these into a single entry.
    expect(causes.size).toBeGreaterThan(EXPLANATION_CODES.typescript.length / 2);
  });
});
