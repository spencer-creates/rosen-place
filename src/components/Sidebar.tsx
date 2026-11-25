import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import type { AreaId, NavConfig, SidebarTab } from '../nav/types';
import { findTab, tabPath, tabsForFilter } from '../nav/model';
import { useFilter } from '../nav/FilterContext';
import { StatusBadge } from './StatusBadge';

/** Layer 2. Tabs for the selected area, with at most one level of carets. */
export function Sidebar({ config }: { config: NavConfig }) {
  const { filter } = useFilter();
  const { tabId } = useParams();

  // In flat-tabs mode the top bar already lists every tab, so the sidebar only shows
  // the current tab's caret children. Everything else is identical.
  const tabs =
    config.mode === 'flat-tabs'
      ? [findTab(config, tabId)].filter((t): t is SidebarTab => !!t?.children)
      : tabsForFilter(config, filter);

  const showAreaHeadings = config.mode === 'areas' && filter === 'future';
  const areaLabel = (id: AreaId) => config.areas.find((a) => a.id === id)?.label ?? id;

  let lastArea: AreaId | undefined;
  return (
    <aside className="sidebar" aria-label="Tabs">
      <ul className="sidebar-list">
        {tabs.map((tab) => {
          const heading = showAreaHeadings && tab.area !== lastArea ? areaLabel(tab.area) : null;
          lastArea = tab.area;
          return (
            <li key={tab.id}>
              {heading && <div className="sidebar-heading" data-area={tab.area}>{heading}</div>}
              <SidebarItem tab={tab} active={tab.id === tabId} />
            </li>
          );
        })}
      </ul>

      {config.globalTabs.length > 0 && (
        <div className="sidebar-global">
          <div className="sidebar-heading">Always visible</div>
          <ul className="sidebar-list">
            {config.globalTabs.map((g) => (
              <li key={g.id}>
                <NavLink to={`/${g.id}`} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                  {g.label}
                  <StatusBadge status="placeholder" />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function SidebarItem({ tab, active }: { tab: SidebarTab; active: boolean }) {
  const { childId } = useParams();
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (!tab.children?.length) {
    return (
      <NavLink to={tabPath(tab.id)} className={`sidebar-link${active ? ' active' : ''}`} data-area={tab.area}>
        {tab.label}
        <StatusBadge status={tab.status} />
      </NavLink>
    );
  }

  return (
    <>
      <button
        className={`sidebar-link caret${active ? ' active-parent' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-area={tab.area}
      >
        <span className="caret-icon" aria-hidden>{open ? '▾' : '▸'}</span>
        {tab.label}
        <StatusBadge status={tab.status} />
      </button>
      {open && (
        <ul className="sidebar-children">
          {tab.children.map((child) => (
            <li key={child.id}>
              <NavLink
                to={tabPath(tab.id, child.id)}
                className={`sidebar-link child${active && childId === child.id ? ' active' : ''}`}
              >
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
