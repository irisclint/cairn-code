import { useEffect, useState, type JSX } from 'react';
import type { AppInfo } from '@shared/types';
import { api, hasBridge, unwrapOr } from '../../services/api';
import { useUiStore } from '../../store/ui-store';
import { LANGUAGE_COUNT } from '../../editor/language-support';
import { listThemes } from '../../theme-engine/theme-registry';

const UNKNOWN_INFO: AppInfo = {
  name: 'cairn-code',
  version: 'unknown',
  electron: 'unknown',
  chrome: 'unknown',
  node: 'unknown',
  platform: 'win32',
  arch: 'unknown',
  isPackaged: false
};

/** Version and environment information. */
export function AboutDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const [info, setInfo] = useState<AppInfo>(UNKNOWN_INFO);

  useEffect(() => {
    if (!hasBridge()) return;
    void unwrapOr(api().app.getInfo(), UNKNOWN_INFO).then(setInfo);
  }, []);

  const details = [
    ['Version', info.version],
    ['Electron', info.electron],
    ['Chromium', info.chrome],
    ['Node.js', info.node],
    ['Platform', info.platform + ' ' + info.arch],
    ['Languages', String(LANGUAGE_COUNT)],
    ['Themes', String(listThemes().length)]
  ];

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={closeDialog}>
      <div
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="About cairn-code"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="about-dialog__title">cairn-code</h2>
        <p className="about-dialog__tagline">Fast. Beautiful. For every language.</p>

        <dl className="about-dialog__details">
          {details.map(([label, value]) => (
            <div key={label} className="about-dialog__row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <p className="about-dialog__license">
          Released under the MIT license. Telemetry is off unless you switch it on in Settings.
        </p>

        <div className="about-dialog__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              void navigator.clipboard?.writeText(
                details.map(([label, value]) => label + ': ' + value).join('\n')
              );
            }}
          >
            Copy details
          </button>
          <button type="button" className="button button--primary" onClick={closeDialog}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
