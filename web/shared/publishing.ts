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

/** Published limits, read in each network's documentation on 2026-10-31. Text is measured the
 * way the network counts it; a missing field means the documentation states no limit. */
export interface NetworkLimits {
  title?: number;
  text?: number;
  textUnit: 'utf16' | 'bytes';
  /** TikTok and Instagram have a single caption: the title opens it. */
  titleInText: boolean;
  hashtags?: number;
  mentions?: number;
  maxBytes?: number;
  minSeconds?: number;
  maxSeconds?: number;
  minFps?: number;
  maxFps?: number;
  minSide?: number;
  maxSide?: number;
  maxWidth?: number;
  minWidth?: number;
  minHeight?: number;
  /** Width / height, within 1%. */
  aspect?: number;
}
export const networkLimits: Record<Platform, NetworkLimits> = {
  // videos.insert: title 100 characters, description 5000 bytes, file up to 256 GB.
  youtube: { title: 100, text: 5000, textUnit: 'bytes', titleInText: false, maxBytes: 256 * 1024 ** 3 },
  // Direct Post: caption 2200 UTF-16 units; Media Transfer Guide: 4 GB, 10 min, 23-60 fps, 360-4096 px.
  tiktok: {
    text: 2200,
    textUnit: 'utf16',
    titleInText: true,
    maxBytes: 4_000_000_000,
    maxSeconds: 600,
    minFps: 23,
    maxFps: 60,
    minSide: 360,
    maxSide: 4096,
  },
  // IG User Media: caption 2200 characters, 30 hashtags, 20 @ tags; Reels 3 s-15 min, 300 MB,
  // 23-60 fps, width up to 1920 px.
  instagram: {
    text: 2200,
    textUnit: 'utf16',
    titleInText: true,
    hashtags: 30,
    mentions: 20,
    maxBytes: 300_000_000,
    minSeconds: 3,
    maxSeconds: 900,
    minFps: 23,
    maxFps: 60,
    maxWidth: 1920,
  },
  // Reels Publishing: 3-90 s, 9:16, at least 540x960, 24-60 fps; no title or description limit stated.
  facebook: {
    title: 100,
    textUnit: 'utf16',
    titleInText: false,
    minSeconds: 3,
    maxSeconds: 90,
    minFps: 24,
    maxFps: 60,
    minWidth: 540,
    minHeight: 960,
    aspect: 9 / 16,
  },
};

const encoder = new TextEncoder();
export function measure(text: string, unit: NetworkLimits['textUnit']): number {
  return unit === 'bytes' ? encoder.encode(text).length : text.length;
}
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION = /@[A-Za-z0-9._]+/g;
export function countTags(text: string): { hashtags: number; mentions: number } {
  return { hashtags: text.match(HASHTAG)?.length ?? 0, mentions: text.match(MENTION)?.length ?? 0 };
}
/** Cuts to `max` without splitting a surrogate pair. */
function cut(text: string, max: number, unit: NetworkLimits['textUnit']): string {
  let result = text;
  if (measure(result, unit) <= max) return result;
  result = result.slice(0, Math.max(0, max));
  while (measure(result, unit) > max) result = result.slice(0, -1);
  return /[\ud800-\udbff]$/.test(result) ? result.slice(0, -1) : result;
}
/** Keeps the first `limit` matches of `pattern` in the body and removes the rest. */
function keepFirst(body: string, pattern: RegExp, limit: number): string {
  let seen = 0;
  return body.replace(pattern, (match) => (++seen > limit ? match.replace(/[#@][^\s]*$/, '') : match));
}

/**
 * The exact title and text sent to a network, within its limits. Deterministic: the same parts
 * always give the same result. What gives way first is the end of the body (cut at a word,
 * with an ellipsis); the cross references and the trailing tag stay whole while they fit.
 */
export function postText(
  platform: Platform,
  parts: { title: string; body: string; references: string; tag?: string },
): { title: string; text: string } {
  const limits = networkLimits[platform];
  let title = parts.title.replace(/\s+/g, ' ').trim();
  if (platform === 'youtube') title = title.replace(/[<>]/g, '');
  if (limits.title) title = cut(title, limits.title, 'utf16').trim();
  let body = parts.body.trim();
  if (platform === 'youtube') body = body.replace(/[<>]/g, '');
  let references = parts.references;
  const tag = parts.tag ?? '';
  const head = limits.titleInText ? title : '';
  const compose = () => [head, body, references, tag].filter(Boolean).join('\n\n');
  // Tags the network counts: the ones in the fixed parts stay, the body keeps what is left.
  for (const [key, pattern] of [
    ['hashtags', HASHTAG],
    ['mentions', MENTION],
  ] as const) {
    const max = limits[key];
    if (max === undefined) continue;
    const fixed = countTags([head, references, tag].join('\n'))[key];
    body = keepFirst(body, pattern, Math.max(0, max - fixed)).replace(/[ \t]+\n/g, '\n');
  }
  if (limits.text === undefined || measure(compose(), limits.textUnit) <= limits.text)
    return { title, text: compose() };
  const max = limits.text;
  const room = (withBody: string) => {
    const saved = body;
    body = withBody;
    const fits = measure(compose(), limits.textUnit) <= max;
    body = saved;
    return fits;
  };
  // Longest prefix of the body, ending at a word, that fits with an ellipsis.
  let low = 0;
  let high = body.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (room(`${body.slice(0, middle).trimEnd()}…`)) low = middle;
    else high = middle - 1;
  }
  const prefix = body.slice(0, low);
  const word = prefix.replace(/\s+\S*$/, '');
  body = low === 0 ? '' : `${(word.length >= prefix.length / 2 ? word : prefix).trimEnd()}…`;
  if (measure(compose(), limits.textUnit) <= max) return { title, text: compose() };
  references = '';
  return { title, text: cut(compose(), max, limits.textUnit) };
}

/** What a network refuses about this file, or null when it is within every published limit. */
export function mediaProblem(
  platform: Platform,
  video: { bytes: number; seconds: number; width: number; height: number; fps: number },
): string | null {
  const limits = networkLimits[platform];
  const network = platformLabels[platform];
  const seconds = Math.round(video.seconds);
  const megabytes = Math.ceil(video.bytes / 1_000_000);
  if (limits.maxBytes !== undefined && video.bytes > limits.maxBytes)
    return `O ${network} aceita até ${Math.floor(limits.maxBytes / 1_000_000)} MB; este vídeo tem ${megabytes} MB.`;
  if (
    (limits.minSeconds !== undefined && video.seconds < limits.minSeconds) ||
    (limits.maxSeconds !== undefined && video.seconds > limits.maxSeconds)
  )
    return limits.minSeconds === undefined
      ? `O ${network} aceita até ${limits.maxSeconds} s; este vídeo tem ${seconds} s.`
      : `O ${network} aceita de ${limits.minSeconds} a ${limits.maxSeconds} s; este vídeo tem ${seconds} s.`;
  const fps = Math.round(video.fps * 100) / 100;
  if (
    (limits.minFps !== undefined && video.fps < limits.minFps - 0.01) ||
    (limits.maxFps !== undefined && video.fps > limits.maxFps + 0.01)
  )
    return `O ${network} aceita de ${limits.minFps} a ${limits.maxFps} quadros por segundo; este vídeo tem ${fps}.`;
  const sides = [video.width, video.height];
  if (
    (limits.minSide !== undefined && Math.min(...sides) < limits.minSide) ||
    (limits.maxSide !== undefined && Math.max(...sides) > limits.maxSide) ||
    (limits.maxWidth !== undefined && video.width > limits.maxWidth) ||
    (limits.minWidth !== undefined && video.width < limits.minWidth) ||
    (limits.minHeight !== undefined && video.height < limits.minHeight) ||
    (limits.aspect !== undefined && Math.abs(video.width / video.height / limits.aspect - 1) > 0.01)
  )
    return `A resolução ${video.width}x${video.height} está fora do que o ${network} aceita.`;
  return null;
}
