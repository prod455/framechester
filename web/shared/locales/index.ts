/** English and Spanish catalogs, keyed by the pt-BR message. One module per area keeps
 * translations next to each other and avoids one giant file. */
import admin from './admin.ts';
import content from './content.ts';
import creative from './creative.ts';
import production from './production.ts';
import server from './server.ts';
import shell from './shell.ts';

export type Catalog = Record<string, string>;
export interface AreaCatalog {
  en: Catalog;
  es: Catalog;
}
const areas: AreaCatalog[] = [shell, creative, production, content, admin, server];

function merge(pick: (area: AreaCatalog) => Catalog): Catalog {
  const merged: Catalog = {};
  for (const area of areas) Object.assign(merged, pick(area));
  return merged;
}
export const catalogs: Record<'en' | 'es', Catalog> = {
  en: merge((area) => area.en),
  es: merge((area) => area.es),
};
