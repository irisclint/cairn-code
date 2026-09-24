/** Type contracts shared across the main, preload and renderer processes. */

/* -------------------------------------------------------------------------- */
/* Filesystem                                                                  */
/* -------------------------------------------------------------------------- */

export interface FileStat {
  path: string;
  name: string;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  /** Milliseconds since the Unix epoch. */
  modifiedAt: number;
}

export interface DirectoryEntry extends FileStat {
  /** Populated lazily by the explorer when a directory is expanded. */
  children?: DirectoryEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  encoding: 'utf8';
  size: number;
  modifiedAt: number;
  /** True when the file exceeded LARGE_FILE_THRESHOLD_BYTES. */
  isLarge: boolean;
}

export type FileEventKind = 'created' | 'changed' | 'deleted' | 'renamed';

export interface FileEvent {
  kind: FileEventKind;
  path: string;
  /** Only set for `renamed` events. */
  previousPath?: string;
}

/* -------------------------------------------------------------------------- */
/* Workspace                                                                   */
/* -------------------------------------------------------------------------- */

export interface WorkspaceInfo {
  /** Absolute path of the opened folder, or null when no folder is open. */
  rootPath: string | null;
  name: string | null;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export interface SearchQuery {
  query: string;
  isRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
  includeGlob?: string;
  excludeGlob?: string;
  maxResults?: number;
}

export interface SearchMatch {
  lineNumber: number;
  /** Zero-based column of the first character of the match. */
  column: number;
  length: number;
  lineText: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                 */
/* -------------------------------------------------------------------------- */

/** 0 = Error, 1 = Warning, 2 = Info, 3 = Hint. */
export type DiagnosticSeverity = 0 | 1 | 2 | 3;

export const DiagnosticSeverityValue = {
  Error: 0,
  Warning: 1,
  Info: 2,
  Hint: 3
} as const satisfies Record<string, DiagnosticSeverity>;

export interface DiagnosticRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface DiagnosticRelatedInformation {
  location: { uri: string; range: DiagnosticRange };
  message: string;
}

export interface DiagnosticQuickFix {
  title: string;
  edit: {
    range: DiagnosticRange;
    newText: string;
  };
}

/**
 * A single problem reported for a file.
 *
 * Beyond the usual message, cairn-code always carries `cause` and `solution` so the
 * user is told why the problem happened and what to do about it, never just
 * that something is wrong.
 */
export interface Diagnostic {
  /** Stable identifier, for example "TS2304" or "eslint/no-unused-vars". */
  code: string;
  /** Producer of the diagnostic, for example "TypeScript" or "ESLint". */
  source: string;
  severity: DiagnosticSeverity;
  /** What is wrong, in the words of the underlying tool. */
  message: string;
  /** Why it happened, in plain language. */
  cause: string;
  /** How to fix it, as a concrete instruction. */
  solution: string;
  range: DiagnosticRange;
  /** Absolute path of the file the diagnostic belongs to. */
  uri: string;
  relatedInformation?: DiagnosticRelatedInformation[];
  quickFixes?: DiagnosticQuickFix[];
  /** Link to further reading, for example an ESLint rule page. */
  documentationUrl?: string;
}

/* -------------------------------------------------------------------------- */
/* Extensions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything an extension is allowed to ask for.
 *
 * A closed list, on purpose. An extension that wants something not named here
 * cannot have it, and adding a capability means adding it here first, in front
 * of a reviewer, rather than as a side effect of some other change.
 */
export const EXTENSION_PERMISSIONS = [
  'commands',
  'notifications',
  'workspace.read',
  'workspace.write',
  'diagnostics',
  'clipboard'
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

/** What each permission lets an extension do, in the words shown to the user. */
export const PERMISSION_DESCRIPTIONS: Record<ExtensionPermission, string> = {
  commands: 'Add commands to the Command Palette',
  notifications: 'Show you messages',
  'workspace.read': 'Read the files in your open folder',
  'workspace.write': 'Change the files in your open folder',
  diagnostics: 'Explain compiler codes and lint rules',
  clipboard: 'Read and write your clipboard'
};

export interface ExtensionCommandContribution {
  id: string;
  title: string;
}

/**
 * An explanation an extension adds to the diagnostic catalog.
 *
 * The most useful thing a small extension can contribute, and the reason the
 * contribution format is declarative: an explanation is data, so it needs no
 * code to run and no permission to be trusted with.
 */
export interface ExtensionExplanationContribution {
  /** The compiler code or lint rule, for example "TS2532" or "no-shadow". */
  code: string;
  cause: string;
  solution: string;
  documentationUrl?: string;
}

export interface ExtensionContributions {
  commands?: ExtensionCommandContribution[];
  diagnosticExplanations?: ExtensionExplanationContribution[];
}

export interface ExtensionManifest {
  /** publisher.name, unique across the marketplace. */
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  /** Entry file, relative to the extension folder. Absent for data-only ones. */
  main?: string;
  permissions: ExtensionPermission[];
  contributes: ExtensionContributions;
}

export type ExtensionStatus = 'enabled' | 'disabled' | 'failed';

export interface InstalledExtension {
  manifest: ExtensionManifest;
  status: ExtensionStatus;
  /** Absolute path of the folder it was installed into. */
  path: string;
  /** Why it failed, when it did. */
  failure?: string;
}

/** One entry as a marketplace registry lists it. */
export interface MarketplaceEntry {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  permissions: ExtensionPermission[];
  /** Where the packaged extension is downloaded from. */
  archiveUrl: string;
  /** SHA-256 of the archive, hex encoded. */
  sha256: string;
  downloads?: number;
}

/* -------------------------------------------------------------------------- */
/* Debugging                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One entry from the workspace's launch.json.
 *
 * The three fields cairn-code needs are named; everything else is passed to
 * the adapter untouched, because each adapter defines its own options and
 * listing them here would mean rejecting valid configurations.
 */
export interface DebugConfiguration {
  name: string;
  /** The adapter to use, for example "python" or "node". */
  type: string;
  request: 'launch' | 'attach';
  /** Overrides the adapter command, so any adapter can be driven. */
  debugAdapter?: string;
  [option: string]: unknown;
}

export interface SourceBreakpoint {
  /** One based, matching the editor gutter. */
  line: number;
  /** Only breaks when this expression is true, when the adapter supports it. */
  condition?: string;
}

export type DebugStatus = 'inactive' | 'starting' | 'running' | 'stopped';

export interface DebugSessionState {
  status: DebugStatus;
  /** The thread the adapter last stopped, which the step commands act on. */
  threadId: number | null;
  configurationName: string | null;
  /** Why it stopped: "breakpoint", "step", "exception", as the adapter says. */
  stoppedReason?: string;
}

export interface DebugStackFrame {
  id: number;
  name: string;
  line: number;
  column: number;
  /** Absolute path, or null for a frame with no source on disk. */
  source: string | null;
}

export interface DebugScope {
  name: string;
  variablesReference: number;
  /** True when reading it is slow enough that it should not expand by itself. */
  expensive: boolean;
}

export interface DebugVariable {
  name: string;
  value: string;
  type: string | null;
  /** Non-zero when the value has children that can be fetched. */
  variablesReference: number;
}

export interface DebugOutput {
  category: string;
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Source control                                                              */
/* -------------------------------------------------------------------------- */

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

/**
 * One change to one file, on one side of the index.
 *
 * A file that is staged and then edited again produces two of these, because
 * the staged version and the working copy are different things and a commit
 * will only contain the first.
 */
export interface GitChange {
  /** Repository-relative, as git reports it. */
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitStatus {
  isRepository: boolean;
  branch: string | null;
  /** Commits this branch has that its upstream does not. */
  ahead: number;
  /** Commits the upstream has that this branch does not. */
  behind: number;
  changes: GitChange[];
}

/* -------------------------------------------------------------------------- */
/* Linting                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One ESLint message, before it is turned into a Diagnostic.
 *
 * The cause and the solution are added in the renderer, where the explanation
 * catalog lives, so that every source of problems looks them up in one place.
 */
export interface LintFinding {
  ruleId: string | null;
  /** 1 is a warning, 2 is an error, matching ESLint's own numbering. */
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  /** True when ESLint can fix this automatically. */
  fixable: boolean;
}

export interface LintOutcome {
  findings: LintFinding[];
  /** True when the workspace's own configuration ignores the file. */
  ignored: boolean;
}

/* -------------------------------------------------------------------------- */
/* Terminal                                                                    */
/* -------------------------------------------------------------------------- */

export interface ShellDescriptor {
  id: string;
  label: string;
  executable: string;
  args: string[];
}

export interface TerminalCreateOptions {
  shellId?: string;
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface TerminalSession {
  id: string;
  pid: number;
  shellLabel: string;
  cwd: string;
  /** False when the platform fell back to a pipe-based shell without a pty. */
  hasPty: boolean;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

/* -------------------------------------------------------------------------- */
/* Desktop shortcut                                                            */
/* -------------------------------------------------------------------------- */

export interface ShortcutState {
  /** True when a desktop shortcut already exists. */
  exists: boolean;
  /** Where the shortcut is, or would be created. */
  path: string;
  /** False when the running build manages its own shortcuts. */
  canCreate: boolean;
  /** Why creation is unavailable, when it is. */
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export interface Settings {
  'workbench.theme': string;
  'workbench.showMinimap': boolean;
  'workbench.showBreadcrumbs': boolean;
  'workbench.sidebarPosition': 'left' | 'right';
  'editor.fontSize': number;
  'editor.fontFamily': string;
  'editor.tabSize': number;
  'editor.insertSpaces': boolean;
  'editor.wordWrap': 'off' | 'on' | 'bounded';
  'editor.lineNumbers': 'on' | 'off' | 'relative';
  'editor.renderWhitespace': 'none' | 'boundary' | 'all';
  'editor.formatOnSave': boolean;
  'editor.autoSave': 'off' | 'afterDelay' | 'onFocusChange';
  'editor.autoSaveDelayMs': number;
  'terminal.fontSize': number;
  'terminal.fontFamily': string;
  'terminal.defaultShell': string | null;
  'terminal.cursorBlink': boolean;
  'diagnostics.enableEslint': boolean;
  'diagnostics.enableTypeScript': boolean;
  'telemetry.enabled': boolean;
  'update.checkAutomatically': boolean;
  /** Set once the first-run desktop shortcut offer has been answered. */
  'shortcut.promptAnswered': boolean;
}

export type SettingKey = keyof Settings;

/* -------------------------------------------------------------------------- */
/* Application info and updates                                                */
/* -------------------------------------------------------------------------- */

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: NodeJS.Platform;
  arch: string;
  isPackaged: boolean;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

/* -------------------------------------------------------------------------- */
/* IPC result envelope                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every IPC handler returns this envelope instead of throwing across the
 * process boundary, where stack traces and error classes would be lost.
 */
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; cause?: string; solution?: string } };
