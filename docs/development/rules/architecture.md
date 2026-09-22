# Architecture rules

Read [the architecture overview](../../architecture/overview.md) for
the full picture. These are the rules a change must not break.

## The process boundary is absolute

The renderer never touches Node. Context isolation on, node integration off.
Everything the UI needs from the system goes through the preload bridge, which
exposes one function per allowlisted IPC channel and nothing else.

If you find yourself wanting `require` in the renderer, the answer is a new IPC
channel, not an exception.

## Adding an IPC channel

Four edits, in this order, or the layers drift apart:

1. Add the channel name to `src/shared/ipc-channels.ts`
2. Add the payload and result types to `src/shared/types.ts`
3. Add the handler in `src/main/ipc.ts`, wrapped in `guarded()`
4. Add the method to the bridge in `src/preload/index.ts`

Handlers never throw across the boundary. `guarded()` returns an `IpcResult`
envelope; `unwrap()` on the renderer side turns a failure back into a throwable
error that still carries the cause and the solution.

## One implementation per action

Every user action is a command registered in
`src/renderer/services/register-commands.ts`. The native menu, the command
palette and the keyboard bindings all dispatch a command id. Never wire a menu
item or a shortcut straight to a function: that is how a menu entry and its
palette twin start behaving differently.

## State belongs in one store

Each store owns one concern. Before adding a field, check whether it belongs to
an existing store. In particular, layout state stays out of the editor store so
that resizing a panel does not re-render Monaco.

Stores may call services. Services must not import stores, except where a
service needs to report to the user, which goes through the notification store.

## The single source of truth list

When two places would need the same fact, one of them is wrong:

| Fact | Lives in |
| --- | --- |
| IPC channel names | `src/shared/ipc-channels.ts` |
| Commands and their keybindings | `services/register-commands.ts` |
| Language table | `editor/language-support.ts` |
| Diagnostic explanations | `editor/diagnostic-explainer.ts` |
| Every diagnostic currently shown | `services/diagnostic-service.ts` |
| Theme colours | the theme JSON, injected as CSS custom properties |
| Settings defaults | `main/services/settings-store.ts` |

## Monaco language ids

A cairn-code language id is not always a Monaco language id. Monaco bundles one
grammar for several languages: `.tsx` is tokenized by `typescript`, `.jsx` by
`javascript`, single file components by `html`. Use `toMonacoLanguageId()` when
creating or retagging a model. A language id Monaco does not know has no
tokenizer, so the file opens with no highlighting and, for TypeScript, no
diagnostics.

## Failure is never silent

- A filesystem error becomes a notification with a cause and a fix.
- A missing theme falls back to the default and says so in the log.
- A native module that will not load degrades to a documented fallback and
  tells the user how to fix it, rather than pretending to work.
- A crash in one region is caught by its `ErrorBoundary` and leaves the rest of
  the workbench usable, so the user can still save.

An empty `catch` block needs a comment saying why the failure is genuinely
fine.
