import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { ISSUES_URL, PRODUCT, REPOSITORY_URL } from '../data/content';

const UPDATED = '22 September 2026';

/**
 * The privacy policy.
 *
 * Written to be checkable rather than comprehensive. Every claim here is
 * either visible in the source or verifiable by watching the network, and the
 * page says which is which. A policy that cannot be checked is a promise, and
 * this project does not ask to be taken at its word.
 */
export function Privacy(): JSX.Element {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Privacy</span>
          <h1 className="page-hero__title">What this collects, which is almost nothing.</h1>
          <p className="page-hero__lead">
            Last updated {UPDATED}. This covers both the {PRODUCT} editor and this website. They are
            separate things with separate answers, so they are described separately.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="legal">
            <h2>The short version</h2>
            <p>
              The editor sends nothing unless you switch telemetry on, and it is off when you install it.
              The website has no analytics, no advertising and no third-party scripts of any kind. Neither
              one has an account system, so there is nothing to sign in to and nothing to profile.
            </p>

            <h2>The editor</h2>

            <h3>Your code</h3>
            <p>
              Your files never leave your machine. The editor has no upload, no sync and no cloud feature,
              and the renderer that displays your code has no network access of its own: its content
              security policy allows scripts only from the application bundle. Everything it does with the
              filesystem goes through one bridge with one function per permitted operation.
            </p>

            <h3>Telemetry</h3>
            <p>
              The <code>telemetry.enabled</code> setting is <code>false</code> after installation and
              nothing is sent while it stays that way. Turning it on is a deliberate act in Settings. If you
              never open that page, no usage data is ever collected.
            </p>

            <h3>Update checks</h3>
            <p>
              Unless you disable it, the editor asks the release server whether a newer version exists. That
              request carries what any HTTP request carries: your IP address, the version you are running
              and your platform. It carries nothing about your code, your projects or your settings, and it
              can be turned off in Settings, after which the editor makes no network requests at all.
            </p>

            <h3>Crash reports</h3>
            <p>
              There are none. A crash is written to a local log file that stays on your machine. If you want
              to report one you copy it yourself, which means you can read what you are sending first.
            </p>

            <h3>Settings and local data</h3>
            <p>
              Settings live in one JSON file in your user profile directory, along with the list of folders
              you recently opened. You can read it, edit it, copy it between machines and delete it. Nothing
              in it is sent anywhere.
            </p>

            <h2>This website</h2>

            <h3>No analytics</h3>
            <p>
              There is no analytics script, no tag manager, no pixel and no embedded video or font from
              another domain. Every asset the site loads comes from the site itself, which you can confirm
              in your browser's network panel in under a minute.
            </p>

            <h3>No cookies</h3>
            <p>
              The site sets no cookies. It does use your browser's local storage for exactly one thing: the
              lessons you have completed on the <Link to="/learn">Learn</Link> page, so that your place is
              kept when you come back. That value stays in your browser, is never transmitted, and clearing
              your site data removes it.
            </p>

            <h3>Code you write in the browser</h3>
            <p>
              The editor in the hero and the lessons on the Learn page run entirely in your browser. What
              you type is never sent anywhere. Lesson checks for JavaScript run your code in a Web Worker on
              your own machine; the Python lessons read your code with pattern matching, also locally.
            </p>

            <h3>Server logs</h3>
            <p>
              The site is static and served by a hosting provider, currently Vercel. Like any web server, it
              records requests: IP address, time, the page requested and the user agent. Those logs are the
              provider's, are kept for a limited period under their own policy, and are not read, exported
              or combined with anything by this project.
            </p>

            <h2>What is not here</h2>
            <p>
              No profiling, no advertising identifiers, no data sold or shared with third parties, no
              behavioural tracking across sites, and no processing of personal data beyond the server logs
              described above. There is no data to export or delete because none is kept.
            </p>

            <h2>Changes</h2>
            <p>
              If this ever changes, the change lands as a commit in the public repository with the reason in
              its message, and the date at the top of this page moves. The history of this file is the
              record, and you can read it.
            </p>

            <h2>Asking</h2>
            <p>
              Questions about this go in a{' '}
              <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
                GitHub issue
              </a>
              , in public, so the answer helps whoever asks next. If you would rather not ask in public, the
              security reporting route in the{' '}
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
                repository
              </a>{' '}
              is private.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
