import type { JSX } from 'react';
import { Download, Windows, Apple, Linux, ArrowRight, Shield } from '../components/Icons';
import {
  DOWNLOADS,
  RELEASES_URL,
  DOCS_URL,
  VERSION,
  RELEASES_PUBLISHED,
  type DownloadTarget
} from '../data/content';
import { usePlatform } from '../hooks/usePlatform';

const PLATFORM_ICONS: Record<DownloadTarget['id'], (props: { size?: number }) => JSX.Element> = {
  windows: Windows,
  macos: Apple,
  linux: Linux
};

/** Release assets live on the GitHub release for this version. */
function assetUrl(file: string): string {
  return `${RELEASES_URL}/download/v${VERSION}/${file}`;
}

function PlatformCard({
  target,
  recommended
}: {
  target: DownloadTarget;
  recommended: boolean;
}): JSX.Element {
  const Icon = PLATFORM_ICONS[target.id];

  return (
    <article className={'download-card' + (recommended ? ' download-card--recommended' : '')}>
      {recommended ? <span className="download-card__flag">Detected</span> : null}

      <div className="download-card__head">
        <span className="download-card__icon">
          <Icon size={22} />
        </span>
        <div>
          <h3 className="download-card__title">{target.label}</h3>
          <p className="download-card__requirement">{target.requirement}</p>
        </div>
      </div>

      {RELEASES_PUBLISHED ? (
        <a
          className={'button button--block ' + (recommended ? 'button--primary' : 'button--secondary')}
          href={assetUrl(target.primary.file)}
        >
          <Download size={18} />
          {target.primary.label}
        </a>
      ) : (
        <span className="button button--block button--disabled" aria-disabled="true">
          <Download size={18} />
          {target.primary.label}
        </span>
      )}
      <p className="download-card__note">{RELEASES_PUBLISHED ? target.primary.note : 'Not published yet'}</p>

      <ul className="download-card__others">
        {target.others.map((other) => (
          <li key={other.file}>
            {RELEASES_PUBLISHED ? (
              <a href={assetUrl(other.file)} className="download-card__other">
                <span>{other.label}</span>
                <ArrowRight size={15} />
              </a>
            ) : (
              <span className="download-card__other download-card__other--disabled">
                <span>{other.label}</span>
              </span>
            )}
            {other.note ? <span className="download-card__other-note">{other.note}</span> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

const INSTALL_STEPS: Record<DownloadTarget['id'], string[]> = {
  windows: [
    'Run the installer. It installs for your user, so it never asks for an administrator password.',
    'SmartScreen may warn about an unrecognised publisher while the alpha is unsigned. Choose More info, then Run anyway.',
    'cairn-code adds an "Open with cairn-code" entry to the Explorer context menu for files and folders.'
  ],
  macos: [
    'Open the disk image and drag cairn-code into Applications.',
    'The first launch is blocked while the alpha is unsigned. Right click the app, choose Open, then confirm.',
    'Pick the Apple silicon build on an M1 or newer, and the Intel build otherwise.'
  ],
  linux: [
    'AppImage: make it executable with chmod +x, then run it. Nothing is installed system wide.',
    'Debian and Ubuntu: sudo apt install ./cairn-*.deb',
    'Fedora and RHEL: sudo dnf install ./cairn-*.rpm'
  ]
};

export function DownloadPage(): JSX.Element {
  const platform = usePlatform();
  const ordered = [
    ...DOWNLOADS.filter((target) => target.id === platform.id),
    ...DOWNLOADS.filter((target) => target.id !== platform.id)
  ];

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Download</span>
          <h1 className="page-hero__title">Get cairn-code {VERSION}</h1>
          <p className="page-hero__lead">
            {RELEASES_PUBLISHED
              ? 'Free and MIT licensed. Every build below comes from the same tagged commit and is produced by the CI workflow, so you can rebuild any of them yourself.'
              : 'Free and MIT licensed. The first alpha has not been tagged yet, so there is nothing to download from this page today.'}
          </p>
        </div>
      </section>

      {RELEASES_PUBLISHED ? null : (
        <section className="section section--tight">
          <div className="container">
            <div className="notice notice--wide">
              <span className="notice__icon">
                <Shield size={19} />
              </span>
              <h2 className="notice__title">No binaries yet</h2>
              <p className="notice__body">
                cairn-code works, and the tests and builds are green on all three platforms, but no release
                has been tagged yet. The source is public in the meantime, so nothing here rests on taking the
                project's word for it.
              </p>
              <p className="notice__body">
                The platform cards below show exactly what will be published. Until then, the way to run
                cairn-code is to build it, which is one command once the dependencies are in place.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="section section--tight">
        <div className="container">
          <div className="grid grid--3 download-grid">
            {ordered.map((target) => (
              <PlatformCard key={target.id} target={target} recommended={target.id === platform.id} />
            ))}
          </div>

          {RELEASES_PUBLISHED ? (
            <p className="download-footnote">
              Looking for an older version, or the checksums?{' '}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer noopener" className="link-arrow">
                All releases on GitHub <ArrowRight size={15} />
              </a>
            </p>
          ) : null}
        </div>
      </section>

      <hr className="rule" />

      <section className="section section--tight">
        <div className="container">
          <div className="split">
            <div className="split__copy stack">
              <span className="eyebrow">After the download</span>
              <h2 className="section-title">Installing on {platform.label}</h2>
              <ol className="install-steps">
                {INSTALL_STEPS[platform.id].map((step, index) => (
                  <li key={index} className="install-steps__item">
                    <span className="install-steps__number">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="split__visual">
              <div className="notice">
                <span className="notice__icon">
                  <Shield size={19} />
                </span>
                <h3 className="notice__title">About the signing warnings</h3>
                <p className="notice__body">
                  The alpha builds are not code signed yet, because a certificate costs money the project does
                  not have and signing an alpha with a borrowed one would be worse. The warning you see is
                  your operating system telling you the truth: it does not know who built this.
                </p>
                <p className="notice__body">
                  If that is not a trade you want to make, build from source. The repository has the full
                  instructions, and the build is one command once the dependencies are installed.
                </p>
                <a
                  className="link-arrow"
                  href={DOCS_URL + '/CONTRIBUTING.md'}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Build from source <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="requirements">
            <div>
              <h3 className="requirements__title">System requirements</h3>
              <ul className="requirements__list">
                <li>Windows 10 or 11, macOS 12 or newer, or a 64-bit Linux with glibc 2.31+</li>
                <li>About 400 MB of disk space</li>
                <li>4 GB of memory, 8 GB if you keep a language server and a build running</li>
              </ul>
            </div>
            <div>
              <h3 className="requirements__title">Good to know</h3>
              <ul className="requirements__list">
                <li>Telemetry is off. Nothing is sent unless you switch it on in Settings.</li>
                <li>The update check is the only network request, and it can be disabled too.</li>
                <li>Settings live in one JSON file you can read, edit and copy between machines.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
