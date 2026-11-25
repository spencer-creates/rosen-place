// Navigation data model for the Rosen Family Hub.
//
// Three layers, never deeper:
//   1. Top bar: Future + the five areas (acts as a filter), or plain tabs (see NavMode).
//   2. Sidebar: tabs for the selected area. A tab may have ONE level of children (carets).
//   3. Page tabs: a single row of views inside a page. Never nested.
// Anything deeper than layer 3 is page content, not navigation.
//
// The types enforce the depth limits: SidebarChild and PageTab have no `children`.

export const AREA_IDS = ['partnership', 'health', 'children', 'wealth', 'creativity'] as const;
export type AreaId = (typeof AREA_IDS)[number];

export interface Area {
  id: AreaId;
  label: string;
}

/** Layer 3: one view inside a page. Cannot nest. */
export interface PageTab {
  id: string;
  label: string;
}

/** Layer 2, second level: a caret child. Cannot have its own children. */
export interface SidebarChild {
  id: string;
  label: string;
  pageTabs?: PageTab[];
}

/**
 * Settled: agreed in the handoff.
 * Proposed: an idea that was raised but not decided (shown with a badge in the UI).
 * Placeholder: stand-in until the family decides what goes here.
 */
export type TabStatus = 'settled' | 'proposed' | 'placeholder';

/** Layer 2: a sidebar tab. Belongs to exactly one area. */
export interface SidebarTab {
  id: string;
  label: string;
  area: AreaId;
  status: TabStatus;
  description?: string;
  children?: SidebarChild[];
  pageTabs?: PageTab[];
}

/**
 * Items that sit outside the area filter (always visible). Not tied to an area.
 * Their placement is an open question in the handoff.
 */
export interface GlobalTab {
  id: string;
  label: string;
  description?: string;
}

/**
 * 'areas'     – top bar is Future + five areas, filtering the sidebar.
 * 'flat-tabs' – top bar is plain tabs, one per sidebar tab. Nothing underneath changes.
 */
export type NavMode = 'areas' | 'flat-tabs';

export interface NavConfig {
  mode: NavMode;
  areas: Area[];
  tabs: SidebarTab[];
  globalTabs: GlobalTab[];
}
