import { ExtensionError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { validateManifest } from './extension-manifest';
import { hashBundle, type ExtensionBundle, type ExtensionRegistry } from './extension-registry';
import { EXTENSION_PERMISSIONS, type ExtensionPermission, type MarketplaceEntry } from '@shared/types';

const log = createLogger('marketplace');

/** A registry index or a bundle larger than this is refused unread. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** The fetch this client uses, injected so it can be driven in tests. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * The marketplace client.
 *
 * Fetches only when the user asks: opening the marketplace, refreshing it, or
 * installing something. Nothing here runs on start-up, which is what keeps the
 * promise that the update check is the only request the editor makes on its
 * own.
 *
 * There is no registry to point it at yet. The address is a setting with no
 * default rather than a URL baked in, so the client is finished and the
 * catalogue is simply not published; the panel says exactly that instead of
 * showing an empty store.
 */
export class MarketplaceClient {
  #fetch: FetchLike;
  #registry: ExtensionRegistry;

  constructor(registry: ExtensionRegistry, fetchImpl?: FetchLike) {
    this.#registry = registry;
    this.#fetch = fetchImpl ?? ((url) => fetch(url));
  }

  /** Reads the catalogue a registry publishes. */
  async browse(registryUrl: string): Promise<MarketplaceEntry[]> {
    const url = this.#requireHttps(registryUrl, 'the registry address');
    const text = await this.#get(url, 'the registry index');

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new ExtensionError({
        code: 'MARKETPLACE_BAD_INDEX',
        message: 'The registry sent something that is not a catalogue',
        cause: `${url} answered with content that is not JSON: ${String(error)}`,
        solution: 'Check the registry address in Settings. A plain web page at that address produces exactly this.'
      });
    }

    const entries = Array.isArray(raw) ? raw : (raw as { extensions?: unknown }).extensions;
    if (!Array.isArray(entries)) {
      throw new ExtensionError({
        code: 'MARKETPLACE_BAD_INDEX',
        message: 'The registry catalogue has the wrong shape',
        cause: 'A catalogue is a list of extensions, or an object with an "extensions" list. Neither was there.',
        solution: 'Check the registry address in Settings, or report the shape to whoever runs it.'
      });
    }

    // One malformed entry is skipped rather than failing the whole catalogue:
    // a registry with one bad row is still useful for every other row.
    const valid: MarketplaceEntry[] = [];
    for (const entry of entries) {
      const parsed = this.#readEntry(entry);
      if (parsed) valid.push(parsed);
      else log.warn('Skipped a malformed marketplace entry');
    }

    return valid;
  }

  /**
   * Downloads and installs one entry.
   *
   * The bundle is hashed before anything is written and compared with what the
   * catalogue said. A mismatch means the file changed between being listed and
   * being fetched, which is exactly the case where installing it anyway is the
   * wrong thing to do.
   */
  async install(entry: MarketplaceEntry): Promise<void> {
    const url = this.#requireHttps(entry.archiveUrl, `the download address for ${entry.id}`);
    const text = await this.#get(url, `the ${entry.name} download`);

    const actual = hashBundle(text);
    if (actual !== entry.sha256.toLowerCase()) {
      throw new ExtensionError({
        code: 'MARKETPLACE_HASH_MISMATCH',
        message: `${entry.name} is not the file the registry listed`,
        cause: `The catalogue said the download would hash to ${entry.sha256}, and what arrived hashes to ${actual}. Either it was changed after being published, or something changed it on the way here.`,
        solution: 'Do not install it. Report the mismatch to the registry; a correct download always matches.'
      });
    }

    let bundle: ExtensionBundle;
    try {
      bundle = JSON.parse(text) as ExtensionBundle;
    } catch (error) {
      throw new ExtensionError({
        code: 'MARKETPLACE_BAD_BUNDLE',
        message: `${entry.name} could not be read`,
        cause: `The download hashed correctly but is not a bundle: ${String(error)}`,
        solution: 'Report it to the publisher. The file is intact and the wrong format.'
      });
    }

    // The manifest is checked against the catalogue before installing, so a
    // registry cannot list one set of permissions and ship another.
    const manifest = validateManifest(bundle.manifest, `the ${entry.name} bundle`);

    if (manifest.id !== entry.id) {
      throw new ExtensionError({
        code: 'MARKETPLACE_ID_MISMATCH',
        message: `${entry.name} is not the extension the registry listed`,
        cause: `The catalogue listed ${entry.id} and the bundle declares ${manifest.id}.`,
        solution: 'Do not install it. Report the mismatch to the registry.'
      });
    }

    const listed = [...entry.permissions].sort().join(',');
    const actualPermissions = [...manifest.permissions].sort().join(',');

    if (listed !== actualPermissions) {
      throw new ExtensionError({
        code: 'MARKETPLACE_PERMISSION_MISMATCH',
        message: `${entry.name} asks for more than the registry said`,
        cause: `The catalogue listed [${listed || 'none'}] and the bundle asks for [${actualPermissions || 'none'}]. You agreed to the first list.`,
        solution: 'Do not install it. Report the mismatch to the registry; this is the difference between what you were shown and what you would get.'
      });
    }

    await this.#registry.install(bundle);
    log.info(`Installed ${manifest.id} ${manifest.version} from the marketplace`);
  }

  /* ------------------------------------------------------------------ */

  async #get(url: string, what: string): Promise<string> {
    let response: Awaited<ReturnType<FetchLike>>;

    try {
      response = await this.#fetch(url);
    } catch (error) {
      throw new ExtensionError({
        code: 'MARKETPLACE_UNREACHABLE',
        message: `${what} could not be fetched`,
        cause: `Requesting ${url} failed: ${String(error)}`,
        solution: 'Check that you are online and that the registry address in Settings is right.'
      });
    }

    if (!response.ok) {
      throw new ExtensionError({
        code: 'MARKETPLACE_HTTP_ERROR',
        message: `${what} could not be fetched`,
        cause: `${url} answered with status ${response.status}.`,
        solution:
          response.status === 404
            ? 'Nothing is published at that address. Check the registry address in Settings.'
            : 'Try again in a moment. If it keeps happening, the registry is having trouble rather than you.'
      });
    }

    const text = await response.text();

    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new ExtensionError({
        code: 'MARKETPLACE_TOO_LARGE',
        message: `${what} is too large`,
        cause: `The response is over ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB, and nothing this client asks for should be.`,
        solution: 'Report it to the registry. A limit is here so that a bad response cannot exhaust memory.'
      });
    }

    return text;
  }

  /**
   * Refuses anything but https.
   *
   * A registry over plain http can be rewritten in transit by anyone on the
   * path, and the thing being fetched is code that will run on this machine.
   */
  #requireHttps(raw: string, what: string): string {
    let url: URL;

    try {
      url = new URL(raw);
    } catch {
      throw new ExtensionError({
        code: 'MARKETPLACE_BAD_URL',
        message: `${what} is not a valid address`,
        cause: `"${raw}" could not be read as a URL.`,
        solution: 'Set a full address including https://, for example https://example.com/registry.json.'
      });
    }

    if (url.protocol !== 'https:') {
      throw new ExtensionError({
        code: 'MARKETPLACE_INSECURE',
        message: `${what} is not https`,
        cause: `"${raw}" uses ${url.protocol.replace(':', '')}, which anyone on the network path can rewrite. What is being fetched is code that will run on this machine.`,
        solution: 'Use an https address. There is no setting to turn this off.'
      });
    }

    return url.toString();
  }

  /** Reads one catalogue row, or null when it is not usable. */
  #readEntry(raw: unknown): MarketplaceEntry | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;

    const strings = ['id', 'name', 'version', 'publisher', 'description', 'archiveUrl', 'sha256'];
    for (const field of strings) {
      if (typeof record[field] !== 'string' || (record[field] as string).length === 0) return null;
    }

    if (!/^[0-9a-f]{64}$/i.test(record['sha256'] as string)) return null;

    const permissions = Array.isArray(record['permissions']) ? record['permissions'] : [];
    if (
      !permissions.every((value) => (EXTENSION_PERMISSIONS as readonly unknown[]).includes(value))
    ) {
      return null;
    }

    return {
      id: record['id'] as string,
      name: record['name'] as string,
      version: record['version'] as string,
      publisher: record['publisher'] as string,
      description: record['description'] as string,
      archiveUrl: record['archiveUrl'] as string,
      sha256: (record['sha256'] as string).toLowerCase(),
      permissions: permissions as ExtensionPermission[],
      ...(typeof record['downloads'] === 'number' ? { downloads: record['downloads'] } : {})
    };
  }
}
