# Coding style

Rules that ESLint and Prettier cannot enforce. Run `npm run lint` and
`npm run format` for the rest.

## Errors tell the user what to do

This is the rule causeway is built around. Every error carries three things:

- **message** what went wrong
- **cause** why it happened, in plain language
- **solution** the concrete next action

In the main process, throw an `CausewayError` subclass. In the renderer, report
through `useNotificationStore.notifyError`. An error with no cause and no
solution is a defect, not a style preference.

```ts
// Yes
throw new FileSystemError({
  code: 'FS_EACCES',
  message: `Permission denied: ${path}`,
  cause: 'The operating system refused access because the process lacks the required rights.',
  solution: 'Adjust the file permissions, or reopen the folder from a location you own.'
});

// No
throw new Error('could not open file');
```

The same applies to diagnostics from tooling. If the explainer has no entry for
a code, it still produces a cause and a solution, and the fallback says how to
contribute one.

## Comments explain why

A comment that restates the code is noise, and noise trains readers to skip
comments that matter. Write a comment when it records a decision, a constraint,
or a consequence that is not visible from the code.

```ts
// Yes: records a constraint that the code cannot show
// Holding Ctrl auto-repeats its keydown, which would otherwise cancel the
// pending chord before the second key arrives.
if (MODIFIER_KEYS.has(event.key)) return false;

// No: restates the code
// Return false if the key is a modifier
if (MODIFIER_KEYS.has(event.key)) return false;
```

JSDoc on every exported function, describing what it does and anything
surprising about it. Skip `@param` when the parameter name and type already say
it.

## TypeScript

- Strict mode. No `any` without an inline
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` and a comment
  saying why. Prefer `unknown` and narrow it.
- Explicit parameter and return types on exported functions.
- `interface` for object shapes, `type` for unions and aliases.
- Private class fields use the `#` prefix, not the `private` keyword, so the
  privacy is enforced at runtime.
- `async`/`await`, never `.then()` chains.
- Naming: `PascalCase` for types and classes, `camelCase` for functions and
  variables, `UPPER_SNAKE_CASE` for module level constants.

## React

- Function components only.
- Props in a named interface, never inline.
- Global state in a Zustand store, local state in `useState`. Do not lift state
  into a store just because two siblings need it; pass it down first.
- `useMemo` and `useCallback` where a measurement says they help, not by
  default.
- Every major view has an `ErrorBoundary` so one broken region cannot take the
  workbench down and cost the user unsaved work.
- Accessible by construction: labelled controls, `aria-*` where the role is not
  obvious, and keyboard paths for everything that has a mouse path.

## Styles

- SCSS with BEM: `.activity-bar__item--active`.
- Every colour comes from a CSS custom property that the theme engine injects.
  A hard coded colour is a bug: it will be wrong in eleven of the twelve
  themes.
- No `!important` without a comment explaining what forces it.
- Respect `prefers-reduced-motion`; the `respect-reduced-motion` mixin does it.

## Imports

- `@shared/*`, `@renderer/*` and `@main/*` aliases instead of deep relative
  paths.
- `import type` for type-only imports; the lint rule enforces it.
- Never import from `src/main` into `src/renderer` or the other way round. The
  only shared code is `src/shared`, and the only channel between them is the
  preload bridge.

## Performance

Decisions that matter at this scale, already made and worth keeping:

- One Monaco instance for the whole app; swap models, do not create editors.
- Files over 4 MB drop the minimap, folding and bracket colouring.
- Language services run in web workers, off the UI thread.
- Terminals stay mounted when their tab is hidden; remounting loses scrollback
  and costs more than keeping them.
- Layout state lives in its own store so a panel resize does not re-render the
  editor.
