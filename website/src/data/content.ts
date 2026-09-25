/**
 * Every fact the site states about cairn-code, in one place.
 *
 * Numbers here are the real ones from the editor: the language count comes
 * from its language table, the theme count from its theme registry. Keeping
 * them in one module means a claim on the site cannot quietly drift from the
 * product.
 */

/** The product name, as it is written everywhere on this site. */
export const PRODUCT = 'cairn-code';

export const VERSION = '1.0.0';

/**
 * The files actually attached to the release for this version.
 *
 * This list is the site's single source of truth about what can be downloaded.
 * Every link on the download page is derived from it, so a build that is not
 * here renders as a stated gap instead of a link that returns 404, and adding a
 * platform after the fact is one line in one file.
 *
 * Windows is built on a maintainer's machine. macOS and Linux need runners of
 * their own and are not here yet, which the page says in those words.
 */
export const PUBLISHED_ASSETS: readonly string[] = [
  `cairn-code-${VERSION}-x64-setup.exe`,
  `cairn-code-${VERSION}-arm64-setup.exe`,
  `cairn-code-${VERSION}-win-x64.zip`
];

/** Whether a given build is on the release and therefore downloadable. */
export function isPublished(file: string): boolean {
  return PUBLISHED_ASSETS.includes(file);
}

/** Whether the source repository is readable by the public. */
export const SOURCE_IS_PUBLIC = true;
export const REPOSITORY_URL = 'https://github.com/irisclint/cairn-code';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
export const DOCS_URL = `${REPOSITORY_URL}/tree/main/docs`;

/**
 * A link to one documentation file.
 *
 * GitHub serves directories under /tree and files under /blob. Appending a
 * file name to DOCS_URL produced /tree/main/docs/CONTRIBUTING.md, which only
 * resolves because GitHub quietly corrects it, and which is the wrong URL to
 * hand anyone who copies it.
 */
export function docsFile(path: string): string {
  return `${REPOSITORY_URL}/blob/main/docs/${path}`;
}
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

export const LANGUAGE_COUNT = 69;
export const THEME_COUNT = 12;

/** The tag the release for this version sits on. */
export const TAG = `v${VERSION}`;

/**
 * Everything on the release that is not a platform build.
 *
 * The source archives are produced by GitHub for the tag itself, so they exist
 * for every version whether or not a binary was ever built for a platform, and
 * the checksum file is what makes an unsigned download checkable. Leaving them
 * off the page means the answer to "can I get everything here" is no.
 */
export interface ExtraDownload {
  label: string;
  note: string;
  href: string;
}

export const EXTRA_DOWNLOADS: ExtraDownload[] = [
  {
    label: 'Source code (zip)',
    note: 'The exact tree these builds came from',
    href: `${REPOSITORY_URL}/archive/refs/tags/${TAG}.zip`
  },
  {
    label: 'Source code (tar.gz)',
    note: 'The same tree, for anything that prefers a tarball',
    href: `${REPOSITORY_URL}/archive/refs/tags/${TAG}.tar.gz`
  },
  {
    label: 'SHA256SUMS.txt',
    note: 'Check a download before you run it',
    href: `${RELEASES_URL}/download/${TAG}/SHA256SUMS.txt`
  }
];

export interface DownloadAsset {
  label: string;
  file: string;
  note?: string;
}

export interface DownloadTarget {
  id: 'windows' | 'macos' | 'linux';
  label: string;
  requirement: string;
  /** The build most people on this platform want. */
  primary: DownloadAsset & { note: string };
  /** Everything else built for the platform. */
  others: DownloadAsset[];
  /**
   * Why this platform has no binaries, in one sentence, shown in place of the
   * buttons when none of its files are on the release.
   */
  pending: string;
}

export const DOWNLOADS: DownloadTarget[] = [
  {
    id: 'windows',
    label: 'Windows',
    requirement: 'Windows 10 or 11',
    primary: {
      label: 'Installer',
      file: `cairn-code-${VERSION}-x64-setup.exe`,
      note: '64-bit, installs per user, no admin needed'
    },
    others: [
      { label: 'Installer (ARM64)', file: `cairn-code-${VERSION}-arm64-setup.exe` },
      {
        label: 'Portable ZIP',
        file: `cairn-code-${VERSION}-win-x64.zip`,
        note: 'Unpack and run, nothing written to the registry'
      }
    ],
    pending: 'Not built for this architecture yet.'
  },
  {
    id: 'macos',
    label: 'macOS',
    requirement: 'macOS 12 Monterey or newer',
    primary: {
      label: 'Apple silicon',
      file: `cairn-code-${VERSION}-mac-arm64.dmg`,
      note: 'M1 and later'
    },
    others: [
      { label: 'Intel', file: `cairn-code-${VERSION}-mac-x64.dmg` },
      { label: 'ZIP (Apple silicon)', file: `cairn-code-${VERSION}-mac-arm64.zip` },
      { label: 'ZIP (Intel)', file: `cairn-code-${VERSION}-mac-x64.zip` }
    ],
    pending:
      'A macOS build has to be produced and notarised on a Mac, and this release was not built on one. Building from source works today.'
  },
  {
    id: 'linux',
    label: 'Linux',
    requirement: 'A 64-bit distribution with glibc 2.31 or newer',
    primary: {
      label: 'AppImage',
      file: `cairn-code-${VERSION}-linux-x64.AppImage`,
      note: 'Runs anywhere, no installation'
    },
    others: [
      { label: 'Debian and Ubuntu', file: `cairn-code-${VERSION}-linux-x64.deb` },
      { label: 'Fedora and RHEL', file: `cairn-code-${VERSION}-linux-x64.rpm` },
      { label: 'AppImage (ARM64)', file: `cairn-code-${VERSION}-linux-arm64.AppImage` }
    ],
    pending:
      'The deb, rpm and AppImage targets have to be assembled on Linux, and this release was not built there. Building from source works today.'
  }
];

export interface Feature {
  icon:
    | 'lightbulb'
    | 'terminal'
    | 'palette'
    | 'languages'
    | 'search'
    | 'command'
    | 'shield'
    | 'bolt'
    | 'branch'
    | 'bug'
    | 'puzzle'
    | 'settings';
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'lightbulb',
    title: 'Errors that explain themselves',
    body: 'Every problem carries four things: what is wrong, where it is, why it happened, and the change to make. From the TypeScript service and from your project\u2019s own ESLint, explained the same way.'
  },
  {
    icon: 'languages',
    title: `${LANGUAGE_COUNT} languages`,
    body: 'Detected by extension, by exact file name for things like Dockerfile and Makefile, and by the shebang line for scripts with no extension at all.'
  },
  {
    icon: 'terminal',
    title: 'A real terminal',
    body: 'A genuine pseudo terminal, not a command runner. It finds your shell, starts in your project, and keeps its scrollback across tabs.'
  },
  {
    icon: 'palette',
    title: `${THEME_COUNT} themes`,
    body: 'Dark, light and two high contrast. Hover one in the picker to see it on your own code, and it repaints in a single frame.'
  },
  {
    icon: 'branch',
    title: 'Source control',
    body: 'Status, staging, commits, diffs and branches, driven through the git command line so your own config, hooks, credential helpers and signing keys apply exactly as they do in a terminal.'
  },
  {
    icon: 'bug',
    title: 'A real debugger',
    body: 'Breakpoints in the margin, stepping, the call stack and the variables. It speaks the Debug Adapter Protocol and reads launch.json, so a project you already debug elsewhere works here unchanged.'
  },
  {
    icon: 'puzzle',
    title: 'Extensions, sandboxed',
    body: 'Extension code runs with no Node, no filesystem and no network, and every capability it asks for is listed before you install it. Verified by a test that tries to escape.'
  },
  {
    icon: 'command',
    title: 'Keyboard first',
    body: 'One command registry drives the menu, the palette and every shortcut, so they can never disagree about what a command does.'
  },
  {
    icon: 'search',
    title: 'Search that scales',
    body: 'Regular expressions, case, whole word and glob filters, running off the UI thread so a large repository never freezes the window.'
  },
  {
    icon: 'bolt',
    title: 'Fast by design',
    body: 'Under two seconds cold. One editor instance for the whole app, language services in workers, and a reduced feature set above 4 MB.'
  },
  {
    icon: 'settings',
    title: 'Settings you can read',
    body: 'One JSON file, with every key documented and none of it hidden behind a search box. Copy it between machines, keep it in a repository, or edit it in cairn-code itself.'
  },
  {
    icon: 'shield',
    title: 'Private by default',
    body: 'No telemetry until you switch it on. No remote code in the editor. The renderer cannot reach your filesystem directly, and a test proves it on every build.'
  }
];

export interface ComparisonRow {
  claim: string;
  ours: string;
  others: string;
}

export const COMPARISON: ComparisonRow[] = [
  {
    claim: 'When something breaks',
    ours: 'The message, the cause and the fix, in plain language',
    others: 'The compiler message, and a search engine'
  },
  {
    claim: 'Out of the box',
    ours: `${LANGUAGE_COUNT} languages, git, a debugger and a terminal, already there`,
    others: 'A marketplace trip before the first file looks right'
  },
  {
    claim: 'Telemetry',
    ours: 'Off, and nothing is sent until you turn it on',
    others: 'On, with a settings page to find and a policy to read'
  },
  {
    claim: 'What it costs',
    ours: 'Free and MIT licensed, with no paid tier planned',
    others: 'Free, with parts you cannot see or rebuild'
  }
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: FaqItem[] = [
  {
    question: 'Is this a fork of another editor?',
    answer: `No. ${PRODUCT} is written from scratch on the same public building blocks the others use, Electron and Monaco, both open source. The interface, the theme format, the diagnostic layer and the identity are its own.`
  },
  {
    question: 'Does it send my code anywhere?',
    answer:
      'No. There is no telemetry unless you switch it on in Settings, and the only network request is the update check, which you can also disable. Nothing about your code leaves the machine.'
  },
  {
    question: 'Can I use my existing themes?',
    answer:
      'Not as a direct drop-in, but porting one is mostly a copy of its colors and tokenColors blocks. The theme format and the differences are documented for extension authors.'
  },
  {
    question: 'What is not finished yet?',
    answer:
      'No extension registry has been published, so the marketplace has a client and nothing to browse; the panel says so rather than showing an empty store. Builds are not code signed yet. Remote development and notebooks are not planned for this version.'
  },
  {
    question: 'Which languages get full type checking?',
    answer:
      'TypeScript and JavaScript today, through the bundled language service. Everything else gets syntax highlighting, comment handling and the explanation layer. Language server support is planned.'
  },
  {
    question: 'How do I report a problem?',
    answer: `Open an issue on GitHub. The About dialog has a "Copy details" button that fills in your version and platform, and the Problems panel text can be pasted straight in.`
  }
];

export interface Stat {
  value: string;
  label: string;
}

export const STATS: Stat[] = [
  { value: `${LANGUAGE_COUNT}`, label: 'languages' },
  { value: `${THEME_COUNT}`, label: 'themes' },
  { value: '< 2s', label: 'cold start' },
  { value: '0', label: 'telemetry' }
];
