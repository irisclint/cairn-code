# Adding a language

Adds syntax highlighting and comment support for a new language.

## Steps

### 1. Check whether Monaco already has a grammar

```bash
ls node_modules/monaco-editor/esm/vs/languages/definitions/
```

This decides everything that follows. Monaco bundles about eighty grammars, and
one grammar often serves several languages: `.tsx` is tokenized by
`typescript`, `.jsx` by `javascript`, single file components by `html`.

### 2. Add the entry

In `src/renderer/editor/language-support.ts`, add to `LANGUAGES`:

```ts
{ id: 'mylang', label: 'My Language', extensions: ['ml2'], lineComment: '#', icon: 'mylang' }
```

Fields:

| Field | Notes |
| --- | --- |
| `id` | Lowercase, unique. Use Monaco's id when one exists. |
| `monacoId` | Set when the grammar lives under a different Monaco id. |
| `label` | What the status bar shows. |
| `extensions` | No leading dot, lowercase. |
| `filenames` | Exact names such as `Dockerfile`, for extensionless files. |
| `interpreters` | Names matched against a `#!` line. |
| `lineComment` / `blockComment` | Drives the toggle-comment commands. |
| `icon` | Key under `resources/icons/file-types/`. |

**If Monaco has no grammar for the language**, point `monacoId` at the closest
one rather than leaving the id unmapped. An id Monaco does not know has no
tokenizer at all, so the file would open as an unhighlighted wall of text. A
close relative is much better than nothing:

```ts
{ id: 'crystal', monacoId: 'ruby', label: 'Crystal', extensions: ['cr'], lineComment: '#', icon: 'cr' }
```

### 3. Add tests

In `tests/unit/services/language-support.test.ts`, add to the detection table:

```ts
['file.ml2', 'mylang'],
```

Add a case for the exact file name or shebang if the language has one.

### 4. Verify

```bash
npm test
npm run build
npm run dev
```

Open a file of that type. Check the status bar shows the label, the text is
highlighted, and `Ctrl+/` inserts the right comment token.

## Ordering matters

Detection resolves in this order: exact file name, then extension, then
shebang. This is why `.env.local` is detected as an environment file rather
than as the `local` extension, and why `Dockerfile` works at all.

If two languages claim the same extension, the first entry in `LANGUAGES`
wins. Put the more common one first.
