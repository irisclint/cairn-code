import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installBridge, listeners, state } from './bridge-mock';

import { DebugView } from '@renderer/components/views/DebugView';
import { useDebugStore } from '@renderer/store/debug-store';
import { useWorkspaceStore } from '@renderer/store/workspace-store';
import { useNotificationStore } from '@renderer/store/notification-store';

const CONFIG = { name: 'Run main.py', type: 'python', request: 'launch' as const, program: 'main.py' };

beforeEach(() => {
  installBridge();
  useDebugStore.setState({
    session: { status: 'inactive', threadId: null, configurationName: null },
    configurations: [],
    selected: null,
    frames: [],
    selectedFrameId: null,
    scopes: [],
    variables: {},
    expanded: [],
    breakpoints: {},
    output: []
  });
  useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
  useNotificationStore.setState({ notifications: [] });

  state.debug = {
    configurations: [],
    frames: [],
    scopes: [],
    variables: {},
    breakpoints: {},
    started: null,
    actions: []
  };
  listeners.debugState.length = 0;
  listeners.debugOutput.length = 0;
});

describe('before anything is configured', () => {
  it('should ask for a folder when none is open', () => {
    useWorkspaceStore.setState({ rootPath: null, name: null });
    render(<DebugView />);
    expect(screen.getByText(/Open a folder to run and debug/)).toBeInTheDocument();
  });

  it('should point at launch.json rather than showing a dead Run button', async () => {
    render(<DebugView />);

    expect(await screen.findByText(/reads/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start debugging' })).toBeDisabled();
  });

  it('should say why the button is disabled, in its tooltip', async () => {
    render(<DebugView />);
    const button = await screen.findByRole('button', { name: 'Start debugging' });
    expect(button).toHaveAttribute('title', expect.stringContaining('launch.json'));
  });
});

describe('with a configuration', () => {
  beforeEach(() => {
    state.debug.configurations = [CONFIG];
  });

  it('should list what the workspace defines and select the first', async () => {
    render(<DebugView />);
    await waitFor(() => expect(useDebugStore.getState().selected).toBe('Run main.py'));
    expect(screen.getByRole('combobox', { name: 'Launch configuration' })).toHaveValue('Run main.py');
  });

  it('should start the session the user selected', async () => {
    render(<DebugView />);
    await screen.findByRole('button', { name: 'Start debugging' });

    await userEvent.click(screen.getByRole('button', { name: 'Start debugging' }));
    await waitFor(() => expect(state.debug.started?.name).toBe('Run main.py'));
  });

  it('should swap Run for Stop once the session is live', async () => {
    // The store only follows the session while it is connected, which is what
    // the workbench does at start-up.
    useDebugStore.getState().connect();
    render(<DebugView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start debugging' }));

    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start debugging' })).not.toBeInTheDocument();
  });
});

describe('when the adapter stops', () => {
  beforeEach(() => {
    state.debug.configurations = [CONFIG];
    state.debug.frames = [
      { id: 1000, name: 'total', line: 12, column: 3, source: '/ws/cart.js' },
      { id: 1001, name: 'main', line: 40, column: 1, source: '/ws/index.js' }
    ];
    state.debug.scopes = [
      { name: 'Local', variablesReference: 2000, expensive: false },
      { name: 'Global', variablesReference: 2001, expensive: true }
    ];
    state.debug.variables = {
      2000: [{ name: 'sum', value: '101', type: 'number', variablesReference: 0 }]
    };
  });

  function announceStop(): void {
    listeners.debugState.forEach((listener) =>
      listener({ status: 'stopped', threadId: 1, configurationName: 'Run main.py', stoppedReason: 'breakpoint' })
    );
  }

  it('should show the stack, and open the top frame variables by itself', async () => {
    useDebugStore.getState().connect();
    render(<DebugView />);

    announceStop();

    expect(await screen.findByText('total')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('cart.js:12')).toBeInTheDocument();

    // The first inexpensive scope expands without being asked.
    expect(await screen.findByText('sum')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('should say why it stopped', async () => {
    useDebugStore.getState().connect();
    render(<DebugView />);
    announceStop();

    expect(await screen.findByText(/Paused on breakpoint/)).toBeInTheDocument();
  });

  it('should enable stepping only while it is stopped', async () => {
    useDebugStore.getState().connect();
    render(<DebugView />);
    announceStop();

    const stepOver = await screen.findByRole('button', { name: 'Step over' });
    expect(stepOver).toBeEnabled();
    // Pause is meaningless when it is already paused.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();

    await userEvent.click(stepOver);
    await waitFor(() => expect(state.debug.actions).toContain('next'));
  });

  it('should drop the stack the moment it continues, rather than showing a stale one', async () => {
    useDebugStore.getState().connect();
    render(<DebugView />);
    announceStop();
    expect(await screen.findByText('total')).toBeInTheDocument();

    listeners.debugState.forEach((listener) =>
      listener({ status: 'running', threadId: 1, configurationName: 'Run main.py' })
    );

    await waitFor(() => expect(screen.queryByText('total')).not.toBeInTheDocument());
    expect(useDebugStore.getState().frames).toEqual([]);
  });
});

describe('breakpoints', () => {
  it('should toggle one on and off, and send it to the adapter', async () => {
    await useDebugStore.getState().toggleBreakpoint('/ws/cart.js', 12);
    expect(useDebugStore.getState().breakpointsFor('/ws/cart.js')).toEqual([{ line: 12 }]);
    expect(state.debug.breakpoints['/ws/cart.js']).toEqual([{ line: 12 }]);

    await useDebugStore.getState().toggleBreakpoint('/ws/cart.js', 12);
    expect(useDebugStore.getState().breakpointsFor('/ws/cart.js')).toEqual([]);
  });

  it('should keep them in line order however they were clicked', async () => {
    await useDebugStore.getState().toggleBreakpoint('/ws/cart.js', 30);
    await useDebugStore.getState().toggleBreakpoint('/ws/cart.js', 12);

    expect(useDebugStore.getState().breakpointsFor('/ws/cart.js').map((point) => point.line)).toEqual([
      12, 30
    ]);
  });

  it('should list them with a way to remove each one', async () => {
    await useDebugStore.getState().toggleBreakpoint('/ws/cart.js', 12);
    render(<DebugView />);

    expect(await screen.findByText('cart.js')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the breakpoint at cart.js line 12' })
    );

    await waitFor(() => expect(useDebugStore.getState().breakpointsFor('/ws/cart.js')).toEqual([]));
  });

  it('should tell the user where to click when there are none', async () => {
    render(<DebugView />);
    expect(await screen.findByText(/Click in the gutter/)).toBeInTheDocument();
  });
});

describe('the console', () => {
  it('should show what the program printed', async () => {
    useDebugStore.getState().connect();
    render(<DebugView />);

    listeners.debugOutput.forEach((listener) => listener({ category: 'stdout', text: 'hello from main\n' }));
    expect(await screen.findByText(/hello from main/)).toBeInTheDocument();
  });

  it('should keep a program that prints in a loop from growing without bound', () => {
    useDebugStore.getState().connect();

    for (let i = 0; i < 700; i += 1) {
      listeners.debugOutput.forEach((listener) => listener({ category: 'stdout', text: `line ${i}\n` }));
    }

    const output = useDebugStore.getState().output;
    expect(output).toHaveLength(500);
    // The newest lines are the ones kept.
    expect(output.at(-1)?.text).toContain('699');
  });
});
