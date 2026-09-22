import { useMemo } from 'react';
import { DOWNLOADS, type DownloadTarget } from '../data/content';

export interface DetectedPlatform {
  id: DownloadTarget['id'];
  label: string;
  target: DownloadTarget;
  /** True when detection fell back to a default rather than recognising the agent. */
  isGuess: boolean;
}

/**
 * Guesses which build the visitor wants.
 *
 * Only ever used to pick the default button and to reorder the download cards;
 * every build stays reachable, so a wrong guess costs a click rather than
 * sending someone away with the wrong file.
 */
export function usePlatform(): DetectedPlatform {
  return useMemo(() => {
    const fallback = DOWNLOADS[0] as DownloadTarget;
    const agent = globalThis.navigator?.userAgent ?? '';

    const id: DownloadTarget['id'] = /Mac|iPhone|iPad/i.test(agent)
      ? 'macos'
      : /Linux|X11|CrOS/i.test(agent)
        ? 'linux'
        : 'windows';

    const target = DOWNLOADS.find((entry) => entry.id === id) ?? fallback;
    return { id: target.id, label: target.label, target, isGuess: agent.length === 0 };
  }, []);
}
