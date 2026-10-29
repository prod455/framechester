import type { Route } from './router.ts';
import { studioRoutes } from './studio.ts';
import { creativeRoutes } from './creative.ts';
import { productionRoutes } from './production.ts';
import { socialRoutes } from './social.ts';
import { resourceRoutes } from './resources.ts';

/** Every authenticated API route. Order only matters between routes that overlap. */
export const routes: Route[] = [
  ...studioRoutes,
  ...creativeRoutes,
  ...productionRoutes,
  ...socialRoutes,
  ...resourceRoutes,
];
