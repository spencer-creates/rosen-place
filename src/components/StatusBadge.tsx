import type { TabStatus } from '../nav/types';

const LABELS: Record<TabStatus, string | null> = {
  settled: null,
  proposed: 'idea',
  placeholder: 'placeholder',
};

export function StatusBadge({ status }: { status: TabStatus }) {
  const label = LABELS[status];
  return label ? <span className={`badge badge-${status}`}>{label}</span> : null;
}
