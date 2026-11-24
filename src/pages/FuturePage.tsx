import { Link } from 'react-router-dom';
import type { NavConfig } from '../nav/types';
import { tabPath, tabsForFilter } from '../nav/model';

/**
 * Future page skeleton: the future statement, then each area with its
 * commitments (ways of being) and promises (specific, dated, verifiable actions).
 * Content of the Future document is out of scope; these are empty slots.
 */
export function FuturePage({ config }: { config: NavConfig }) {
  return (
    <div className="page future-page">
      <header className="future-statement">
        <p className="eyebrow">Our future</p>
        <h1 className="placeholder-text">The family&rsquo;s future statement goes here.</h1>
      </header>

      <div className="area-grid">
        {config.areas.map((area) => {
          const firstTab = tabsForFilter(config, area.id)[0];
          return (
            <section key={area.id} className="area-card" data-area={area.id} aria-labelledby={`area-${area.id}`}>
              <h2 id={`area-${area.id}`}>{area.label}</h2>

              <h3>Commitments</h3>
              <p className="empty">No commitments yet.</p>

              <h3>Promises</h3>
              <p className="empty">No promises yet.</p>

              {firstTab && (
                <Link className="area-link" to={tabPath(firstTab.id)}>
                  Open {area.label} &rarr;
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
