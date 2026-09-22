# Testing rules

## What to write

| Layer | Tool | Location | Covers |
| --- | --- | --- | --- |
| Unit | Vitest | `tests/unit/` | Services, stores, utilities, components |
| Integration | Vitest | `tests/integration/` | Flows across module boundaries |
| End to end | Playwright | `tests/e2e/` | The built app, driven as a user |

Every change needs tests. The coverage thresholds in `vitest.config.ts` are
enforced in CI and are not lowered to make a change pass.

## Test names describe behaviour

The name should read as a sentence about what the software does, so a failure
report is already a bug description.

```ts
// Yes
it('should clear the panel once the file compiles again', ...)
it('should keep a pending chord alive across a repeated modifier keydown', ...)

// No
it('works', ...)
it('calls setDiagnostics with an empty array', ...)
```

## Test behaviour, not implementation

Assert on what a caller can observe. A test that asserts a private method was
called breaks on every refactor while telling you nothing about correctness.

## Mock as little as possible

Mock what you cannot run: Electron APIs, the network, a native module. Do not
mock the filesystem when a real temporary directory works, and never mock the
code under test.

The main process service tests use real temp directories through `mkdtemp`, and
they are fast.

## Every error path gets a test

Since the product promise is that errors explain themselves, tests assert it:

```ts
it('should raise an actionable error for a missing file', async () => {
  try {
    await files.readFile(missingPath);
  } catch (error) {
    expect(error.code).toBe('FS_ENOENT');
    expect(error.userCause.length).toBeGreaterThan(0);
    expect(error.solution.length).toBeGreaterThan(0);
  }
});
```

Whole categories are checked the same way: every built-in theme is validated,
and every catalogued diagnostic code is asserted to produce a distinct cause.

## End to end tests guard the security boundary

`tests/e2e/startup.test.ts` asserts that `require` and `ipcRenderer` are
undefined in the renderer and that the bridge exposes exactly the expected
surface. A regression there fails the build, which is the point.

The end to end suite runs against the real build, so run `npm run build` first.

It starts Electron itself and attaches over the Chromium debugging port rather
than using Playwright's `_electron.launch`. That launcher passes `--inspect`,
which makes Electron parse the rest of the command line with Node's option
parser and then reject `--remote-debugging-port`, so the app never starts. The
harness lives in `tests/e2e/launch.ts`.

## Running them

```bash
npm test               # unit and integration
npm run test:watch     # the same, watching
npm run test:coverage  # with the thresholds enforced
npm run test:e2e       # end to end, needs a build first
```
