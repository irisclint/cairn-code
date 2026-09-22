import type { DemoLanguage } from './highlight';

export interface DemoFile {
  name: string;
  language: DemoLanguage;
  /** The two letter tile shown on the tab, and its colour. */
  badge: string;
  colour: string;
  /** True when the badge colour is light enough to need dark text. */
  darkText?: boolean;
  source: string;
}

/**
 * The files the demo opens with.
 *
 * Each one carries mistakes that are ordinary rather than contrived: the kind
 * that survive review because the line reads correctly. Every one of them is
 * found by a rule in analyzer.ts, so the panel is never empty on load.
 */
export const DEMO_FILES: DemoFile[] = [
  {
    name: 'session.ts',
    language: 'typescript',
    badge: 'TS',
    colour: '#3178c6',
    source: `interface Session {
  id: string;
  expiresIn: number;
}

const session: Session = {
  id: 'a41f',
  expiresIn: '3600',
};

export function refresh(token) {
  return session.id + token;
}
`
  },
  {
    name: 'cart.js',
    language: 'javascript',
    badge: 'JS',
    colour: '#e8c65b',
    darkText: true,
    source: `var items = [
  { name: 'Keyboard', price: 89 },
  { name: 'Cable', price: 12 },
];

const shipping = 4.5;

export function total(cart) {
  let sum = 0;
  for (const item of cart) {
    if (item.price == null) continue;
    sum += item.price;
  }
  return sum;
}
`
  },
  {
    name: 'digest.py',
    language: 'python',
    badge: 'PY',
    colour: '#3b74a8',
    source: `import json
import hashlib


def collect(entries, seen=[]):
    for entry in entries:
        if entry == None:
            continue
        try:
            seen.append(hashlib.sha1(entry).hexdigest())
        except:
            pass
    return seen
`
  }
];

export interface Mistake {
  label: string;
  /** Appended to the current source when the chip is used. */
  snippet: string;
  language: DemoLanguage;
}

/**
 * One click ways to break the file.
 *
 * A visitor who does not want to type still needs a way to see the panel react,
 * and these are the mistakes worth showing: each has a cause that is genuinely
 * surprising the first time you meet it.
 */
export const MISTAKES: Mistake[] = [
  {
    label: 'Loose equality',
    language: 'typescript',
    snippet: `\nif (session.expiresIn == '3600') {\n  refresh('');\n}\n`
  },
  {
    label: 'Untyped parameter',
    language: 'typescript',
    snippet: `\nexport function expire(session, reason) {\n  return reason;\n}\n`
  },
  {
    label: 'Leftover debugger',
    language: 'javascript',
    snippet: `\nexport function audit() {\n  debugger;\n}\n`
  },
  {
    label: 'var in a loop',
    language: 'javascript',
    snippet: `\nfor (var index = 0; index < 3; index++) {\n  setTimeout(() => console.log(index));\n}\n`
  },
  {
    label: 'Mutable default',
    language: 'python',
    snippet: `\n\ndef tally(rows, totals={}):\n    return totals\n`
  },
  {
    label: 'Bare except',
    language: 'python',
    snippet: `\n\ndef parse(raw):\n    try:\n        return json.loads(raw)\n    except:\n        return None\n`
  }
];
