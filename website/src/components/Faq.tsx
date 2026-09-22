import type { JSX } from 'react';
import { FAQ } from '../data/content';

/**
 * Frequently asked questions.
 *
 * Native details elements rather than a hand-built accordion: they are
 * keyboard operable, announced correctly by screen readers, and searchable by
 * the browser's find even while collapsed.
 */
export function Faq(): JSX.Element {
  return (
    <div className="faq">
      {FAQ.map((item) => (
        <details key={item.question} className="faq__item">
          <summary className="faq__question">
            <span>{item.question}</span>
            <span className="faq__marker" aria-hidden="true" />
          </summary>
          <p className="faq__answer">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
