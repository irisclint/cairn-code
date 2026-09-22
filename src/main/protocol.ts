import { protocol, net, app } from 'electron';
import { pathToFileURL } from 'node:url';
import { normalize, isAbsolute } from 'node:path';
import { APP_PROTOCOL } from '@shared/constants';
import { createLogger } from '@shared/logger';

const log = createLogger('protocol');

/**
 * Registers the custom `cairn://` scheme.
 *
 * The scheme serves workspace resources (image previews, theme assets) to the
 * renderer without granting it blanket `file://` access. Every request is
 * resolved against an allowlist of root directories, so a crafted URL cannot
 * escape the opened workspace.
 */
export function registerProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ]);
}

export class ProtocolHandler {
  #allowedRoots = new Set<string>();

  constructor() {
    // Bundled resources are always readable.
    this.allowRoot(app.getAppPath());
  }

  allowRoot(rootPath: string | null): void {
    if (!rootPath) return;
    this.#allowedRoots.add(normalize(rootPath).toLowerCase());
  }

  clearWorkspaceRoots(): void {
    const appRoot = normalize(app.getAppPath()).toLowerCase();
    this.#allowedRoots = new Set([appRoot]);
  }

  register(): void {
    protocol.handle(APP_PROTOCOL, async (request) => {
      const url = new URL(request.url);
      // cairn://file/<absolute-path>
      const rawPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

      if (url.hostname !== 'file' || rawPath.length === 0) {
        return new Response('Not found', { status: 404 });
      }

      const resolved = normalize(rawPath);
      if (!isAbsolute(resolved) || !this.#isAllowed(resolved)) {
        log.warn(`Blocked protocol request outside allowed roots: ${resolved}`);
        return new Response('Forbidden', { status: 403 });
      }

      try {
        return await net.fetch(pathToFileURL(resolved).toString());
      } catch (error) {
        log.warn(`Protocol request failed for ${resolved}: ${String(error)}`);
        return new Response('Not found', { status: 404 });
      }
    });
  }

  #isAllowed(candidate: string): boolean {
    const normalized = candidate.toLowerCase();
    for (const root of this.#allowedRoots) {
      if (
        normalized === root ||
        normalized.startsWith(
          `${root}${root.endsWith('\\') || root.endsWith('/') ? '' : process.platform === 'win32' ? '\\' : '/'}`
        )
      ) {
        return true;
      }
    }
    return false;
  }
}
