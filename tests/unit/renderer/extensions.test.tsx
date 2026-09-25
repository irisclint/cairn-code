import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installBridge, state } from './bridge-mock';

import { ExtensionsView } from '@renderer/components/views/ExtensionsView';
import { useExtensionStore } from '@renderer/store/extension-store';
import type { InstalledExtension, MarketplaceEntry } from '@shared/types';

function installed(overrides: Partial<InstalledExtension> = {}): InstalledExtension {
  return {
    manifest: {
      id: 'acme.hello',
      name: 'Hello',
      version: '1.0.0',
      publisher: 'acme',
      description: 'Says hello.',
      main: 'extension.js',
      permissions: ['commands', 'workspace.read'],
      contributes: { commands: [{ id: 'hello.say', title: 'Say Hello' }] }
    },
    status: 'enabled',
    path: '/ext/acme.hello',
    ...overrides
  };
}

function listing(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: 'acme.other',
    name: 'Other',
    version: '2.0.0',
    publisher: 'acme',
    description: 'Does something else.',
    permissions: ['notifications'],
    archiveUrl: 'https://registry.example/other.json',
    sha256: 'a'.repeat(64),
    ...overrides
  };
}

beforeEach(() => {
  installBridge();
  state.extensions = { installed: [], catalogue: [], catalogueError: null, invoked: [] };
  useExtensionStore.setState({
    installed: [],
    catalogue: [],
    catalogueProblem: null,
    loading: false,
    busy: null
  });
});

describe('with nothing installed', () => {
  it('should say so, and list what needs no extension', async () => {
    render(<ExtensionsView />);

    expect(await screen.findByText(/Nothing is installed yet/)).toBeInTheDocument();
    expect(screen.getByText(/languages with syntax highlighting/)).toBeInTheDocument();
    expect(screen.getByText(/ESLint from the workspace/)).toBeInTheDocument();
  });
});

describe('an installed extension', () => {
  beforeEach(() => {
    state.extensions.installed = [installed()];
  });

  it('should show what it is and what it may do, in plain words', async () => {
    render(<ExtensionsView />);

    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();

    // The permission list is the part someone reads before trusting it.
    expect(screen.getByText('Add commands to the Command Palette')).toBeInTheDocument();
    expect(screen.getByText('Read the files in your open folder')).toBeInTheDocument();
  });

  it('should say plainly when an extension asks for nothing', async () => {
    state.extensions.installed = [
      installed({
        manifest: { ...installed().manifest, main: undefined, permissions: [] }
      })
    ];

    render(<ExtensionsView />);
    expect(await screen.findByText(/Asks for nothing/)).toBeInTheDocument();
  });

  it('should disable and enable it again', async () => {
    render(<ExtensionsView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(state.extensions.installed[0]?.status).toBe('disabled'));

    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(state.extensions.installed[0]?.status).toBe('enabled'));
  });

  it('should uninstall it', async () => {
    render(<ExtensionsView />);

    await userEvent.click(await screen.findByRole('button', { name: 'Uninstall' }));
    await waitFor(() => expect(state.extensions.installed).toHaveLength(0));
  });

  it('should show why one failed rather than only that it did', async () => {
    state.extensions.installed = [
      installed({ status: 'failed', failure: 'It is enabled but not running.' })
    ];

    render(<ExtensionsView />);
    expect(await screen.findByText('It is enabled but not running.')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('should offer the commands it actually wired up', async () => {
    state.extensions.installed = [installed({ activeCommands: ['hello.say'] })];

    render(<ExtensionsView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Say Hello' }));

    await waitFor(() =>
      expect(state.extensions.invoked).toContainEqual({
        extensionId: 'acme.hello',
        commandId: 'hello.say'
      })
    );
  });

  it('should not offer a command the extension declared but never registered', async () => {
    state.extensions.installed = [installed({ activeCommands: [] })];

    render(<ExtensionsView />);
    await screen.findByText('Hello');
    expect(screen.queryByRole('button', { name: 'Say Hello' })).not.toBeInTheDocument();
  });
});

describe('the marketplace', () => {
  it('should explain an unconfigured registry where the emptiness is', async () => {
    state.extensions.catalogueError = {
      code: 'MARKETPLACE_NOT_CONFIGURED',
      message: 'No extension registry is set',
      cause: 'cairn-code has no registry address built in.',
      solution: 'Set extensions.registryUrl in Settings.'
    };

    render(<ExtensionsView />);
    await userEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));

    // The reason belongs in the panel, not in a notification that disappears.
    expect(await screen.findByText('No extension registry is set')).toBeInTheDocument();
    expect(screen.getByText(/no registry address built in/)).toBeInTheDocument();
    expect(screen.getByText(/Set extensions.registryUrl/)).toBeInTheDocument();
  });

  it('should show what a catalogue offers, with its permissions', async () => {
    state.extensions.catalogue = [listing()];

    render(<ExtensionsView />);
    await userEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));

    expect(await screen.findByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Show you messages')).toBeInTheDocument();
  });

  it('should install an entry and then show it as installed', async () => {
    state.extensions.catalogue = [listing()];

    render(<ExtensionsView />);
    await userEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));

    await waitFor(() => expect(state.extensions.installed.map((e) => e.manifest.id)).toContain('acme.other'));
    expect(await screen.findByText('Installed')).toBeInTheDocument();
  });

  it('should not offer to install something already installed', async () => {
    state.extensions.catalogue = [listing()];
    state.extensions.installed = [
      installed({ manifest: { ...installed().manifest, id: 'acme.other', name: 'Other' } })
    ];

    render(<ExtensionsView />);
    await userEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));

    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('should not fetch a catalogue before the tab is opened', async () => {
    render(<ExtensionsView />);
    await screen.findByText(/Nothing is installed yet/);

    // Nothing is requested on its own, which is what keeps the promise that
    // the update check is the only call the editor makes unprompted.
    expect(globalThis.window.cairn.extensions.marketplace).not.toHaveBeenCalled();
  });
});
