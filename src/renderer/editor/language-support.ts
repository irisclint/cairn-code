import { extname, basename } from '@shared/utils';

export interface LanguageDefinition {
  /** cairn-code language id, also the Monaco id unless monacoId overrides it. */
  id: string;
  /**
   * The Monaco language that provides tokenization for this language.
   *
   * Monaco bundles one grammar for several of the languages cairn-code lists
   * separately: .tsx is tokenized by its typescript grammar, .jsx by
   * javascript, and the single file component formats by html. Pointing at the
   * Monaco id is what keeps syntax highlighting, and for TypeScript the
   * language worker, working for those files, while cairn-code still shows the
   * specific label in the status bar.
   */
  monacoId?: string;
  /** Name shown in the status bar and the language picker. */
  label: string;
  /** File extensions without the leading dot. */
  extensions: string[];
  /** Exact file names that map to this language regardless of extension. */
  filenames?: string[];
  /** Interpreter names matched against a `#!` shebang on the first line. */
  interpreters?: string[];
  /** Line comment token, used by the toggle-comment command. */
  lineComment?: string;
  /** Block comment tokens. */
  blockComment?: [string, string];
  /** Icon key resolved against resources/icons/file-types. */
  icon: string;
}

/**
 * Every language cairn-code recognises.
 *
 * Monaco ships tokenizers for most of these through its `basic-languages`
 * bundle; the ones it does not cover fall back to plain text with the correct
 * label and comment tokens, so commenting and the status bar still behave
 * correctly. Adding a language means adding one entry here plus, if needed, a
 * Monarch grammar in `custom-grammars.ts`.
 */
export const LANGUAGES: LanguageDefinition[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'ts'
  },
  {
    id: 'typescriptreact',
    monacoId: 'typescript',
    label: 'TypeScript React',
    extensions: ['tsx'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'tsx'
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'js'
  },
  {
    id: 'javascriptreact',
    monacoId: 'javascript',
    label: 'JavaScript React',
    extensions: ['jsx'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'jsx'
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['py', 'pyw', 'pyi'],
    interpreters: ['python', 'python3'],
    lineComment: '#',
    icon: 'py'
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['java'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'java'
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['cs', 'csx'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'cs'
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'cpp'
  },
  { id: 'c', label: 'C', extensions: ['c', 'h'], lineComment: '//', blockComment: ['/*', '*/'], icon: 'c' },
  { id: 'go', label: 'Go', extensions: ['go'], lineComment: '//', blockComment: ['/*', '*/'], icon: 'go' },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['rs'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'rs'
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['rb', 'erb', 'gemspec'],
    filenames: ['Gemfile', 'Rakefile'],
    interpreters: ['ruby'],
    lineComment: '#',
    icon: 'rb'
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['php', 'phtml'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'php'
  },
  {
    id: 'swift',
    label: 'Swift',
    extensions: ['swift'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'swift'
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['kt', 'kts'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'kt'
  },
  {
    id: 'scala',
    label: 'Scala',
    extensions: ['scala', 'sc'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'scala'
  },
  {
    id: 'dart',
    label: 'Dart',
    extensions: ['dart'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'dart'
  },
  {
    id: 'lua',
    label: 'Lua',
    extensions: ['lua'],
    interpreters: ['lua'],
    lineComment: '--',
    blockComment: ['--[[', ']]'],
    icon: 'lua'
  },
  {
    id: 'perl',
    label: 'Perl',
    extensions: ['pl', 'pm'],
    interpreters: ['perl'],
    lineComment: '#',
    icon: 'pl'
  },
  { id: 'r', label: 'R', extensions: ['r', 'rmd'], lineComment: '#', icon: 'r' },
  { id: 'julia', label: 'Julia', extensions: ['jl'], interpreters: ['julia'], lineComment: '#', icon: 'jl' },
  { id: 'elixir', label: 'Elixir', extensions: ['ex', 'exs'], lineComment: '#', icon: 'ex' },
  {
    id: 'erlang',
    monacoId: 'plaintext',
    label: 'Erlang',
    extensions: ['erl', 'hrl'],
    lineComment: '%',
    icon: 'erl'
  },
  {
    id: 'clojure',
    label: 'Clojure',
    extensions: ['clj', 'cljs', 'cljc', 'edn'],
    lineComment: ';;',
    icon: 'clj'
  },
  {
    id: 'haskell',
    monacoId: 'plaintext',
    label: 'Haskell',
    extensions: ['hs', 'lhs'],
    lineComment: '--',
    blockComment: ['{-', '-}'],
    icon: 'hs'
  },
  {
    id: 'fsharp',
    label: 'F#',
    extensions: ['fs', 'fsi', 'fsx'],
    lineComment: '//',
    blockComment: ['(*', '*)'],
    icon: 'fs'
  },
  {
    id: 'ocaml',
    monacoId: 'fsharp',
    label: 'OCaml',
    extensions: ['ml', 'mli'],
    blockComment: ['(*', '*)'],
    icon: 'ml'
  },
  {
    id: 'objective-c',
    label: 'Objective-C',
    extensions: ['m', 'mm'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'objc'
  },
  { id: 'vb', label: 'Visual Basic', extensions: ['vb', 'bas'], lineComment: "'", icon: 'vb' },
  {
    id: 'pascal',
    label: 'Pascal',
    extensions: ['pas', 'pp'],
    lineComment: '//',
    blockComment: ['{', '}'],
    icon: 'pas'
  },
  { id: 'zig', monacoId: 'cpp', label: 'Zig', extensions: ['zig'], lineComment: '//', icon: 'zig' },
  { id: 'nim', monacoId: 'python', label: 'Nim', extensions: ['nim', 'nims'], lineComment: '#', icon: 'nim' },
  { id: 'crystal', monacoId: 'ruby', label: 'Crystal', extensions: ['cr'], lineComment: '#', icon: 'cr' },
  {
    id: 'solidity',
    label: 'Solidity',
    extensions: ['sol'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'sol'
  },
  {
    id: 'groovy',
    monacoId: 'java',
    label: 'Groovy',
    extensions: ['groovy', 'gradle'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'groovy'
  },

  {
    id: 'html',
    label: 'HTML',
    extensions: ['html', 'htm', 'xhtml'],
    blockComment: ['<!--', '-->'],
    icon: 'html'
  },
  { id: 'css', label: 'CSS', extensions: ['css'], blockComment: ['/*', '*/'], icon: 'css' },
  {
    id: 'scss',
    label: 'SCSS',
    extensions: ['scss'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'scss'
  },
  {
    id: 'less',
    label: 'Less',
    extensions: ['less'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    icon: 'less'
  },
  {
    id: 'vue',
    monacoId: 'html',
    label: 'Vue',
    extensions: ['vue'],
    blockComment: ['<!--', '-->'],
    icon: 'vue'
  },
  {
    id: 'svelte',
    monacoId: 'html',
    label: 'Svelte',
    extensions: ['svelte'],
    blockComment: ['<!--', '-->'],
    icon: 'svelte'
  },
  {
    id: 'astro',
    monacoId: 'html',
    label: 'Astro',
    extensions: ['astro'],
    blockComment: ['<!--', '-->'],
    icon: 'astro'
  },
  {
    id: 'handlebars',
    label: 'Handlebars',
    extensions: ['hbs', 'handlebars'],
    blockComment: ['{{!--', '--}}'],
    icon: 'hbs'
  },
  { id: 'pug', label: 'Pug', extensions: ['pug', 'jade'], lineComment: '//', icon: 'pug' },
  {
    id: 'xml',
    label: 'XML',
    extensions: ['xml', 'xsd', 'xsl', 'svg', 'plist', 'csproj'],
    blockComment: ['<!--', '-->'],
    icon: 'xml'
  },

  {
    id: 'json',
    label: 'JSON',
    extensions: ['json', 'jsonc', 'json5'],
    filenames: ['.babelrc', '.eslintrc', 'tsconfig.json'],
    lineComment: '//',
    icon: 'json'
  },
  { id: 'yaml', label: 'YAML', extensions: ['yaml', 'yml'], lineComment: '#', icon: 'yaml' },
  {
    id: 'toml',
    monacoId: 'ini',
    label: 'TOML',
    extensions: ['toml'],
    filenames: ['Cargo.lock'],
    lineComment: '#',
    icon: 'toml'
  },
  {
    id: 'ini',
    label: 'INI',
    extensions: ['ini', 'cfg', 'conf', 'properties'],
    lineComment: ';',
    icon: 'ini'
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extensions: ['md', 'markdown', 'mdx'],
    blockComment: ['<!--', '-->'],
    icon: 'md'
  },
  { id: 'restructuredtext', label: 'reStructuredText', extensions: ['rst'], icon: 'rst' },
  {
    id: 'latex',
    monacoId: 'plaintext',
    label: 'LaTeX',
    extensions: ['tex', 'sty', 'cls'],
    lineComment: '%',
    icon: 'tex'
  },
  { id: 'csv', monacoId: 'plaintext', label: 'CSV', extensions: ['csv', 'tsv'], icon: 'csv' },

  {
    id: 'shell',
    label: 'Shell Script',
    extensions: ['sh', 'bash', 'zsh', 'fish', 'ksh'],
    filenames: ['.bashrc', '.zshrc', '.profile', '.bash_profile'],
    interpreters: ['sh', 'bash', 'zsh', 'fish'],
    lineComment: '#',
    icon: 'sh'
  },
  {
    id: 'powershell',
    label: 'PowerShell',
    extensions: ['ps1', 'psm1', 'psd1'],
    lineComment: '#',
    blockComment: ['<#', '#>'],
    icon: 'ps1'
  },
  { id: 'bat', label: 'Batch', extensions: ['bat', 'cmd'], lineComment: 'REM', icon: 'bat' },
  {
    id: 'dockerfile',
    label: 'Dockerfile',
    extensions: ['dockerfile'],
    filenames: ['Dockerfile', 'Containerfile', 'dockerfile'],
    lineComment: '#',
    icon: 'docker'
  },
  {
    id: 'makefile',
    monacoId: 'shell',
    label: 'Makefile',
    extensions: ['mk'],
    filenames: ['Makefile', 'makefile', 'GNUmakefile'],
    lineComment: '#',
    icon: 'make'
  },
  {
    id: 'cmake',
    monacoId: 'shell',
    label: 'CMake',
    extensions: ['cmake'],
    filenames: ['CMakeLists.txt'],
    lineComment: '#',
    icon: 'cmake'
  },
  {
    id: 'terraform',
    monacoId: 'hcl',
    label: 'Terraform',
    extensions: ['tf', 'tfvars'],
    lineComment: '#',
    blockComment: ['/*', '*/'],
    icon: 'tf'
  },
  { id: 'hcl', label: 'HCL', extensions: ['hcl', 'nomad'], lineComment: '#', icon: 'hcl' },
  { id: 'graphql', label: 'GraphQL', extensions: ['graphql', 'gql'], lineComment: '#', icon: 'graphql' },
  {
    id: 'sql',
    label: 'SQL',
    extensions: ['sql', 'ddl', 'dml'],
    lineComment: '--',
    blockComment: ['/*', '*/'],
    icon: 'sql'
  },
  { id: 'protobuf', label: 'Protocol Buffers', extensions: ['proto'], lineComment: '//', icon: 'proto' },
  { id: 'diff', monacoId: 'plaintext', label: 'Diff', extensions: ['diff', 'patch'], icon: 'diff' },
  {
    id: 'git',
    monacoId: 'ini',
    label: 'Git',
    extensions: ['gitignore', 'gitattributes', 'gitmodules'],
    filenames: ['.gitignore', '.gitattributes', '.gitmodules'],
    lineComment: '#',
    icon: 'git'
  },
  {
    id: 'env',
    monacoId: 'ini',
    label: 'Environment File',
    extensions: ['env'],
    filenames: ['.env', '.env.local', '.env.production'],
    lineComment: '#',
    icon: 'env'
  },
  { id: 'log', monacoId: 'plaintext', label: 'Log File', extensions: ['log'], icon: 'log' },
  { id: 'plaintext', label: 'Plain Text', extensions: ['txt', 'text'], icon: 'txt' }
];

const byExtension = new Map<string, LanguageDefinition>();
const byFilename = new Map<string, LanguageDefinition>();
const byInterpreter = new Map<string, LanguageDefinition>();
const byId = new Map<string, LanguageDefinition>();

for (const language of LANGUAGES) {
  byId.set(language.id, language);
  for (const extension of language.extensions) {
    if (!byExtension.has(extension)) byExtension.set(extension, language);
  }
  for (const filename of language.filenames ?? []) {
    byFilename.set(filename.toLowerCase(), language);
  }
  for (const interpreter of language.interpreters ?? []) {
    byInterpreter.set(interpreter, language);
  }
}

export const PLAIN_TEXT: LanguageDefinition =
  byId.get('plaintext') ?? (LANGUAGES[LANGUAGES.length - 1] as LanguageDefinition);

/** Total number of recognised languages, shown in the About dialog. */
export const LANGUAGE_COUNT = LANGUAGES.length;

/** Looks up a language by its Monaco id. */
export function getLanguageById(id: string): LanguageDefinition | undefined {
  return byId.get(id);
}

/**
 * Resolves the language of a file.
 *
 * Resolution order is exact file name, then extension, then shebang. This order
 * matters: `Dockerfile` and `Makefile` carry no extension, and a `.env.local`
 * would otherwise be detected as the "local" extension.
 */
export function detectLanguage(filePath: string, firstLine?: string): LanguageDefinition {
  const name = basename(filePath);

  const byExactName = byFilename.get(name.toLowerCase());
  if (byExactName) return byExactName;

  const extension = extname(filePath);
  if (extension) {
    const match = byExtension.get(extension);
    if (match) return match;
  }

  // Dotfiles such as `.gitignore` have no extension by the usual definition.
  if (name.startsWith('.')) {
    const dotMatch = byExtension.get(name.slice(1).toLowerCase());
    if (dotMatch) return dotMatch;
  }

  if (firstLine?.startsWith('#!')) {
    const interpreter = firstLine
      .slice(2)
      .trim()
      .split(/[\s/]+/)
      .filter((part) => part !== 'env' && part.length > 0)
      .pop();
    if (interpreter) {
      const match = byInterpreter.get(interpreter);
      if (match) return match;
    }
  }

  return PLAIN_TEXT;
}

/** Returns the icon key for a file, used by the explorer and the tab strip. */
export function getFileIcon(filePath: string): string {
  return detectLanguage(filePath).icon;
}

/**
 * Returns the Monaco language id to give a model for this language.
 *
 * Always use this, never `definition.id`, when creating or retagging a model:
 * an id Monaco does not know has no tokenizer, which would silently leave the
 * file without syntax highlighting.
 */
export function toMonacoLanguageId(language: LanguageDefinition): string {
  return language.monacoId ?? language.id;
}
