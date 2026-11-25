import type { AreaId, NavConfig, SidebarTab } from './types';
import { AREA_IDS } from './types';

/** The top-bar filter: 'future' shows every tab, an area shows only its tabs. */
export type Filter = 'future' | AreaId;

export const FUTURE_PATH = '/future';

export function tabsForFilter(config: NavConfig, filter: Filter): SidebarTab[] {
  const ordered = orderedTabs(config);
  return filter === 'future' ? ordered : ordered.filter((t) => t.area === filter);
}

/** Tabs sorted by area order, keeping config order within an area. */
export function orderedTabs(config: NavConfig): SidebarTab[] {
  const rank = new Map(config.areas.map((a, i) => [a.id, i]));
  return [...config.tabs].sort((a, b) => (rank.get(a.area) ?? 99) - (rank.get(b.area) ?? 99));
}

export function findTab(config: NavConfig, tabId: string | undefined): SidebarTab | undefined {
  return config.tabs.find((t) => t.id === tabId);
}

export function tabPath(tabId: string, childId?: string, viewId?: string): string {
  let path = `/${tabId}`;
  if (childId) path += `/${childId}`;
  if (viewId) path += `?view=${encodeURIComponent(viewId)}`;
  return path;
}

/** Throws if the config breaks a structural rule. Run at startup and in tests. */
export function validateNavConfig(config: NavConfig): void {
  const errors: string[] = [];
  const areaIds = new Set(config.areas.map((a) => a.id));

  if (config.areas.length !== AREA_IDS.length || AREA_IDS.some((id) => !areaIds.has(id))) {
    errors.push('areas must be exactly the five areas');
  }

  const ids = new Set<string>(['future']);
  for (const id of [...config.tabs.map((t) => t.id), ...config.globalTabs.map((g) => g.id)]) {
    if (ids.has(id)) errors.push(`duplicate tab id "${id}"`);
    ids.add(id);
  }

  for (const tab of config.tabs) {
    if (!areaIds.has(tab.area)) errors.push(`tab "${tab.id}" has unknown area "${tab.area}"`);
    if (tab.children && tab.pageTabs) {
      errors.push(`tab "${tab.id}" has both children and page tabs; put page tabs on each child`);
    }
    // Runtime guard in case someone bypasses the types.
    for (const child of tab.children ?? []) {
      if ('children' in child) errors.push(`child "${tab.id}/${child.id}" nests deeper than one level`);
      for (const pt of child.pageTabs ?? []) {
        if ('children' in pt) errors.push(`page tab "${pt.id}" is nested`);
      }
    }
    for (const pt of tab.pageTabs ?? []) {
      if ('children' in pt) errors.push(`page tab "${pt.id}" is nested`);
    }
  }

  const words = JSON.stringify(config).toLowerCase();
  if (/\bgoals?\b/.test(words)) errors.push('use "commitments" and "promises", not "goals"');
  if (/\bkids?\b/.test(words)) errors.push('use "children" or their names, not "kids"');

  if (errors.length) throw new Error(`Invalid nav config:\n- ${errors.join('\n- ')}`);
}
