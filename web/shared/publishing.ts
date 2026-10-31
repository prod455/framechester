// Which networks the Studio sends to, and the cross-reference block every description carries.
import type { Platform, ProfileLink } from './types.ts';

/** Networks the Studio sends to: YouTube private, TikTok SELF_ONLY, Facebook Reel draft, and
 * Instagram, whose API has no draft or private mode and publishes publicly. */
export const publishingPlatforms: readonly Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];
/** Sending there makes the post public at once; the operator authorizes it explicitly. */
export const publicPlatforms: readonly Platform[] = ['instagram'];
/** Facebook and Instagram receive the video as a Reel, which the Studio keeps vertical. */
export const verticalOnly: readonly Platform[] = ['instagram', 'facebook'];

export const platformLabels: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};
const order: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];
const heading: Record<string, string> = {
  pt: 'Acompanhe também:',
  en: 'Also on:',
  es: 'Síguenos también en:',
};

export function canPublish(platform: Platform, vertical: boolean): boolean {
  return publishingPlatforms.includes(platform) && (vertical || !verticalOnly.includes(platform));
}

/** Links to the channel's other connected networks, in a fixed order, in the channel's language;
 * empty when the target is the only network connected. */
export function crossReferences(target: Platform, links: ProfileLink[], language: string): string {
  const others = order
    .filter((platform) => platform !== target)
    .map((platform) => links.find((link) => link.platform === platform))
    .filter((link): link is ProfileLink => link !== undefined);
  if (!others.length) return '';
  const title = heading[language.toLowerCase().split('-')[0]!] ?? heading.pt!;
  return [title, ...others.map((link) => `${platformLabels[link.platform]}: ${link.url}`)].join('\n');
}

/** The description text, then the cross references, then a trailing tag (YouTube's #Shorts). */
export function postDescription(text: string, references: string, tag?: string): string {
  return [text.trimEnd(), references, tag].filter(Boolean).join('\n\n');
}
