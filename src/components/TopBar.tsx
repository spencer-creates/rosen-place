import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { NavConfig } from '../nav/types';
import { FUTURE_PATH, orderedTabs, tabPath, tabsForFilter, type Filter } from '../nav/model';
import { useFilter } from '../nav/FilterContext';
import { AccountMenu } from './AccountMenu';

/** Layer 1. Renders either the area filter or plain tabs, based on config.mode. */
export function TopBar({ config }: { config: NavConfig }) {
  return config.mode === 'flat-tabs' ? <FlatTabBar config={config} /> : <AreaFilterBar config={config} />;
}

function AreaFilterBar({ config }: { config: NavConfig }) {
  const { filter, setFilter } = useFilter();
  const navigate = useNavigate();
  const location = useLocation();

  const choose = (f: Filter) => {
    setFilter(f);
    if (f === 'future') {
      navigate(FUTURE_PATH);
      return;
    }
    // Stay put if the current page is already in this area, else open its first tab.
    const areaTabs = tabsForFilter(config, f);
    const onAreaTab = areaTabs.some((t) => location.pathname.split('/')[1] === t.id);
    if (!onAreaTab && areaTabs[0]) navigate(tabPath(areaTabs[0].id));
  };

  const items: { id: Filter; label: string }[] = [
    { id: 'future', label: 'Future' },
    ...config.areas.map((a) => ({ id: a.id, label: a.label })),
  ];

  return (
    <nav className="topbar" aria-label="Areas">
      <span className="brand">Rosen Place</span>
      <ul role="tablist">
        {items.map((item) => (
          <li key={item.id}>
            <button
              role="tab"
              aria-selected={filter === item.id}
              className={`topbar-item${filter === item.id ? ' active' : ''}${item.id === 'future' ? ' future' : ''}`}
              data-area={item.id}
              onClick={() => choose(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <AccountMenu />
    </nav>
  );
}

function FlatTabBar({ config }: { config: NavConfig }) {
  const items = [{ id: 'future', label: 'Future', to: FUTURE_PATH }, ...orderedTabs(config).map((t) => ({ id: t.id, label: t.label, to: tabPath(t.id) }))];
  return (
    <nav className="topbar" aria-label="Sections">
      <span className="brand">Rosen Place</span>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <NavLink to={item.to} className={({ isActive }) => `topbar-item${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <AccountMenu />
    </nav>
  );
}
