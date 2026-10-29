import { icon } from '../dom.ts';
import type { Platform } from '../../shared/types.ts';

export const platforms: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];
export const labels: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export function networkMark(platform: Platform): SVGSVGElement {
  return icon(platform === 'youtube' || platform === 'tiktok' ? 'film' : 'channels');
}
