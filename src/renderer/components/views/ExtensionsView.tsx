import type { JSX } from 'react';
import { LANGUAGE_COUNT } from '../../editor/language-support';
import { listThemes } from '../../theme-engine/theme-registry';

/**
 * Extensions panel.
 *
 * The extension host and marketplace client are phase 2 work. What already
 * ships is listed here so the panel reports the true state of the application
 * instead of an empty marketplace.
 */
export function ExtensionsView(): JSX.Element {
  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Extensions</h2>
      </div>
      <div className="sidebar-view__empty">
        <p>Built in capabilities</p>
        <ul className="sidebar-view__list">
          <li>{LANGUAGE_COUNT} languages with syntax highlighting</li>
          <li>{listThemes().length} color themes</li>
          <li>TypeScript and JavaScript diagnostics with explanations</li>
          <li>Integrated terminal</li>
        </ul>
        <p className="sidebar-view__hint">
          The sandboxed extension host and the marketplace client are planned for the next milestone. Themes
          can already be added by dropping a theme JSON file into the theme folder.
        </p>
      </div>
    </div>
  );
}
