import { useSearchParams } from 'react-router-dom';
import type { PageTab } from '../nav/types';

/** Layer 3. A single row of views inside a page. Never nested. */
export function usePageTab(tabs: PageTab[] | undefined): PageTab | undefined {
  const [params] = useSearchParams();
  if (!tabs?.length) return undefined;
  return tabs.find((t) => t.id === params.get('view')) ?? tabs[0];
}

export function PageTabs({ tabs, current }: { tabs: PageTab[]; current: PageTab }) {
  const [, setParams] = useSearchParams();
  return (
    <div className="page-tabs" role="tablist" aria-label="Views">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === current.id}
          className={`page-tab${t.id === current.id ? ' active' : ''}`}
          onClick={() => setParams({ view: t.id })}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
