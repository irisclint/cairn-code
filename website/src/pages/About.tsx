import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GitHub, Shield, Bolt, Lightbulb } from '../components/Icons';
import { REPOSITORY_URL, docsFile, LANGUAGE_COUNT, THEME_COUNT } from '../data/content';

const PRINCIPLES = [
  {
    icon: Lightbulb,
    title: 'An error that does not help is a bug',
    body: 'Not a style preference, a defect. Every error Causeway raises carries a message, a cause and a fix, and a change that adds one without the other two does not get merged. The same rule applies to its own failures: when a native module will not load, the editor says which command rebuilds it.'
  },
  {
    icon: Shield,
    title: 'The renderer is treated as hostile',
    body: 'It runs the most third party code in the application, so it gets no access to Node at all. Everything reaches the system through one bridge with one function per allowed operation. An end to end test asserts on every build that no Node internals leaked into the page.'
  },
  {
    icon: Bolt,
    title: 'Performance is a budget, not a hope',
    body: 'Under two seconds cold, a 50,000 line file without lag. Those numbers drove real decisions: one editor instance for the whole app, language services in workers, and a reduced feature set above 4 MB where the minimap would start costing more than it gives. Idle memory was meant to stay under 400 MB and this release measures 328. The figure published for 1.0.0 was 420 and was recorded as a miss; nothing was done to memory in between, so the difference is the measurement, not the software, and the repository says so rather than claiming an improvement it did not make.'
  }
];

const STACK = [
  { name: 'Electron', role: 'Desktop shell, one process for the system and one for the interface' },
  { name: 'Monaco', role: 'The editor core, with its language services running in web workers' },
  { name: 'XTerm and node-pty', role: 'A real pseudo terminal, not a command runner' },
  {
    name: 'React and Zustand',
    role: 'Interface and state, split so a panel resize never re-renders the editor'
  },
  { name: 'TypeScript', role: 'Strict mode across three projects, no implicit any anywhere' },
  { name: 'Vitest and Playwright', role: '991 tests over the units, the integrations and the built app' }
];

const ROADMAP = [
  {
    status: 'done' as const,
    title: 'Editor, terminal, themes, diagnostics',
    body: `The workbench, ${LANGUAGE_COUNT} languages, ${THEME_COUNT} themes, workspace search, the command palette, and the explanation layer that the whole project is named for.`
  },
  {
    status: 'done' as const,
    title: 'Source control',
    body: 'Status, staging, commits, diffs and branch management, driven through the git command line so that your own configuration, hooks and credential helpers apply exactly as they do in a terminal.'
  },
  {
    status: 'done' as const,
    title: 'Debugging',
    body: 'Breakpoints, stepping, the call stack and the variables, over the Debug Adapter Protocol. Adapters come from the project rather than being bundled, and launch.json is read from where projects already keep it.'
  },
  {
    status: 'done' as const,
    title: 'Extensions',
    body: 'A sandboxed host where extension code runs with no Node, no filesystem and no network, a closed permission list shown before installing, and a marketplace client that verifies what it downloads.'
  },
  {
    status: 'next' as const,
    title: 'A published registry',
    body: 'The marketplace client is finished and there is no catalogue for it to read. Until one is published the panel says so, with the setting to point it at your own.'
  },
  {
    status: 'later' as const,
    title: 'Language servers',
    body: 'Clients for the Language Server Protocol, so that the explanation layer covers every language rather than the TypeScript family and whatever ESLint reaches.'
  }
];

export function About(): JSX.Element {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">About</span>
          <h1 className="page-hero__title">
            Built around one idea about
            <br />
            what an editor owes you.
          </h1>
          <p className="page-hero__lead">
            Causeway started from a small frustration that turns out to be expensive: an editor will happily
            tell you that a type is not assignable, and then leave you to work out what that means for the
            line you are looking at.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="prose stack about-prose">
            <h2>What it is</h2>
            <p>
              A standalone code editor for Windows, macOS and Linux. It opens a folder, highlights{' '}
              {LANGUAGE_COUNT} languages, runs a real terminal in the bottom panel, and reports every problem
              with four answers instead of one.
            </p>
            <p>
              It is not a fork. It is written from scratch on the same public building blocks the well known
              editors use, Electron and Monaco, both open source and both available to anyone. What sits on
              top of them, the interface, the theme engine, the state layer and the diagnostic explanation
              catalog, is its own.
            </p>
            <p>
              It is MIT licensed, and there is no paid tier and nothing planned. The source is public: every
              line the installers are built from is readable, and the build that produces them is a file in
              the same repository.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Principles</span>
            <h2 className="section-title">Three rules that shaped the code</h2>
            <p className="section-lead">
              Every project has principles on a page. These are the three that actually caused code to be
              written differently, and each is enforced in review.
            </p>
          </div>

          <ul className="grid grid--3">
            {PRINCIPLES.map((principle) => (
              <li key={principle.title} className="card">
                <span className="card__icon">
                  <principle.icon size={19} />
                </span>
                <h3 className="card__title">{principle.title}</h3>
                <p className="card__body">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <hr className="rule" />

      <section className="section section--tight">
        <div className="container">
          <div className="split">
            <div className="split__copy stack">
              <span className="eyebrow">How it is built</span>
              <h2 className="section-title">Three processes, one rule</h2>
              <p className="section-lead">
                The main process owns the system: windows, the menu, the filesystem, search and terminal
                processes. The renderer owns the entire interface. Between them sits a preload bridge that
                exposes exactly one function per allowed operation, and nothing else.
              </p>
              <p className="section-lead">
                The cost is that every file read is a round trip. The benefit is that a bug in any of the
                third party code running in the interface cannot reach your home directory. That trade is
                deliberate and it is not negotiable.
              </p>
              <a
                className="link-arrow"
                href={docsFile('architecture/overview.md')}
                target="_blank"
                rel="noreferrer noopener"
              >
                Read the architecture notes <ArrowRight size={17} />
              </a>
            </div>

            <div className="split__visual">
              <ul className="stack-list">
                {STACK.map((item) => (
                  <li key={item.name} className="stack-list__item">
                    <span className="stack-list__name">{item.name}</span>
                    <span className="stack-list__role">{item.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="section section--tight">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Roadmap</span>
            <h2 className="section-title">What is done and what is not</h2>
            <p className="section-lead">
              Causeway is at 1.1.0. Inside the application, the panels for unfinished features say
              so rather than showing controls that do nothing, and this page does the same.
            </p>
          </div>

          <ol className="roadmap">
            {ROADMAP.map((item) => (
              <li key={item.title} className={'roadmap__item roadmap__item--' + item.status}>
                <span className="roadmap__marker" aria-hidden="true" />
                <div>
                  <h3 className="roadmap__title">
                    {item.title}
                    <span className="roadmap__status">
                      {item.status === 'done' ? 'Shipped' : item.status === 'next' ? 'Next' : 'Later'}
                    </span>
                  </h3>
                  <p className="roadmap__body">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="prose stack about-prose">
            <h2>On the name</h2>
            <p>
              A causeway is a road built up across ground you could not otherwise cross: a marsh, a tidal
              flat, a stretch of water. Somebody laid it so that everyone after them could walk over what had
              stopped them. That is the editor in one object. An error is the ground you cannot cross, and
              the cause and the fix are the road across it, already built, waiting where you are standing
              rather than three search results away.
            </p>
            <p>
              The word also contains <em>cause</em>, which is one of the four answers every problem here
              carries, and the one every other editor leaves out.
            </p>
            <p>
              The mark is the crossing seen from the side: a deck on three piers, over a waterline. At
              sixteen pixels it reduces to one bar over three legs, which is the size that decides whether a
              logo works at all.
            </p>

            <h2>Contributing</h2>
            <p>
              Three kinds of change are genuinely self contained and useful: an explanation for a compiler
              code that currently falls back to the generic message, a language definition, or a theme. Each
              is a small, reviewable change with a documented path, and the contributing guide walks through
              all three.
            </p>
          </div>

          <div className="about-actions">
            <a
              className="button button--secondary"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              <GitHub size={18} />
              Browse the source
            </a>
            <Link to="/download" className="button button--primary">
              Download Causeway
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
