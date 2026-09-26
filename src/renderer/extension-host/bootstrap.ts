import { buildWorkerScript } from './worker-runtime';

/**
 * The extension host page.
 *
 * Runs in a sandboxed renderer with no Node and a policy that allows scripts
 * only from this bundle and from blob URLs. It owns one Worker per running
 * extension and does nothing else: it never touches the filesystem, and it
 * cannot, which is the reason extension code runs here rather than in the
 * main process.
 *
 * It is a post office. Every call a worker makes is forwarded to the main
 * process, where the permission gate decides, and every answer is forwarded
 * back. It grants nothing on its own.
 */

interface HostBridge {
  send: (message: unknown) => void;
  onMessage: (listener: (message: unknown) => void) => void;
}

declare global {
  interface Window {
    causewayHost?: HostBridge;
  }
}

interface RunningExtension {
  worker: Worker;
  url: string;
}

const running = new Map<string, RunningExtension>();

const bridge = window.causewayHost;

if (bridge) {
  bridge.onMessage((message) => handle(message as Record<string, unknown>));
  bridge.send({ kind: 'host-ready' });
}

function handle(message: Record<string, unknown>): void {
  switch (message['kind']) {
    case 'start':
      start(String(message['id']), String(message['source']));
      break;
    case 'stop':
      stop(String(message['id']));
      break;
    case 'stop-all':
      for (const id of [...running.keys()]) stop(id);
      break;
    case 'result':
      // An answer from the main process, addressed to one worker.
      running.get(String(message['id']))?.worker.postMessage(message['payload']);
      break;
    case 'command':
      running.get(String(message['id']))?.worker.postMessage({
        kind: 'command',
        commandId: message['commandId']
      });
      break;
    default:
      break;
  }
}

/**
 * Starts one extension in its own worker.
 *
 * The source arrives as text from the main process rather than being fetched
 * here, because this page has no filesystem access and no network. A blob is
 * the only way in, and it is also the only thing the policy allows.
 */
function start(id: string, source: string): void {
  stop(id);

  let url: string;
  let worker: Worker;

  try {
    url = URL.createObjectURL(new Blob([buildWorkerScript(source)], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch (error) {
    bridge?.send({
      kind: 'failed',
      id,
      message: `The extension could not be started: ${String(error)}`
    });
    return;
  }

  worker.addEventListener('message', (event: MessageEvent) => {
    const payload = event.data as Record<string, unknown>;

    if (payload?.['kind'] === 'call') {
      bridge?.send({
        kind: 'call',
        id,
        callId: payload['id'],
        method: payload['method'],
        args: payload['args']
      });
      return;
    }

    if (payload?.['kind'] === 'failed') {
      bridge?.send({ kind: 'failed', id, message: String(payload['message'] ?? 'Unknown failure') });
      return;
    }

    if (payload?.['kind'] === 'ready') bridge?.send({ kind: 'started', id });
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    // A worker that throws while loading never reports ready, so this is the
    // only place a syntax error in an extension becomes visible.
    bridge?.send({
      kind: 'failed',
      id,
      message: event.message || 'The extension failed while loading.'
    });
    stop(id);
  });

  running.set(id, { worker, url });
}

function stop(id: string): void {
  const entry = running.get(id);
  if (!entry) return;

  entry.worker.terminate();
  URL.revokeObjectURL(entry.url);
  running.delete(id);
}
