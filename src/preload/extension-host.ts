import { contextBridge, ipcRenderer } from 'electron';

/**
 * The bridge for the extension host page.
 *
 * Deliberately two functions. The workbench bridge exposes one method per
 * allowlisted channel because the renderer drives many different operations;
 * this page drives exactly one conversation, with the main process on the
 * other end, and every message in it is checked there.
 *
 * Nothing here decides anything. A sandboxed page that could decide would be a
 * second place to get the permission model right, and one is enough.
 *
 * The two channel names are written out rather than imported, which is the one
 * place in this project where a constant is duplicated. A preload for a
 * sandboxed window cannot require anything but a short allowlist of built-in
 * modules, and the bundler puts shared constants in a chunk that the preload
 * then requires by path. That require fails silently in a sandbox, the bridge
 * is never exposed, and the page sits there doing nothing.
 *
 * A test asserts these two strings against IpcChannel, so the duplication
 * cannot drift without failing the build.
 */
const TO_MAIN = 'extension-host:to-main';
const TO_HOST = 'extension-host:to-host';

const bridge = {
  /** Sends one message to the main process. */
  send: (message: unknown): void => {
    ipcRenderer.send(TO_MAIN, message);
  },

  /** Registers the single listener for messages coming the other way. */
  onMessage: (listener: (message: unknown) => void): void => {
    ipcRenderer.on(TO_HOST, (_event, message: unknown) => listener(message));
  }
};

contextBridge.exposeInMainWorld('causewayHost', bridge);

export type CausewayHostBridge = typeof bridge;
