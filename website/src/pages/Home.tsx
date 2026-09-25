import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { LiveDemo } from '../components/LiveDemo';
import { HeroPreview } from '../components/HeroPreview';
import { FeatureGrid } from '../components/FeatureGrid';
import { Comparison } from '../components/Comparison';
import { Faq } from '../components/Faq';
import { ThemeStrip } from '../components/ThemeStrip';
import { ArrowRight, Download, GitHub, Check } from '../components/Icons';
import { CountUp, DotField, Magnetic, Reveal, SplitText } from '../components/Motion';
import { PRODUCT, REPOSITORY_URL, STATS, VERSION, LANGUAGE_COUNT } from '../data/content';
import { usePlatform } from '../hooks/usePlatform';

export function Home(): JSX.Element {
  const platform = usePlatform();

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <DotField className="hero__dots" />

        <div className="container hero__inner">
          <div className="hero__copy">
          <span className="badge">
            <span className="badge__dot" />
            {VERSION} is out
          </span>

          <h1 className="hero__title">
            <SplitText text="The editor that tells you" />{' '}
            <span className="hero__gradient">
              <SplitText text="why" delay={320} />
            </span>{' '}
            <SplitText text="it broke." delay={400} />
          </h1>

          <p className="hero__lead">
            Every other editor repeats the compiler at you. {PRODUCT} adds the two lines the compiler never
            gives you: what actually caused the problem, and the change that fixes it.
          </p>

          <div className="hero__actions">
            <Magnetic>
              <Link to="/download" className="button button--primary button--large">
                <Download size={19} />
                Download for {platform.label}
              </Link>
            </Magnetic>

            <a
              className="button button--secondary button--large"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              <GitHub size={19} />
              Source on GitHub
            </a>
          </div>

          <ul className="hero__points">
            <li>
              <Check size={16} /> Free and MIT licensed
            </li>
            <li>
              <Check size={16} /> No telemetry, ever, unless you ask
            </li>
            <li>
              <Check size={16} /> Windows, macOS and Linux
            </li>
          </ul>
          </div>

          {/*
            The claim, demonstrated rather than stated. It types the mistake in
            by itself and then hands the keyboard over.
          */}
          <div className="hero__demo">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The demo, which is the argument                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="section section--demo" id="try">
        <div className="container">
          <Reveal className="demo-intro">
            <span className="eyebrow">Try it here</span>
            <h2 className="section-title">This is not a screenshot.</h2>
            <p className="section-lead">
              Edit the code. Break a type, loosen a comparison, leave a variable behind. The panel underneath
              answers with a cause and a fix on every keystroke, the same four answers the editor gives you.
            </p>
          </Reveal>

          <Reveal delay={90}>
            <LiveDemo />
          </Reveal>

          <ul className="stats">
            {STATS.map((stat) => {
              const numeric = Number(stat.value);
              return (
                <li key={stat.label} className="stats__item">
                  <span className="stats__value">
                    {Number.isFinite(numeric) && stat.value.trim() !== '' ? (
                      <CountUp value={numeric} />
                    ) : (
                      stat.value
                    )}
                  </span>
                  <span className="stats__label">{stat.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <hr className="rule" />

      {/* ------------------------------------------------------------------ */}
      {/* Anatomy of a diagnostic                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="section" id="diagnostics">
        <div className="container">
          <div className="split">
            <Reveal className="split__copy stack">
              <span className="eyebrow">The difference</span>
              <h2 className="section-title">Four answers, not one</h2>
              <p className="section-lead">
                A type error tells you a fact. It does not tell you what to change, and for anyone who has not
                hit that exact error before, the difference is an hour.
              </p>
              <p className="section-lead">
                {PRODUCT} keeps a catalog of explanations for the compiler codes and lint rules developers
                actually hit, falls back to message patterns for everything else, and is built so that a
                problem without a cause and a fix counts as a defect in the editor.
              </p>
              <Link to="/about" className="link-arrow">
                How it works <ArrowRight size={17} />
              </Link>
            </Reveal>

            <Reveal className="split__visual" delay={80}>
              <div className="answer-card">
                <div className="answer-card__row answer-card__row--muted">
                  <span className="answer-card__label">What</span>
                  <span className="answer-card__value answer-card__value--mono">
                    Type &apos;string&apos; is not assignable to type &apos;number&apos;.
                  </span>
                </div>
                <div className="answer-card__row answer-card__row--muted">
                  <span className="answer-card__label">Where</span>
                  <span className="answer-card__value">src/session.ts, line 8, column 15</span>
                </div>
                <div className="answer-card__row answer-card__row--highlight">
                  <span className="answer-card__label">Why</span>
                  <span className="answer-card__value">
                    A value of type string was assigned where number is required. The two types have no common
                    shape.
                  </span>
                </div>
                <div className="answer-card__row answer-card__row--highlight">
                  <span className="answer-card__label">Fix</span>
                  <span className="answer-card__value">
                    Convert the value to number, widen the target type, or fix the source so it produces
                    number.
                  </span>
                </div>

                <p className="answer-card__note">
                  The first two lines are what every editor shows. The last two are {PRODUCT}.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <hr className="rule" />

      {/* ------------------------------------------------------------------ */}
      {/* Features                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="section" id="features">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Everything included</span>
            <h2 className="section-title">Ready on first launch</h2>
            <p className="section-lead">
              No extension hunt before you can read your own code. {LANGUAGE_COUNT} languages, a terminal,
              search and themes are all there when the window opens.
            </p>
          </Reveal>

          <FeatureGrid />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Themes                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="section section--tight" id="themes">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Themes</span>
            <h2 className="section-title">Twelve, and none of them filler</h2>
            <p className="section-lead">
              Dark, light, warm and two high contrast built for accessibility rather than looks. Hover one in
              the picker and it applies to your own code instantly.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <ThemeStrip />
          </Reveal>
        </div>
      </section>

      <hr className="rule" />

      {/* ------------------------------------------------------------------ */}
      {/* Comparison                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="section" id="why">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Why {PRODUCT}</span>
            <h2 className="section-title">What is actually different</h2>
            <p className="section-lead">
              Four honest differences. {PRODUCT} is younger than the editor you use now and does less; these
              are the places where doing less is the point.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <Comparison />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="section section--tight" id="faq">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Questions</span>
            <h2 className="section-title">Before you download</h2>
          </Reveal>

          <Reveal delay={80}>
            <Faq />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing call to action                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="section">
        <div className="container">
          <Reveal className="cta">
            <div className="cta__glow" aria-hidden="true" />
            <h2 className="cta__title">Try it on the file you are stuck on.</h2>
            <p className="cta__lead">
              It installs in under a minute, opens your folder, and tells you what is wrong with it.
            </p>
            <div className="cta__actions">
              <Magnetic>
                <Link to="/download" className="button button--primary button--large">
                  <Download size={19} />
                  Download {VERSION}
                </Link>
              </Magnetic>
              <Link to="/about" className="button button--secondary button--large">
                Read about the project
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
