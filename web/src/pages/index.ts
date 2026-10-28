import { analyticsPage } from './analytics.ts';
import { channelsPage } from './channels.ts';
import { connectionsPage } from './connections.ts';
import { overviewPage } from './overview.ts';
import { productionPage } from './production.ts';
import { researchPage } from './research.ts';
import { scriptsPage } from './scripts.ts';
import { settingsPage } from './settings.ts';
import { storiesPage } from './stories.ts';
import type { Page } from '../studio/state.ts';

/** One renderer per navigation entry; the shell mounts the result in `#main-content`. */
export const renderers: Record<Page, () => HTMLElement> = {
  overview: overviewPage,
  channels: channelsPage,
  research: researchPage,
  scripts: scriptsPage,
  stories: storiesPage,
  production: productionPage,
  analytics: analyticsPage,
  connections: connectionsPage,
  settings: settingsPage,
};
