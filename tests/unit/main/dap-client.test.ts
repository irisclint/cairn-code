import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import { DapClient, type DapEvent } from '@main/services/dap-client';

/**
 * Exercises the protocol client against a fake adapter.
 *
 * A real adapter is a separate program with its own installation requirements,
 * so the transport is driven directly here. What matters is the framing and
 * the failure behaviour, and both are fully visible from the two streams.
 */

let toAdapter: PassThrough;
let fromAdapter: PassThrough;
let client: DapClient;

/** Everything the client has written, as text. */
let written: string;

function frame(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

beforeEach(() => {
  toAdapter = new PassThrough();
  fromAdapter = new PassThrough();
  written = '';
  toAdapter.on('data', (chunk: Buffer) => {
    written += chunk.toString('utf8');
  });
  client = new DapClient(toAdapter, fromAdapter);
});

afterEach(() => {
  client.dispose();
});

describe('framing a request', () => {
  it('should write a Content-Length header and the exact body length', async () => {
    // Never answered: this test reads what was written, not what came back.
    void client.send('initialize', { adapterID: 'test' }).catch(() => undefined);
    await vi.waitFor(() => expect(written.length).toBeGreaterThan(0));

    const [header, body] = written.split('\r\n\r\n');
    expect(header).toMatch(/^Content-Length: \d+$/);

    const declared = Number.parseInt(/(\d+)/.exec(header as string)?.[1] ?? '0', 10);
    expect(Buffer.byteLength(body as string, 'utf8')).toBe(declared);
    expect(JSON.parse(body as string)).toMatchObject({
      type: 'request',
      command: 'initialize',
      arguments: { adapterID: 'test' }
    });
  });

  it('should count bytes rather than characters', async () => {
    void client.send('evaluate', { expression: 'grüße — 日本語' }).catch(() => undefined);
    await vi.waitFor(() => expect(written.length).toBeGreaterThan(0));

    const [header, body] = written.split('\r\n\r\n');
    const declared = Number.parseInt(/(\d+)/.exec(header as string)?.[1] ?? '0', 10);

    // The body is longer in bytes than in characters, and the header has to
    // say bytes or the adapter reads the wrong amount and desynchronises.
    expect(declared).toBe(Buffer.byteLength(body as string, 'utf8'));
    expect(declared).toBeGreaterThan((body as string).length);
  });

  it('should give each request its own sequence number', async () => {
    void client.send('first').catch(() => undefined);
    void client.send('second').catch(() => undefined);
    await vi.waitFor(() => expect(written.split('Content-Length').length).toBe(3));

    const seqs = [...written.matchAll(/"seq":(\d+)/g)].map((match) => Number(match[1]));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

describe('reading responses', () => {
  it('should resolve with the response body', async () => {
    const pending = client.send('threads');
    fromAdapter.write(
      frame({ seq: 1, type: 'response', request_seq: 1, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } })
    );

    await expect(pending).resolves.toEqual({ threads: [{ id: 1, name: 'main' }] });
  });

  it('should reject a failure with the adapter own message', async () => {
    const pending = client.send('launch');
    fromAdapter.write(
      frame({
        seq: 1,
        type: 'response',
        request_seq: 1,
        success: false,
        command: 'launch',
        message: 'Cannot find program /app/missing.js'
      })
    );

    await expect(pending).rejects.toMatchObject({
      code: 'DAP_REQUEST_FAILED',
      message: 'Cannot find program /app/missing.js'
    });
  });

  it('should still explain a failure that carries no message', async () => {
    const pending = client.send('setBreakpoints');
    fromAdapter.write(
      frame({ seq: 1, type: 'response', request_seq: 1, success: false, command: 'setBreakpoints' })
    );

    await expect(pending).rejects.toMatchObject({ code: 'DAP_REQUEST_FAILED' });
    await pending.catch((error: { userCause: string; solution: string }) => {
      expect(error.userCause).toContain('setBreakpoints');
      expect(error.solution).toContain('launch configuration');
    });
  });

  it('should ignore a response to a request it never sent', async () => {
    const pending = client.send('threads');
    fromAdapter.write(frame({ seq: 9, type: 'response', request_seq: 99, success: true, command: 'x' }));
    fromAdapter.write(
      frame({ seq: 10, type: 'response', request_seq: 1, success: true, command: 'threads', body: 'ok' })
    );

    await expect(pending).resolves.toBe('ok');
  });
});

describe('the transport', () => {
  it('should reassemble a message split across chunks', async () => {
    const pending = client.send('threads');
    const text = frame({ seq: 1, type: 'response', request_seq: 1, success: true, command: 'threads', body: 42 });

    // Split inside the JSON body, which is where a real socket usually breaks.
    fromAdapter.write(text.slice(0, 30));
    await new Promise((resolve) => setTimeout(resolve, 5));
    fromAdapter.write(text.slice(30));

    await expect(pending).resolves.toBe(42);
  });

  it('should read two messages delivered in one chunk', async () => {
    const events: DapEvent[] = [];
    client.on('event', (event: DapEvent) => events.push(event));

    fromAdapter.write(
      frame({ seq: 1, type: 'event', event: 'initialized' }) +
        frame({ seq: 2, type: 'event', event: 'stopped', body: { reason: 'breakpoint' } })
    );

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[0]?.event).toBe('initialized');
    expect(events[1]?.body).toEqual({ reason: 'breakpoint' });
  });

  it('should survive a message that is not JSON', async () => {
    const warnings: string[] = [];
    client.on('warning', (text: string) => warnings.push(text));

    const pending = client.send('threads');
    fromAdapter.write('Content-Length: 7\r\n\r\nnot-jsn');
    fromAdapter.write(
      frame({ seq: 2, type: 'response', request_seq: 1, success: true, command: 'threads', body: 'fine' })
    );

    // The framing is still intact, so the next message arrives normally.
    await expect(pending).resolves.toBe('fine');
    expect(warnings).toHaveLength(1);
  });

  it('should end the session when a header has no length', async () => {
    const pending = client.send('threads');
    fromAdapter.write('Proto-Version: 1\r\n\r\n{}');

    await expect(pending).rejects.toMatchObject({ code: 'DAP_CLOSED' });
    expect(client.closed).toBe(true);
  });
});

describe('when the adapter goes away', () => {
  it('should fail everything still waiting, with a reason', async () => {
    const first = client.send('threads');
    const second = client.send('stackTrace');

    fromAdapter.emit('close');

    await expect(first).rejects.toMatchObject({ code: 'DAP_CLOSED' });
    await expect(second).rejects.toMatchObject({ code: 'DAP_CLOSED' });
  });

  it('should refuse a new request rather than hanging', async () => {
    client.dispose();
    await expect(client.send('threads')).rejects.toMatchObject({ code: 'DAP_CLOSED' });
  });

  it('should announce the close once, even if disposed twice', () => {
    const closes: string[] = [];
    client.on('closed', (reason: string) => closes.push(reason));

    client.dispose();
    client.dispose();

    expect(closes).toHaveLength(1);
  });
});

describe('a hung adapter', () => {
  it('should give up and say how long it waited', async () => {
    vi.useFakeTimers();
    const pending = client.send('threads');

    // The handler is attached before the clock moves. Attaching it afterwards
    // leaves the rejection unhandled for a tick, which Node reports as an
    // unhandled rejection and which fails the run even though the test passes.
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'DAP_TIMEOUT',
      userCause: expect.stringContaining('20 seconds')
    });

    await vi.advanceTimersByTimeAsync(21_000);
    await rejected;
    vi.useRealTimers();
  });
});
