import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { CausewayError } from '@shared/errors';

/**
 * A Debug Adapter Protocol client.
 *
 * causeway speaks the protocol; it does not ship adapters. Debugging Node
 * needs js-debug, Python needs debugpy, and each is large, versioned with its
 * language, and already installed by anyone who debugs that language. Bundling
 * one would pick a winner and bloat the installer; driving whichever the
 * workspace configures is both smaller and more correct.
 *
 * The wire format is HTTP-like: a `Content-Length` header, a blank line, then
 * that many bytes of JSON. Framing is done here rather than with a library
 * because it is thirty lines and the failure modes are ones we want to explain
 * ourselves.
 */

export interface DapMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
}

export interface DapResponse extends DapMessage {
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: unknown;
}

export interface DapEvent extends DapMessage {
  type: 'event';
  event: string;
  body?: unknown;
}

const HEADER_SEPARATOR = '\r\n\r\n';

/** How long a request may take before it is treated as a hung adapter. */
const REQUEST_TIMEOUT_MS = 20_000;

interface Pending {
  resolve: (body: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
  command: string;
}

/**
 * Speaks DAP over a pair of streams.
 *
 * Emits `event` for every adapter event and `closed` when the transport ends.
 * Knows nothing about breakpoints or stack frames: those belong to the service
 * above it, which keeps this testable against a fake adapter.
 */
export class DapClient extends EventEmitter {
  #input: Writable;
  #buffer = Buffer.alloc(0);
  #seq = 1;
  #pending = new Map<number, Pending>();
  #closed = false;

  constructor(input: Writable, output: Readable) {
    super();
    this.#input = input;

    output.on('data', (chunk: Buffer) => this.#receive(chunk));
    output.on('close', () => this.#end('The debug adapter closed its output stream.'));
    output.on('error', (error) => this.#end(`The debug adapter stream failed: ${String(error)}`));
  }

  /** True once the transport has ended and no further requests can be sent. */
  get closed(): boolean {
    return this.#closed;
  }

  /**
   * Sends a request and resolves with its body.
   *
   * A failed response becomes a rejection carrying the adapter's own message,
   * which is nearly always the specific thing that went wrong.
   */
  async send(command: string, args?: unknown): Promise<unknown> {
    if (this.#closed) {
      throw new CausewayError({
        code: 'DAP_CLOSED',
        message: 'The debug session has ended',
        cause: `The adapter is no longer running, so the ${command} request could not be sent.`,
        solution: 'Start the session again from the Run and Debug panel.'
      });
    }

    const seq = this.#seq++;
    const payload = JSON.stringify({ seq, type: 'request', command, arguments: args });
    const message = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}${HEADER_SEPARATOR}${payload}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(seq);
        reject(
          new CausewayError({
            code: 'DAP_TIMEOUT',
            message: `The debug adapter did not answer the ${command} request`,
            cause: `No response arrived within ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
            solution:
              'Stop the session and start it again. If it keeps happening, run the adapter from a terminal to see what it reports.'
          })
        );
      }, REQUEST_TIMEOUT_MS);

      this.#pending.set(seq, { resolve, reject, timer, command });
      this.#input.write(message, 'utf8');
    });
  }

  /** Ends the transport and fails everything still waiting. */
  dispose(): void {
    this.#end('The debug session was stopped.');
  }

  /* ------------------------------------------------------------------ */

  #receive(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);

    // A single chunk can hold part of a message, one message, or several, so
    // the buffer is drained until it no longer contains a complete one.
    for (;;) {
      const headerEnd = this.#buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd === -1) return;

      const header = this.#buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);

      if (!match) {
        // Unrecoverable: without a length there is no way to find where this
        // message ends and the next begins.
        this.#end(`The debug adapter sent a message with no Content-Length header: ${header}`);
        return;
      }

      const length = Number.parseInt(match[1] as string, 10);
      const start = headerEnd + HEADER_SEPARATOR.length;
      if (this.#buffer.length < start + length) return;

      const body = this.#buffer.subarray(start, start + length).toString('utf8');
      this.#buffer = this.#buffer.subarray(start + length);

      try {
        this.#dispatch(JSON.parse(body) as DapMessage);
      } catch {
        // One unparseable message is not worth ending the session over; the
        // framing is still intact, so the next one may be fine.
        this.emit('warning', `The debug adapter sent a message that is not JSON: ${body.slice(0, 200)}`);
      }
    }
  }

  #dispatch(message: DapMessage): void {
    if (message.type === 'event') {
      this.emit('event', message as DapEvent);
      return;
    }

    if (message.type !== 'response') return;

    const response = message as DapResponse;
    const pending = this.#pending.get(response.request_seq);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.#pending.delete(response.request_seq);

    if (response.success) {
      pending.resolve(response.body);
      return;
    }

    pending.reject(
      new CausewayError({
        code: 'DAP_REQUEST_FAILED',
        message: response.message ?? `The debug adapter refused the ${pending.command} request`,
        cause:
          response.message ??
          `The adapter answered ${pending.command} with a failure and gave no reason.`,
        solution:
          'Check the launch configuration: a wrong program path or a missing runtime is what usually produces this.'
      })
    );
  }

  #end(reason: string): void {
    if (this.#closed) return;
    this.#closed = true;

    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(
        new CausewayError({
          code: 'DAP_CLOSED',
          message: 'The debug session ended before the adapter answered',
          cause: reason,
          solution:
            'Start the session again. If the adapter exits immediately, run it from a terminal to see the error it prints.'
        })
      );
    }

    this.#pending.clear();
    this.emit('closed', reason);
  }
}
