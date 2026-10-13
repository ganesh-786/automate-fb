import type { Spike } from './harness/types.ts';
import { imageCloudflare } from './spikes/image-cloudflare.ts';
import { publishBufferTiktok } from './spikes/publish-buffer-tiktok.ts';
import { publishFacebookReel } from './spikes/publish-facebook-reel.ts';
import { renderRemotion } from './spikes/render-remotion.ts';
import { scriptGemini } from './spikes/script-gemini.ts';
import { voiceKokoro } from './spikes/voice-kokoro.ts';

/**
 * Every spike, in the order they must run: the render uses the narration the voice spike makes,
 * and the Facebook upload uses the video the render makes.
 */
export const SPIKES: readonly Spike[] = [
  voiceKokoro,
  renderRemotion,
  scriptGemini,
  imageCloudflare,
  publishFacebookReel,
  publishBufferTiktok,
];

/** Named selections accepted on the command line in place of spike ids. */
export const GROUPS: Readonly<Record<string, readonly string[]>> = {
  all: SPIKES.map((spike) => spike.id),
  local: SPIKES.filter((spike) => spike.requiredEnv.length === 0).map((spike) => spike.id),
};

/**
 * Resolves spike ids and group names to spikes. The result always follows registry order,
 * whatever order the names were given in. No names means every spike.
 */
export function selectSpikes(names: readonly string[]): Spike[] {
  const wanted = new Set<string>();
  for (const name of names.length === 0 ? ['all'] : names) {
    const members =
      GROUPS[name] ?? (SPIKES.some((spike) => spike.id === name) ? [name] : undefined);
    if (!members) {
      const valid = [...Object.keys(GROUPS), ...SPIKES.map((spike) => spike.id)].join(', ');
      throw new Error(`Unknown spike "${name}". Choose from: ${valid}.`);
    }
    members.forEach((id) => wanted.add(id));
  }
  return SPIKES.filter((spike) => wanted.has(spike.id));
}
