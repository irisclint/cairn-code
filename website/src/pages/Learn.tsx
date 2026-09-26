import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { CodeSurface, type CodeSurfaceHandle } from '../components/CodeSurface';
import { Reveal } from '../components/Motion';
import { ArrowRight, Check, Cross, Lightbulb } from '../components/Icons';
import { analyze } from '../demo/analyzer';
import { check, type CheckResult } from '../learn/checker';
import { PLANNED_TRACKS, TRACKS, type Track } from '../learn/curriculum';
import { PRODUCT } from '../data/content';

const STORAGE_KEY = 'causeway.learn.progress';

/**
 * The Learn page.
 *
 * Built on the same editor as the demo in the hero, so the place a beginner
 * writes their first loop is the place they will later read a stack trace.
 * Lessons are checked rather than marked: the page runs or reads what was
 * actually written and answers with the failing case, never with a verdict on
 * its own.
 */
export function Learn(): JSX.Element {
  const [trackId, setTrackId] = useState<string | null>(null);
  const track = TRACKS.find((entry) => entry.id === trackId) ?? null;

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Learn</span>
          <h1 className="page-hero__title">Start with nothing. Leave with working code.</h1>
          <p className="page-hero__lead">
            Short lessons that end in code you wrote yourself. Nothing is multiple choice: every lesson is
            checked against what you actually typed, and a failing check tells you which case broke and why.
          </p>
        </div>
      </section>

      {track ? (
        <TrackView track={track} onLeave={() => setTrackId(null)} />
      ) : (
        <TrackPicker onPick={setTrackId} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Choosing a language                                                         */
/* -------------------------------------------------------------------------- */

function TrackPicker({ onPick }: { onPick: (id: string) => void }): JSX.Element {
  const done = loadProgress();

  return (
    <section className="section section--tight">
      <div className="container">
        <Reveal className="section-head">
          <h2 className="section-title">Pick a language</h2>
          <p className="section-lead">
            Either is a reasonable first language, and the ideas carry across. Choose Python if you want the
            gentler syntax, JavaScript if you want to see results in a browser.
          </p>
        </Reveal>

        <ul className="grid grid--2 track-grid">
          {TRACKS.map((track, index) => {
            const finished = track.lessons.filter((lesson) => done.has(lesson.id)).length;

            return (
              <Reveal as="li" key={track.id} delay={index * 70}>
                <button type="button" className="track-card" onClick={() => onPick(track.id)}>
                  <span
                    className="track-card__tile"
                    style={{ background: track.colour, color: track.darkText ? '#1a1b26' : '#fff' }}
                  >
                    {track.badge}
                  </span>
                  <h3 className="track-card__title">{track.name}</h3>
                  <p className="track-card__blurb">{track.blurb}</p>

                  <span className="track-card__meta">
                    {track.lessons.length} lessons
                    {finished > 0 ? ` · ${finished} done` : ''}
                  </span>
                  <span className="track-card__go">
                    Start <ArrowRight size={16} />
                  </span>
                </button>
              </Reveal>
            );
          })}
        </ul>

        <p className="track-planned">
          Planned next: {PLANNED_TRACKS.join(', ')}. They are listed here rather than shown as empty cards,
          which is the same rule {PRODUCT} follows for its own unfinished panels.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Working through a track                                                     */
/* -------------------------------------------------------------------------- */

function TrackView({ track, onLeave }: { track: Track; onLeave: () => void }): JSX.Element {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => loadProgress());
  const surface = useRef<CodeSurfaceHandle>(null);

  const lesson = track.lessons[index] as Track['lessons'][number];
  const code = drafts[lesson.id] ?? lesson.starter;

  // The same analyzer that powers the hero, so a learner sees the editor's
  // diagnostics from the first lesson rather than meeting them later.
  const markers = useMemo(() => analyze(code, track.id), [code, track.id]);

  useEffect(() => {
    setResult(null);
    setShowSolution(false);
  }, [lesson.id]);

  function edit(next: string): void {
    setDrafts((previous) => ({ ...previous, [lesson.id]: next }));
    setResult(null);
  }

  async function runCheck(): Promise<void> {
    setBusy(true);
    const outcome = await check(lesson, code);
    setBusy(false);
    setResult(outcome);

    if (outcome.passed) {
      const next = new Set(done);
      next.add(lesson.id);
      setDone(next);
      saveProgress(next);
    }
  }

  const finished = track.lessons.filter((entry) => done.has(entry.id)).length;
  const isLast = index === track.lessons.length - 1;

  return (
    <section className="section section--tight">
      <div className="container learn">
        <aside className="learn__rail">
          <button type="button" className="learn__back" onClick={onLeave}>
            All languages
          </button>

          <div className="learn__progress">
            <div className="learn__progress-bar">
              <span style={{ width: `${(finished / track.lessons.length) * 100}%` }} />
            </div>
            <span className="learn__progress-text">
              {finished} of {track.lessons.length} done
            </span>
          </div>

          <ol className="learn__list">
            {track.lessons.map((entry, position) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={
                    'learn__item' +
                    (position === index ? ' learn__item--active' : '') +
                    (done.has(entry.id) ? ' learn__item--done' : '')
                  }
                  onClick={() => setIndex(position)}
                >
                  <span className="learn__item-mark">
                    {done.has(entry.id) ? <Check size={13} /> : position + 1}
                  </span>
                  {entry.title}
                </button>
              </li>
            ))}
          </ol>

          <p className="learn__note">{track.checking}</p>
        </aside>

        <div className="learn__main">
          <header className="learn__head">
            <span className="eyebrow">
              {track.name} · Lesson {index + 1}
            </span>
            <h2 className="learn__title">{lesson.title}</h2>
            <p className="learn__goal">{lesson.goal}</p>
          </header>

          <div className="learn__teach">
            {lesson.teach.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>

          <div className="learn__task">
            <span className="learn__task-label">Your turn</span>
            <p>{lesson.task}</p>
          </div>

          <div className="learn__editor">
            <CodeSurface
              value={code}
              onChange={edit}
              language={track.id}
              markers={markers}
              height="230px"
              ariaLabel={`Lesson editor for ${lesson.title}.`}
              handleRef={surface}
            />
          </div>

          <div className="learn__actions">
            <button type="button" className="button button--primary" onClick={runCheck} disabled={busy}>
              {busy ? 'Checking…' : 'Check my code'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => edit(lesson.starter)}
            >
              Reset
            </button>
            <button
              type="button"
              className="learn__reveal"
              onClick={() => setShowSolution((value) => !value)}
            >
              {showSolution ? 'Hide the solution' : 'Show me one that works'}
            </button>
          </div>

          <div aria-live="polite">
            {result ? <Feedback result={result} /> : null}

            {result?.passed && !isLast ? (
              <button
                type="button"
                className="button button--primary learn__next"
                onClick={() => setIndex(index + 1)}
              >
                Next lesson <ArrowRight size={17} />
              </button>
            ) : null}

            {result?.passed && isLast ? (
              <div className="learn__done">
                <h3>That is the track.</h3>
                <p>
                  You have written a function, a loop and a condition that all work. The next step is a real
                  project in a real editor, where the same explanations appear on your own code.
                </p>
                <Link to="/download" className="button button--primary">
                  Get {PRODUCT}
                </Link>
              </div>
            ) : null}
          </div>

          {showSolution ? (
            <div className="learn__solution">
              <span className="learn__solution-label">One that works</span>
              <pre>
                <code>{lesson.solution}</code>
              </pre>
              <p className="learn__solution-note">
                Reading a solution is not the same as writing one. Close this, clear the editor, and type it
                again from memory before moving on.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Feedback({ result }: { result: CheckResult }): JSX.Element {
  if (result.failure) {
    return (
      <div className="feedback feedback--error">
        <h3 className="feedback__title">{result.failure.message}</h3>
        <dl className="feedback__detail">
          <dt>Why</dt>
          <dd>{result.failure.cause}</dd>
          <dt>Fix</dt>
          <dd>{result.failure.fix}</dd>
        </dl>
      </div>
    );
  }

  const failed = result.cases.filter((entry) => !entry.ok);

  return (
    <div className={'feedback ' + (result.passed ? 'feedback--pass' : 'feedback--error')}>
      <h3 className="feedback__title">
        {result.passed ? (
          <>
            <Check size={17} /> That works.
          </>
        ) : (
          <>
            <Cross size={17} /> Not yet: {failed.length} of {result.cases.length} checks failed.
          </>
        )}
      </h3>

      <ul className="feedback__cases">
        {result.cases.map((entry) => (
          <li key={entry.label} className={entry.ok ? 'is-ok' : 'is-bad'}>
            <span className="feedback__case-mark">
              {entry.ok ? <Check size={12} /> : <Cross size={12} />}
            </span>
            <span>
              <code>{entry.label}</code>
              {entry.detail ? <span className="feedback__case-detail"> {entry.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      {failed.length > 0 && failed[0]?.hint ? (
        <p className="feedback__hint">
          <Lightbulb size={16} />
          {failed[0].hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Progress is kept in the browser only.
 *
 * There is no account and no server, which matches what the editor promises
 * about telemetry. The cost is that progress does not follow you to another
 * machine, and that is the right trade for a free tutorial.
 */
function loadProgress(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private windows and blocked site data both throw here. Losing progress
    // is a much smaller problem than a page that will not render.
    return new Set();
  }
}

function saveProgress(done: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    // Nothing to do: the lesson still works, it simply will not be remembered.
  }
}
