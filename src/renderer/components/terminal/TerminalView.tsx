import { useEffect, useRef, type JSX } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

import type { TerminalSession } from '@shared/types';
import { api } from '../../services/api';
import { useSettingsStore } from '../../store/settings-store';
import { useThemeStore } from '../../store/theme-store';
import { useTerminalStore } from '../../store/terminal-store';
import { toTerminalTheme } from '../../terminal/terminal-theme';
import { throttle } from '@shared/utils';

export interface TerminalViewProps {
  session: TerminalSession;
  /** Hidden terminals stay mounted so their scrollback and process survive. */
  isVisible: boolean;
}

/**
 * One XTerm instance bound to one shell process.
 *
 * The terminal stays mounted while another tab is shown: unmounting would drop
 * the scrollback, and re-fitting on every tab switch is far cheaper than
 * rebuilding the renderer.
 */
export function TerminalView({ session, isVisible }: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const fontSize = useSettingsStore((state) => state.settings['terminal.fontSize']);
  const fontFamily = useSettingsStore((state) => state.settings['terminal.fontFamily']);
  const cursorBlink = useSettingsStore((state) => state.settings['terminal.cursorBlink']);
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const markExited = useTerminalStore((state) => state.markExited);

  /* Create the XTerm instance and wire it to the shell process. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const terminal = new Terminal({
      fontSize: useSettingsStore.getState().settings['terminal.fontSize'],
      fontFamily: useSettingsStore.getState().settings['terminal.fontFamily'],
      cursorBlink: useSettingsStore.getState().settings['terminal.cursorBlink'],
      cursorStyle: 'bar',
      scrollback: 10_000,
      allowProposedApi: true,
      convertEol: false,
      macOptionIsMeta: true,
      theme: currentTheme ? toTerminalTheme(currentTheme) : undefined
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new SearchAddon());
    terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault();
        globalThis.open(uri, '_blank', 'noopener');
      })
    );

    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    // Send the real geometry to the pty; the process was created with a
    // placeholder size before the element had been laid out.
    api().terminal.resize(session.id, terminal.cols, terminal.rows);

    const inputListener = terminal.onData((data) => api().terminal.write(session.id, data));

    const unsubscribeData = api().terminal.onData((event) => {
      if (event.id === session.id) terminal.write(event.data);
    });

    const unsubscribeExit = api().terminal.onExit((event) => {
      if (event.id !== session.id) return;
      markExited(session.id, event.exitCode);
      terminal.write('\r\n\x1b[90m[process exited with code ' + event.exitCode + ']\x1b[0m\r\n');
    });

    const handleResize = throttle(() => {
      if (!fitRef.current || !terminalRef.current) return;
      fitRef.current.fit();
      api().terminal.resize(session.id, terminalRef.current.cols, terminalRef.current.rows);
    }, 80);

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      inputListener.dispose();
      unsubscribeData();
      unsubscribeExit();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // The instance is bound to one session for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  /* Re-apply appearance settings without recreating the terminal. */
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.fontFamily = fontFamily;
    terminal.options.cursorBlink = cursorBlink;
    fitRef.current?.fit();
  }, [fontSize, fontFamily, cursorBlink]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !currentTheme) return;
    terminal.options.theme = toTerminalTheme(currentTheme);
  }, [currentTheme]);

  /* Refit and focus when this tab becomes visible again. */
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      fitRef.current?.fit();
      const terminal = terminalRef.current;
      if (terminal) {
        api().terminal.resize(session.id, terminal.cols, terminal.rows);
        terminal.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isVisible, session.id]);

  return (
    <div
      className="terminal-view"
      ref={containerRef}
      hidden={!isVisible}
      data-testid={'terminal-' + session.id}
    />
  );
}
