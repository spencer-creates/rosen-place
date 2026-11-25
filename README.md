# Rosen Place

Family hub for the Rosen family, organized around the family's Future document and its five areas: Partnership, Health, Children, Wealth, Creativity.

This is the navigation shell only: routing, nav, placeholder pages. No feature logic yet.

## Run

```bash
npm install
npm run dev      # local dev server
npm test         # nav structure checks
npm run build
```

## Navigation (three layers, max)

1. **Top bar**: Future + the five areas. Acts as a filter. Future shows every tab; an area shows only its tabs.
2. **Sidebar**: tabs for the selected area. Carets expand one level only (e.g. Children > All, Lila, Ellie, Chloe).
3. **Page tabs**: one row of views inside a page (e.g. Finances > Dashboard ... Commitments). Never nested.

Anything deeper is page content, not navigation.

All structure lives in `src/nav/config.ts`. Each sidebar tab has exactly one `area`. `validateNavConfig` (run at startup and in tests) rejects duplicate ids, unknown areas, nesting past one level, and the words "goals" and "kids".

### Swapping the area nav for plain tabs

Set `NAV_MODE` in `src/nav/config.ts` to `'flat-tabs'`, or build with `VITE_NAV_MODE=flat-tabs`. The top bar becomes one plain tab per section; routes, pages and data are unchanged.

## Open questions (placeholders in the UI)

Tabs marked **idea** were raised but not decided; **placeholder** means nothing has been chosen yet.

- Sidebar tabs for Partnership, Health, Children and Creativity aren't settled. Current stand-ins: Partnership (Dating, Development), Health (one placeholder), Children (Children > All, Lila, Ellie, Chloe), Creativity (Home improvements, Travel, Music).
- Page tabs under each child (Development plan, School, Activities are stand-ins).
- Where the shared calendar and "doings" sit relative to the area filter. Currently an "Always visible" section under the sidebar, outside the filter.
- Whether a promise created here auto-schedules in I'm Doing Now or lands as "pending scheduling."
- Whether the five-area nav sticks (see the swap above).
