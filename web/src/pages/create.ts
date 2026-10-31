import { renderCreate } from '../create.ts';
import { go, state, studio } from '../studio/state.ts';
import { editChannel } from './channels.ts';
import {
  generateFinal,
  shortButton,
  startProduction,
  publicationStatus,
  publishButton,
  viewJob,
} from './production.ts';

/** The default page: the four steps of the channel's current video. */
export function createPage(): HTMLElement {
  return renderCreate(state(), studio.channelId, {
    createChannel: () => editChannel(),
    newVideo: startProduction,
    watch: viewJob,
    finalVersion: generateFinal,
    connectYoutube: () => go('connections'),
    retry: (script) => {
      studio.activeScriptId = script.id;
      startProduction();
    },
    sendButton: (job) => publishButton(job, 'youtube'),
    shortButton,
    youtubeStatus: (job) => publicationStatus(job, 'youtube'),
    allVideos: () => go('production'),
  });
}
