import { Navigate, useParams } from 'react-router-dom';
import type { NavConfig } from '../nav/types';
import { findTab, tabPath } from '../nav/model';
import { PageTabs, usePageTab } from '../components/PageTabs';
import { StatusBadge } from '../components/StatusBadge';
import { VIEW_COPY } from './placeholderCopy';

/** Placeholder page for any sidebar tab (or caret child), with its page tabs. */
export function TabPage({ config }: { config: NavConfig }) {
  const { tabId, childId } = useParams();
  const tab = findTab(config, tabId);
  const child = tab?.children?.find((c) => c.id === childId);
  const pageTabs = child ? child.pageTabs : tab?.pageTabs;
  const view = usePageTab(pageTabs);

  if (!tab) return <NotFound />;
  // A caret parent has no page of its own: open its first child.
  if (tab.children?.length && !child) return <Navigate to={tabPath(tab.id, tab.children[0].id)} replace />;

  const area = config.areas.find((a) => a.id === tab.area);
  const title = child ? child.label : tab.label;
  const copyKey = view ? `${tab.id}/${view.id}` : tab.id;

  return (
    <div className="page" data-area={tab.area}>
      <p className="eyebrow">
        {area?.label}
        {child && <> &middot; {tab.label}</>}
      </p>
      <h1>
        {title} <StatusBadge status={tab.status} />
      </h1>
      {pageTabs && view && <PageTabs tabs={pageTabs} current={view} />}

      <section className="placeholder-panel">
        {view && <h2>{view.label}</h2>}
        <p>{VIEW_COPY[copyKey] ?? tab.description ?? 'Placeholder. Content comes later.'}</p>
      </section>
    </div>
  );
}

export function GlobalPage({ config, id }: { config: NavConfig; id: string }) {
  const g = config.globalTabs.find((x) => x.id === id);
  if (!g) return <NotFound />;
  return (
    <div className="page">
      <p className="eyebrow">Always visible</p>
      <h1>
        {g.label} <StatusBadge status="placeholder" />
      </h1>
      <section className="placeholder-panel">
        <p>{g.description}</p>
      </section>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
    </div>
  );
}
