import type { JSX } from 'react';
import { COMPARISON, PRODUCT } from '../data/content';
import { Check } from './Icons';

/**
 * The honest comparison.
 *
 * Deliberately four rows, not twenty, and the right hand column describes the
 * status quo without naming a competitor or sneering at one. A table that
 * claims to win on everything reads as marketing and gets believed on nothing.
 */
export function Comparison(): JSX.Element {
  return (
    <div className="comparison">
      <div className="comparison__head" aria-hidden="true">
        <span />
        <span className="comparison__head-ours">
          <img src="/cairn-logo.svg" alt="" width={18} height={18} />
          {PRODUCT}
        </span>
        <span className="comparison__head-other">Most editors</span>
      </div>

      <dl className="comparison__rows">
        {COMPARISON.map((row) => (
          <div key={row.claim} className="comparison__row">
            <dt className="comparison__claim">{row.claim}</dt>
            <dd className="comparison__ours">
              <Check size={16} className="comparison__check" />
              <span>{row.ours}</span>
            </dd>
            <dd className="comparison__other">{row.others}</dd>
          </div>
        ))}
      </dl>

      <p className="comparison__footnote">
        Where {PRODUCT} is behind: there is no Git panel, no extension marketplace and no debugger yet. Those
        are the next milestone, and the panels for them say so rather than pretending.
      </p>
    </div>
  );
}
