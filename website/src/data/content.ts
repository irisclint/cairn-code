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

export const VERSION = '1.0.0-alpha.1';

/**
 * Whether tagged release binaries exist yet.
 *
 * While this is false the download buttons explain that the alpha has not been
 * published rather than linking to a release asset that would 404. Flip it to
 * true once a tag is pushed and the release workflow has uploaded the
 * installers, and the page becomes a working download page with no other edit.
 */
export const RELEASES_PUBLISHED = false;

/** Whether the source repository is readable by the public. */
export const SOURCE_IS_PUBLIC = true;
export const REPOSITORY_URL = 'https://github.com/irisclint/cairn-code';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
export const DOCS_URL = `${REPOSITORY_URL}/tree/main/docs`;
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

export const LANGUAGE_COUNT = 69;
export const THEME_COUNT = 12;

export interface DownloadTarget {
  id: 'windows' | 'macos' | 'linux';
  label: string;
  requirement: string;
  /** The build most people on this platform want. */
  primary: { label: string; file: string; note: string };
  /** Everything else built for the platform. */
  others: Array<{ label: string; file: string; note?: string }>;
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
        file: `cairn-code-${VERSION}-x64.zip`,
        note: 'Unpack and run, nothing written to the registry'
      }
    ]
  },
  {
    id: 'macos',
    label: 'macOS',
    requirement: 'macOS 12 Monterey or newer',
    primary: {
      label: 'Apple silicon',
      file: `cairn-code-${VERSION}-arm64.dmg`,
      note: 'M1 and later'
    },
    others: [
      { label: 'Intel', file: `cairn-code-${VERSION}-x64.dmg` },
      { label: 'ZIP (Apple silicon)', file: `cairn-code-${VERSION}-arm64.zip` },
      { label: 'ZIP (Intel)', file: `cairn-code-${VERSION}-x64.zip` }
    ]
  },
  {
    id: 'linux',
    label: 'Linux',
    requirement: 'A 64-bit distribution with glibc 2.31 or newer',
    primary: {
      label: 'AppImage',
      file: `cairn-code-${VERSION}-x64.AppImage`,
      note: 'Runs anywhere, no installation'
    },
    others: [
      { label: 'Debian and Ubuntu', file: `cairn-code-${VERSION}-x64.deb` },
      { label: 'Fedora and RHEL', file: `cairn-code-${VERSION}-x64.rpm` },
      { label: 'AppImage (ARM64)', file: `cairn-code-${VERSION}-arm64.AppImage` }
    ]
  }
];

export interface Feature {
  icon: 'lightbulb' | 'terminal' | 'palette' | 'languages' | 'search' | 'command' | 'shield' | 'bolt';
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'lightbulb',
    title: 'Errors that explain themselves',
    body: 'Every problem carries four things: what is wrong, where it is, why it happened, and the change to make. No other editor tells you the last two.'
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
    ours: `${LANGUAGE_COUNT} languages, a terminal and ${THEME_COUNT} themes, already there`,
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
      'Git integration, the sandboxed extension host and the debugger are the next milestone. Their panels say so rather than showing controls that do nothing, which is the rule the whole project follows.'
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
