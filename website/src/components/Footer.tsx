import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { GitHub } from './Icons';
import {
  PRODUCT,
  REPOSITORY_URL,
  DOCS_URL,
  docsFile,
  ISSUES_URL,
  RELEASES_URL,
  VERSION
} from '../data/content';

const YEAR = new Date().getFullYear();

export function Footer(): JSX.Element {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <Link to="/" className="brand">
            <img src="/causeway-logo.svg" alt="" className="brand__mark" width={30} height={30} />
            <span className="brand__name">
              {PRODUCT}
            </span>
          </Link>
          <p className="site-footer__tagline">
            A code editor that explains its errors. Free, open source, and quiet about your data.
          </p>
        </div>

        <div>
          <h2 className="site-footer__heading">Product</h2>
          <ul className="site-footer__list">
            <li>
              <Link to="/download">Download</Link>
            </li>
            <li>
              <Link to="/learn">Learn to code</Link>
            </li>
            <li>
              <Link to="/#features">Features</Link>
            </li>
            <li>
              <Link to="/#themes">Themes</Link>
            </li>
            <li>
              <Link to="/#why">Why {PRODUCT}</Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="site-footer__heading">Project</h2>
          <ul className="site-footer__list">
            <li>
              <Link to="/about">About</Link>
            </li>
            <li>
              <a href={DOCS_URL} target="_blank" rel="noreferrer noopener">
                Documentation
              </a>
            </li>
            <li>
              <a href={RELEASES_URL} target="_blank" rel="noreferrer noopener">
                Releases
              </a>
            </li>
            <li>
              <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
                Report an issue
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="site-footer__heading">Source</h2>
          <ul className="site-footer__list">
            <li>
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
                GitHub
              </a>
            </li>
            <li>
              <a href={REPOSITORY_URL + '/blob/main/LICENSE'} target="_blank" rel="noreferrer noopener">
                MIT license
              </a>
            </li>
            <li>
              <a href={docsFile('CONTRIBUTING.md')} target="_blank" rel="noreferrer noopener">
                Contributing
              </a>
            </li>
            <li>
              <a href={docsFile('SECURITY.md')} target="_blank" rel="noreferrer noopener">
                Security
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="container site-footer__bottom">
        <span>
          {YEAR} {PRODUCT} contributors. MIT licensed. Version {VERSION}.
        </span>
        <span className="site-footer__legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="link-arrow"
          aria-label={`${PRODUCT} on GitHub`}
        >
          <GitHub size={16} />
        </a>
      </div>
    </footer>
  );
}
