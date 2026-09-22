/**
 * A minimal debug adapter, for testing the client against a real process.
 *
 * It speaks enough of the protocol to take a session from initialize to a
 * breakpoint stop and back out again: capabilities, the initialized event, a
 * launch, breakpoints, a stack, scopes, variables, stepping and a disconnect.
 *
 * Nothing here debugs anything. The point is that the service talks to a
 * separate process over real pipes, with real framing, so the parts that
 * usually break in production are the parts under test.
 */

let seq = 1;
let buffer = Buffer.alloc(0);

function send(message) {
  const payload = JSON.stringify({ seq: seq++, ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
}

function respond(request, body, success = true) {
  send({
    type: 'response',
    request_seq: request.seq,
    command: request.command,
    success,
    ...(success ? { body } : { message: body })
  });
}

function event(name, body) {
  send({ type: 'event', event: name, body });
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const length = Number.parseInt(/Content-Length:\s*(\d+)/i.exec(header)?.[1] ?? '0', 10);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;

    const request = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    buffer = buffer.subarray(start + length);
    handle(request);
  }
});

function handle(request) {
  switch (request.command) {
    case 'initialize':
      respond(request, { supportsConfigurationDoneRequest: true, supportsConditionalBreakpoints: true });
      // Real adapters send this after answering initialize, not before.
      setTimeout(() => event('initialized'), 5);
      break;

    case 'launch':
    case 'attach':
      if (request.arguments?.program === 'MISSING') {
        respond(request, 'Cannot find program MISSING', false);
        return;
      }
      respond(request, {});
      break;

    case 'setBreakpoints': {
      const lines = request.arguments?.breakpoints ?? [];
      respond(request, {
        breakpoints: lines.map((point, index) => ({ id: index + 1, verified: true, line: point.line }))
      });
      break;
    }

    case 'configurationDone':
      // The stop is announced before the response, which the protocol allows
      // and which real adapters do when a breakpoint is on the first line.
      // It is the ordering most likely to race the client's own bookkeeping.
      event('stopped', { reason: 'breakpoint', threadId: 1, allThreadsStopped: true });
      respond(request, {});
      break;

    case 'stackTrace':
      respond(request, {
        totalFrames: 2,
        stackFrames: [
          { id: 1000, name: 'total', line: 12, column: 3, source: { path: '/app/cart.js' } },
          { id: 1001, name: 'main', line: 40, column: 1, source: { path: '/app/index.js' } }
        ]
      });
      break;

    case 'scopes':
      respond(request, {
        scopes: [
          { name: 'Local', variablesReference: 2000, expensive: false },
          { name: 'Global', variablesReference: 2001, expensive: true }
        ]
      });
      break;

    case 'variables':
      respond(request, {
        variables:
          request.arguments?.variablesReference === 2000
            ? [
                { name: 'sum', value: '101', type: 'number', variablesReference: 0 },
                { name: 'cart', value: 'Array(2)', type: 'Array', variablesReference: 2002 }
              ]
            : [{ name: 'globalThis', value: 'Object', type: 'object', variablesReference: 0 }]
      });
      break;

    case 'evaluate':
      respond(request, { result: `evaluated:${request.arguments?.expression}`, variablesReference: 0 });
      break;

    case 'continue':
      respond(request, { allThreadsContinued: true });
      setTimeout(() => event('terminated'), 5);
      break;

    case 'next':
    case 'stepIn':
    case 'stepOut':
      respond(request, {});
      setTimeout(() => event('stopped', { reason: 'step', threadId: 1 }), 5);
      break;

    case 'pause':
      respond(request, {});
      setTimeout(() => event('stopped', { reason: 'pause', threadId: 1 }), 5);
      break;

    case 'disconnect':
      respond(request, {});
      setTimeout(() => process.exit(0), 5);
      break;

    default:
      respond(request, `Unsupported request: ${request.command}`, false);
      break;
  }
}
