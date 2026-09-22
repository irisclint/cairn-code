import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { ISSUES_URL, PRODUCT, REPOSITORY_URL, VERSION } from '../data/content';

const UPDATED = '22 September 2026';

/**
 * The terms of use.
 *
 * Short on purpose. The software is MIT licensed, so the licence already says
 * what you may do with it; repeating that in heavier language would only
 * obscure it. What is left is the part the licence does not cover: what this
 * website is, and what the alpha does not promise.
 */
export function Terms(): JSX.Element {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Terms</span>
          <h1 className="page-hero__title">Short, because the licence does most of the work.</h1>
          <p className="page-hero__lead">
            Last updated {UPDATED}. These terms cover this website and the {PRODUCT} editor at version{' '}
            {VERSION}.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="legal">
            <h2>The software</h2>
            <p>
              {PRODUCT} is released under the MIT licence. You may use it for anything, including commercial
              work, and you may read, modify, redistribute and sell it. The full text is in the{' '}
              <a href={REPOSITORY_URL + '/blob/main/LICENSE'} target="_blank" rel="noreferrer noopener">
                LICENSE file
              </a>{' '}
              and it is the agreement that governs the software. Nothing on this page narrows it.
            </p>
            <p>
              There is no paid tier, no licence key and no usage limit. There is nothing to buy, so there is
              nothing to refund.
            </p>

            <h2>No warranty</h2>
            <p>
              The MIT licence provides the software as is, without warranty of any kind. That is not a
              formality at this stage: {VERSION} is an alpha. Features are missing, the builds are not code
              signed, and behaviour will change between versions.
            </p>
            <p>
              Keep your work in version control and keep backups, as you would with any editor. The project
              is not liable for lost work, and no editor that has been shipping for twenty years accepts
              that liability either.
            </p>

            <h2>Your code is yours</h2>
            <p>
              Nothing you write in the editor, or in the interactive examples on this site, is claimed by
              this project. The editor does not transmit your code, so the question of rights over it never
              arises. The{' '}
              <Link to="/privacy">privacy policy</Link> sets out exactly what does and does not leave your
              machine.
            </p>

            <h2>Using this website</h2>
            <p>
              The site is free to read, and the lesson and demo code it contains may be copied and used
              without attribution. The writing and the visual design are the project's, and the name and the
              mark identify this project specifically: please do not use them for something that is not this
              software, or in a way that suggests this project endorses something it does not.
            </p>
            <p>
              The interactive editor here runs code in your own browser. Do not paste anything into it that
              you would not paste into a text file, and do not use it to run code you do not understand.
            </p>

            <h2>Contributions</h2>
            <p>
              Contributions are accepted under the same MIT licence as the rest of the project. By opening a
              pull request you confirm that you wrote the change, or that you are otherwise entitled to
              submit it under that licence.
            </p>

            <h2>Availability</h2>
            <p>
              This is a free project run by volunteers. The site, the downloads and the update endpoint may
              be unavailable at any time and without notice, and no uptime is promised. The software itself
              keeps working while they are down, because it runs entirely on your machine.
            </p>

            <h2>Changes</h2>
            <p>
              Changes to this page land as commits in the public repository, with the date above updated.
              Continuing to use the site after a change means accepting the version then published.
            </p>

            <h2>Asking</h2>
            <p>
              Anything unclear here is a defect in the writing. Open an{' '}
              <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
                issue
              </a>{' '}
              and it will be fixed rather than explained away.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
