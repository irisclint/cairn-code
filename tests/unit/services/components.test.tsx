import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Icon, hasIcon } from '@renderer/components/common/Icon';
import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary';
import { Notifications } from '@renderer/components/common/Notifications';
import { Resizer } from '@renderer/components/common/Resizer';
import { QuickPickDialog, type QuickPickItem } from '@renderer/components/dialogs/QuickPickDialog';
import { useNotificationStore } from '@renderer/store/notification-store';

describe('Icon', () => {
  it('should render an SVG for a known icon', () => {
    const { container } = render(<Icon name="explorer" />);
    const svg = container.querySelector('svg');

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '16');
    expect(svg?.querySelector('path')).toBeInTheDocument();
  });

  it('should render nothing for an unknown icon rather than an empty box', () => {
    const { container } = render(<Icon name="not-a-real-icon" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('should honour the size prop', () => {
    const { container } = render(<Icon name="search" size={24} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
  });

  it('should be hidden from assistive technology unless given a title', () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<Icon name="search" title="Search" />);
    expect(screen.getByTitle('Search')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
  });

  it('should report which icons exist', () => {
    expect(hasIcon('explorer')).toBe(true);
    expect(hasIcon('nope')).toBe(false);
  });

  it('should provide an icon for every activity bar entry', () => {
    for (const name of ['explorer', 'search', 'source-control', 'extensions', 'settings']) {
      expect(hasIcon(name), name).toBe(true);
    }
  });
});

describe('ErrorBoundary', () => {
  const Boom = (): never => {
    throw new Error('component exploded');
  };

  beforeEach(() => {
    // React logs the caught error; silencing keeps the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render its children while nothing throws', () => {
    render(
      <ErrorBoundary region="editor">
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('should show what happened, why, and what to do', () => {
    render(
      <ErrorBoundary region="editor">
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/The editor stopped responding/)).toBeInTheDocument();
    expect(screen.getByText('component exploded')).toBeInTheDocument();
    expect(screen.getByText(/^Cause:/)).toBeInTheDocument();
    expect(screen.getByText(/^Fix:/)).toBeInTheDocument();
  });

  it('should offer to reload only the failed region', () => {
    render(
      <ErrorBoundary region="terminal panel">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /Reload terminal panel/ })).toBeInTheDocument();
  });

  it('should expose the stack trace for a report', () => {
    render(
      <ErrorBoundary region="editor">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Stack trace')).toBeInTheDocument();
  });
});

describe('Notifications', () => {
  beforeEach(() => useNotificationStore.setState({ notifications: [] }));

  it('should render nothing when there is no notification', () => {
    const { container } = render(<Notifications />);
    expect(container.firstChild).toBeNull();
  });

  it('should show the message together with its cause and fix', () => {
    useNotificationStore.getState().notify({
      severity: 'error',
      message: 'Could not save file.ts',
      cause: 'The file is read-only.',
      solution: 'Remove the read-only flag and save again.'
    });

    render(<Notifications />);
    expect(screen.getByText('Could not save file.ts')).toBeInTheDocument();
    expect(screen.getByText(/The file is read-only/)).toBeInTheDocument();
    expect(screen.getByText(/Remove the read-only flag/)).toBeInTheDocument();
  });

  it('should announce an error assertively and lower severities politely', () => {
    useNotificationStore.getState().notify({ severity: 'error', message: 'bad' });
    const { rerender } = render(<Notifications />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    useNotificationStore.setState({ notifications: [] });
    useNotificationStore.getState().notify({ severity: 'info', message: 'fyi' });
    rerender(<Notifications />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should dismiss a notification from its close button', async () => {
    useNotificationStore.getState().notify({ severity: 'error', message: 'bad' });
    render(<Notifications />);

    await userEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should run an action and then dismiss', async () => {
    const run = vi.fn();
    useNotificationStore.getState().notify({
      severity: 'warning',
      message: 'Reload needed',
      actions: [{ label: 'Reload', run }]
    });

    render(<Notifications />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(run).toHaveBeenCalledOnce();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should auto dismiss after the timeout elapses', async () => {
    vi.useFakeTimers();
    useNotificationStore.getState().notify({ severity: 'info', message: 'temporary', timeoutMs: 1000 });
    render(<Notifications />);

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('Resizer', () => {
  it('should expose separator semantics to assistive technology', () => {
    render(
      <Resizer
        orientation="vertical"
        size={280}
        onResize={vi.fn()}
        ariaLabel="Resize sidebar"
        min={100}
        max={600}
      />
    );

    const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '280');
  });

  it('should resize with the arrow keys', () => {
    const onResize = vi.fn();
    render(<Resizer orientation="vertical" size={280} onResize={onResize} ariaLabel="Resize sidebar" />);

    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(288);

    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenCalledWith(272);
  });

  it('should take a larger step while shift is held', () => {
    const onResize = vi.fn();
    render(<Resizer orientation="vertical" size={280} onResize={onResize} ariaLabel="Resize sidebar" />);

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight', shiftKey: true });
    expect(onResize).toHaveBeenCalledWith(320);
  });

  it('should invert the direction for a panel that grows upwards', () => {
    const onResize = vi.fn();
    render(
      <Resizer orientation="horizontal" size={280} onResize={onResize} invert ariaLabel="Resize panel" />
    );

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowUp' });
    expect(onResize).toHaveBeenCalledWith(288);
  });
});

describe('QuickPickDialog', () => {
  const items: QuickPickItem[] = [
    { id: 'one', label: 'First Command', trailing: 'Ctrl+1' },
    { id: 'two', label: 'Second Command' },
    { id: 'three', label: 'Third Command' }
  ];

  const renderDialog = (overrides: Partial<React.ComponentProps<typeof QuickPickDialog>> = {}) => {
    const props = {
      title: 'Command Palette',
      placeholder: 'Type a command',
      query: '',
      onQueryChange: vi.fn(),
      items,
      onAccept: vi.fn(),
      onClose: vi.fn(),
      ...overrides
    };
    return { ...render(<QuickPickDialog {...props} />), props };
  };

  it('should render as a modal dialog with a labelled input', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByPlaceholderText('Type a command')).toHaveFocus();
  });

  it('should list every item as an option', () => {
    renderDialog();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('should select the first item initially', () => {
    renderDialog();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should move the selection with the arrow keys and wrap around', () => {
    renderDialog();
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('should accept the highlighted item on Enter', () => {
    const { props } = renderDialog();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(props.onAccept).toHaveBeenCalledWith(items[1]);
  });

  it('should close on Escape', () => {
    const { props } = renderDialog();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('should close when the backdrop is clicked but not the dialog itself', () => {
    const { props, container } = renderDialog();

    fireEvent.mouseDown(container.querySelector('.quick-pick') as Element);
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector('.dialog-overlay') as Element);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('should report the query as the user types', async () => {
    const onQueryChange = vi.fn();
    renderDialog({ onQueryChange });

    await userEvent.type(screen.getByRole('combobox'), 'a');
    expect(onQueryChange).toHaveBeenCalledWith('a');
  });

  it('should show an empty message when nothing matches', () => {
    renderDialog({ items: [], emptyMessage: 'No command matches' });
    expect(screen.getByText('No command matches')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('should highlight the matched characters', () => {
    const { container } = renderDialog({
      items: [{ id: 'one', label: 'Save', matchIndices: [0, 1] }]
    });
    expect(container.querySelectorAll('.quick-pick__highlight')).toHaveLength(2);
  });

  it('should render the trailing keybinding', () => {
    renderDialog();
    expect(screen.getByText('Ctrl+1')).toBeInTheDocument();
  });

  it('should report the highlighted item so a caller can preview it', async () => {
    const onHighlight = vi.fn();
    renderDialog({ onHighlight });

    await waitFor(() => expect(onHighlight).toHaveBeenCalledWith(items[0]));

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    await waitFor(() => expect(onHighlight).toHaveBeenCalledWith(items[1]));
  });

  it('should accept an item that is clicked', () => {
    const { props } = renderDialog();
    fireEvent.mouseDown(screen.getAllByRole('option')[2] as Element);
    expect(props.onAccept).toHaveBeenCalledWith(items[2]);
  });
});
