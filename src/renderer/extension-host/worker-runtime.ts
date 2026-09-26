/**
 * The code that wraps every extension inside its worker.
 *
 * Kept as a string because it is not part of this bundle: it is prepended to
 * the extension's own source and turned into a blob that becomes the worker.
 * Writing it as a template rather than a module keeps what the extension sees
 * in one readable place, which matters because this is the entire surface a
 * sandboxed extension has.
 *
 * What the extension gets is a `causeway` object whose every method returns a
 * promise and does nothing but post a message. There is no DOM in a worker, no
 * Node, and the page's policy forbids the network, so this really is all of
 * it.
 */
export const WORKER_RUNTIME = `
"use strict";

(function () {
  var pending = new Map();
  var nextId = 1;

  function request(method, args) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      self.postMessage({ kind: 'call', id: id, method: method, args: args });
    });
  }

  self.addEventListener('message', function (event) {
    var message = event.data;

    if (message && message.kind === 'result') {
      var entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);

      if (message.ok) entry.resolve(message.value);
      else entry.reject(Object.assign(new Error(message.error.message), message.error));
      return;
    }

    if (message && message.kind === 'command') {
      var handler = commandHandlers.get(message.commandId);
      // A command with no handler is not an error worth stopping for: the
      // extension may have registered it and not finished wiring it up.
      if (handler) Promise.resolve().then(handler).catch(reportUnhandled);
    }
  });

  function reportUnhandled(error) {
    self.postMessage({
      kind: 'failed',
      message: String((error && error.message) || error),
      stack: String((error && error.stack) || '')
    });
  }

  self.addEventListener('error', function (event) {
    reportUnhandled(event.error || event.message);
  });
  self.addEventListener('unhandledrejection', function (event) {
    reportUnhandled(event.reason);
  });

  var commandHandlers = new Map();

  self.causeway = {
    commands: {
      register: function (id, handler) {
        if (typeof handler !== 'function') {
          return Promise.reject(new TypeError('commands.register needs a function to run'));
        }
        commandHandlers.set(id, handler);
        return request('commands.register', [id]);
      }
    },
    notifications: {
      show: function (message, cause, solution) {
        return request('notifications.show', [message, cause, solution]);
      }
    },
    workspace: {
      readFile: function (path) {
        return request('workspace.readFile', [path]);
      },
      writeFile: function (path, text) {
        return request('workspace.writeFile', [path, text]);
      },
      listFiles: function (path) {
        return request('workspace.listFiles', [path]);
      }
    },
    diagnostics: {
      explain: function (code, cause, solution, documentationUrl) {
        return request('diagnostics.explain', [code, cause, solution, documentationUrl]);
      }
    },
    clipboard: {
      read: function () {
        return request('clipboard.read', []);
      },
      write: function (text) {
        return request('clipboard.write', [text]);
      }
    }
  };

  self.postMessage({ kind: 'ready' });
})();
`;

/**
 * Builds the script for one extension's worker.
 *
 * The extension's own source goes last, so nothing it defines can shadow the
 * runtime before the runtime has installed itself.
 */
export function buildWorkerScript(source: string): string {
  return `${WORKER_RUNTIME}\n;(function () {\n${source}\n})();\n`;
}
