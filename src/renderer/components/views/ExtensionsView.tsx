import { useEffect, useState, type JSX } from 'react';
import { LANGUAGE_COUNT } from '../../editor/language-support';
import { listThemes } from '../../theme-engine/theme-registry';
import { useExtensionStore } from '../../store/extension-store';
import { Icon } from '../common/Icon';
import {
  PERMISSION_DESCRIPTIONS,
  type ExtensionPermission,
  type InstalledExtension,
  type MarketplaceEntry
} from '@shared/types';

type Tab = 'installed' | 'marketplace';

/**
 * Extensions.
 *
 * Shows what is installed, what it is allowed to do, and what a registry
 * offers. The permission list is the part that matters: it is the same list
 * the manifest declares and the same one the marketplace client checks the
 * download against, so what is shown here is what will actually be granted.
 */
export function ExtensionsView(): JSX.Element {
  const [tab, setTab] = useState<Tab>('installed');
  const { installed, catalogue, catalogueProblem, loading, busy } = useExtensionStore();
  const refresh = useExtensionStore((state) => state.refresh);
  const browse = useExtensionStore((state) => state.browse);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === 'marketplace' && catalogue.length === 0 && !catalogueProblem) void browse();
  }, [tab, catalogue.length, catalogueProblem, browse]);

  return (
    <div className="sidebar-view ext">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Extensions</h2>
        <button
          type="button"
          className="icon-button"
          title="Refresh"
          aria-label="Refresh extensions"
          onClick={() => void (tab === 'installed' ? refresh() : browse())}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <div className="ext__tabs" role="tablist" aria-label="Extensions">
        {(['installed', 'marketplace'] as Tab[]).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={'ext__tab' + (tab === name ? ' ext__tab--active' : '')}
            onClick={() => setTab(name)}
          >
            {name === 'installed' ? `Installed${installed.length ? ` (${installed.length})` : ''}` : 'Marketplace'}
          </button>
        ))}
      </div>

      <div className="ext__body">
        {tab === 'installed' ? (
          <Installed entries={installed} busy={busy} loading={loading} />
        ) : (
          <Marketplace
            entries={catalogue}
            problem={catalogueProblem}
            installed={installed}
            busy={busy}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Installed                                                                   */
/* -------------------------------------------------------------------------- */

function Installed({
  entries,
  busy,
  loading
}: {
  entries: InstalledExtension[];
  busy: string | null;
  loading: boolean;
}): JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="ext__empty">
        <p>{loading ? 'Reading what is installed…' : 'Nothing is installed yet.'}</p>
        <p className="ext__hint">These are built in and need no extension:</p>
        <ul className="ext__builtin">
          <li>{LANGUAGE_COUNT} languages with syntax highlighting</li>
          <li>{listThemes().length} colour themes</li>
          <li>TypeScript and JavaScript diagnostics, with explanations</li>
          <li>ESLint from the workspace, and an integrated terminal</li>
        </ul>
      </div>
    );
  }

  return (
    <ul className="ext__list">
      {entries.map((entry) => (
        <li key={entry.manifest.id} className="ext__card">
          <div className="ext__card-head">
            <span className="ext__name">{entry.manifest.name}</span>
            <span className="ext__version">{entry.manifest.version}</span>
            <span className={'ext__status ext__status--' + entry.status}>{entry.status}</span>
          </div>

          <p className="ext__publisher">{entry.manifest.publisher}</p>
          <p className="ext__description">{entry.manifest.description}</p>

          {entry.failure ? <p className="ext__failure">{entry.failure}</p> : null}

          <Permissions permissions={entry.manifest.permissions} />

          {entry.activeCommands && entry.activeCommands.length > 0 ? (
            <div className="ext__commands">
              {entry.activeCommands.map((commandId) => (
                <button
                  key={commandId}
                  type="button"
                  className="ext__command"
                  onClick={() => void useExtensionStore.getState().run(entry.manifest.id, commandId)}
                >
                  {entry.manifest.contributes.commands?.find((command) => command.id === commandId)?.title ??
                    commandId}
                </button>
              ))}
            </div>
          ) : null}

          <div className="ext__actions">
            <button
              type="button"
              className="ext__action"
              disabled={busy === entry.manifest.id}
              onClick={() =>
                void useExtensionStore.getState().setEnabled(entry.manifest.id, entry.status === 'disabled')
              }
            >
              {entry.status === 'disabled' ? 'Enable' : 'Disable'}
            </button>
            <button
              type="button"
              className="ext__action ext__action--danger"
              disabled={busy === entry.manifest.id}
              onClick={() => void useExtensionStore.getState().uninstall(entry.manifest.id)}
            >
              Uninstall
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Marketplace                                                                 */
/* -------------------------------------------------------------------------- */

function Marketplace({
  entries,
  problem,
  installed,
  busy,
  loading
}: {
  entries: MarketplaceEntry[];
  problem: { message: string; cause: string; solution: string } | null;
  installed: InstalledExtension[];
  busy: string | null;
  loading: boolean;
}): JSX.Element {
  if (problem) {
    return (
      <div className="ext__empty">
        <h3 className="ext__problem-title">{problem.message}</h3>
        <dl className="ext__problem">
          <dt>Why</dt>
          <dd>{problem.cause}</dd>
          <dt>Fix</dt>
          <dd>{problem.solution}</dd>
        </dl>
      </div>
    );
  }

  if (entries.length === 0) {
    return <div className="ext__empty">{loading ? 'Reading the catalogue…' : 'The catalogue is empty.'}</div>;
  }

  const have = new Set(installed.map((entry) => entry.manifest.id));

  return (
    <ul className="ext__list">
      {entries.map((entry) => (
        <li key={entry.id} className="ext__card">
          <div className="ext__card-head">
            <span className="ext__name">{entry.name}</span>
            <span className="ext__version">{entry.version}</span>
          </div>

          <p className="ext__publisher">{entry.publisher}</p>
          <p className="ext__description">{entry.description}</p>

          <Permissions permissions={entry.permissions} />

          <div className="ext__actions">
            {have.has(entry.id) ? (
              <span className="ext__installed">Installed</span>
            ) : (
              <button
                type="button"
                className="ext__action ext__action--primary"
                disabled={busy === entry.id}
                onClick={() => void useExtensionStore.getState().install(entry)}
              >
                {busy === entry.id ? 'Installing…' : 'Install'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * What an extension may do, in the words the permission model uses.
 *
 * Shown before installing as well as after, and the marketplace client
 * refuses a download whose manifest asks for more than was listed, so this is
 * the whole of what will be granted.
 */
function Permissions({ permissions }: { permissions: ExtensionPermission[] }): JSX.Element {
  if (permissions.length === 0) {
    return (
      <p className="ext__permissions ext__permissions--none">
        Asks for nothing. It contributes data only and runs no code.
      </p>
    );
  }

  return (
    <ul className="ext__permissions">
      {permissions.map((permission) => (
        <li key={permission}>
          <Icon name="shield" size={11} />
          {PERMISSION_DESCRIPTIONS[permission]}
        </li>
      ))}
    </ul>
  );
}
