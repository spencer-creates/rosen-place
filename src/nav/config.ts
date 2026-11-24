import type { NavConfig, NavMode } from './types';

// ---------------------------------------------------------------------------
// Swap the top bar here. 'areas' = Future + five areas filter. 'flat-tabs' = plain tabs.
// Can also be overridden without a code change with VITE_NAV_MODE=flat-tabs.
// ---------------------------------------------------------------------------
const envMode = import.meta.env?.VITE_NAV_MODE as NavMode | undefined;
export const NAV_MODE: NavMode = envMode === 'flat-tabs' || envMode === 'areas' ? envMode : 'areas';

export const navConfig: NavConfig = {
  mode: NAV_MODE,

  // The five areas, in order.
  areas: [
    { id: 'partnership', label: 'Partnership' },
    { id: 'health', label: 'Health' },
    { id: 'children', label: 'Children' },
    { id: 'wealth', label: 'Wealth' },
    { id: 'creativity', label: 'Creativity' },
  ],

  // Sidebar tabs. Each has exactly one area. Order within an area is display order.
  tabs: [
    // Partnership: OPEN QUESTION. Ideas raised: dating, development.
    {
      id: 'dating',
      label: 'Dating',
      area: 'partnership',
      status: 'proposed',
      description: 'Idea raised for Partnership. Not yet decided.',
    },
    {
      id: 'development',
      label: 'Development',
      area: 'partnership',
      status: 'proposed',
      description: 'Idea raised for Partnership. Not yet decided.',
    },

    // Health: OPEN QUESTION. No tabs settled.
    {
      id: 'health-overview',
      label: 'Health',
      area: 'health',
      status: 'placeholder',
      description: 'Sidebar tabs for Health are not settled yet.',
    },

    // Children: structure ready for each daughter and kids' accounts later.
    {
      id: 'kids',
      label: 'Kids',
      area: 'children',
      status: 'placeholder',
      description: 'One page per kid, plus an All kids view. Page tabs under each kid are placeholders.',
      children: [
        { id: 'all-kids', label: 'All kids', pageTabs: [{ id: 'overview', label: 'Overview' }] },
        {
          id: 'lila',
          label: 'Lila',
          pageTabs: [
            { id: 'development-plan', label: 'Development plan' },
            { id: 'school', label: 'School' },
            { id: 'activities', label: 'Activities' },
          ],
        },
        {
          id: 'ellie',
          label: 'Ellie',
          pageTabs: [
            { id: 'development-plan', label: 'Development plan' },
            { id: 'school', label: 'School' },
            { id: 'activities', label: 'Activities' },
          ],
        },
        {
          id: 'chloe',
          label: 'Chloe',
          pageTabs: [
            { id: 'development-plan', label: 'Development plan' },
            { id: 'school', label: 'School' },
            { id: 'activities', label: 'Activities' },
          ],
        },
      ],
    },

    // Wealth: Finances with seven page tabs, in the agreed order.
    {
      id: 'finances',
      label: 'Finances',
      area: 'wealth',
      status: 'settled',
      pageTabs: [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'budget', label: 'Budget' },
        { id: 'investments', label: 'Investments' },
        { id: 'net-worth', label: 'Net Worth' },
        { id: 'insurance', label: 'Insurance' },
        { id: 'taxes', label: 'Taxes' },
        { id: 'commitments', label: 'Commitments' },
      ],
    },

    // Creativity: OPEN QUESTION. Ideas raised: home improvements, travel, music.
    {
      id: 'home-improvements',
      label: 'Home improvements',
      area: 'creativity',
      status: 'proposed',
      description: 'The house as a project lives here. The house as an asset lives under Wealth > Finances > Net Worth.',
    },
    {
      id: 'travel',
      label: 'Travel',
      area: 'creativity',
      status: 'proposed',
      description: 'Idea raised for Creativity. Not yet decided.',
    },
    {
      id: 'music',
      label: 'Music',
      area: 'creativity',
      status: 'proposed',
      description: 'Idea raised for Creativity. Not yet decided.',
    },
  ],

  // OPEN QUESTION: where the shared calendar and doings sit. Shown outside the filter for now.
  globalTabs: [
    {
      id: 'calendar',
      label: 'Family calendar',
      description:
        'Reused from I’m Doing Now, not rebuilt. Kept separate from work calendar use. Placement relative to the area filter is still open.',
    },
  ],
};
