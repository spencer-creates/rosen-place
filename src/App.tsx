import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { navConfig } from './nav/config';
import { findTab, FUTURE_PATH, type Filter } from './nav/model';
import { FilterContext } from './nav/FilterContext';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { FuturePage } from './pages/FuturePage';
import { GlobalPage, TabPage } from './pages/TabPage';
import type { NavConfig } from './nav/types';

export default function App({ config = navConfig }: { config?: NavConfig }) {
  return (
    <BrowserRouter>
      <Shell config={config} />
    </BrowserRouter>
  );
}

function Shell({ config }: { config: NavConfig }) {
  const location = useLocation();
  const firstSegment = location.pathname.split('/')[1];
  const [filter, setFilter] = useState<Filter>(() => findTab(config, firstSegment)?.area ?? 'future');

  // If you land on a tab outside the current area filter (deep link, Future page link),
  // switch the filter to that tab's area. The Future filter shows everything, so it stays.
  useEffect(() => {
    const tab = findTab(config, firstSegment);
    if (tab && filter !== 'future' && filter !== tab.area) setFilter(tab.area);
  }, [config, firstSegment, filter]);

  const sidebarRoutes = (
    <>
      <Route path="/:tabId" element={<Sidebar config={config} />} />
      <Route path="/:tabId/:childId" element={<Sidebar config={config} />} />
      <Route path="*" element={<Sidebar config={config} />} />
    </>
  );

  return (
    <FilterContext.Provider value={{ filter, setFilter }}>
      <div className={`app mode-${config.mode}`}>
        <TopBar config={config} />
        <div className="body">
          <Routes>{sidebarRoutes}</Routes>
          <main className="main">
            <Routes>
              <Route path="/" element={<Navigate to={FUTURE_PATH} replace />} />
              <Route path={FUTURE_PATH} element={<FuturePage config={config} />} />
              <Route path="/:tabId" element={<RouteSwitch config={config} />} />
              <Route path="/:tabId/:childId" element={<TabPage config={config} />} />
            </Routes>
          </main>
        </div>
      </div>
    </FilterContext.Provider>
  );
}

/** "/:id" is either an always-visible item (calendar) or a sidebar tab. */
function RouteSwitch({ config }: { config: NavConfig }) {
  const id = useLocation().pathname.split('/')[1];
  return config.globalTabs.some((g) => g.id === id) ? <GlobalPage config={config} id={id} /> : <TabPage config={config} />;
}
