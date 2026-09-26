# Adding a diagnostic explanation

Teaches causeway to explain a compiler code or lint rule it currently falls back
on. This is the smallest useful contribution to the feature causeway is built
around, and it is a good first change.

## Find what is missing

Open a file that produces the problem, look at the Problems panel and expand
the row. If the **Why** line says causeway has no detailed explanation for that
code yet, it needs an entry.

## Add the entry

In `src/renderer/editor/diagnostic-explainer.ts`, add to
`TYPESCRIPT_EXPLANATIONS` or `ESLINT_EXPLANATIONS`:

```ts
TS2739: {
  cause: 'The object literal is missing properties that the target type requires.',
  solution: 'Add the properties named in the message, or mark them optional in the type.'
}
```

### Pulling names out of the message

A generic explanation is better than nothing, but naming the actual identifier
is what makes it useful. Add an `extract` pattern and make `cause` and
`solution` functions:

```ts
TS2551: {
  extract: /Property '([^']+)' does not exist on type '([^']+)'. Did you mean '([^']+)'/,
  cause: (match) =>
    match
      ? `The type ${match[2]} has no member ${match[1]}, but it does have ${match[3]}.`
      : 'The property does not exist on this type, though a similar name does.',
  solution: (match) =>
    match ? `Rename ${match[1]} to ${match[3]}.` : 'Use the suggested name from the message.'
}
```

`match` is null when the pattern does not fit the message, so both branches
must return something usable. This happens more often than you would expect:
compilers reword their messages between versions.

### Linking documentation

For lint rules, add the rule page:

```ts
'no-shadow': {
  cause: 'A variable here has the same name as one in an enclosing scope, hiding it.',
  solution: 'Rename the inner variable so both remain reachable.',
  documentationUrl: 'https://eslint.org/docs/latest/rules/no-shadow'
}
```

The Problems panel renders it as a link.

## Writing a good explanation

**Cause answers why, not what.** The message already says what. The cause says
what situation produced it.

```ts
// Yes
cause: 'A promise is created but never awaited or handled, so a rejection would be lost.'

// No
cause: 'There is a floating promise.'
```

**Solution is an action.** Something the reader can do in the next thirty
seconds, phrased as an instruction. Offer the alternatives when there is a real
choice, in the order they are usually right.

```ts
// Yes
solution: 'Await the call, return it, or mark it deliberately fire-and-forget with void.'

// No
solution: 'Handle the promise correctly.'
```

**Plain language.** The reader is stuck. "The two types have no common shape"
lands; "the types are not structurally assignable" does not.

**No blame.** Describe the situation, not the person who created it.

## Add a test

In `tests/unit/services/diagnostic-explainer.test.ts`:

```ts
it('should name the missing properties for TS2739', () => {
  const explanation = explainDiagnostic({
    source: 'TypeScript',
    code: 2739,
    message: "Type '{}' is missing the following properties from type 'Point': x, y"
  });

  expect(explanation.cause).toContain('Point');
  expect(explanation.solution.length).toBeGreaterThan(0);
});
```

If the entry uses `extract`, add a second case with a message the pattern does
**not** match, to prove the fallback branch still produces something useful.

## Verify

```bash
npm test
npm run dev
```

Then trigger the real problem and read the expanded row in the Problems panel.
An explanation that reads well in a test and badly in the panel is not done.
