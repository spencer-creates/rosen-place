import { describe, expect, it } from 'vitest';
import { navConfig } from './config';
import { orderedTabs, tabsForFilter, validateNavConfig } from './model';
import type { NavConfig } from './types';

describe('nav config', () => {
  it('is valid', () => {
    expect(() => validateNavConfig(navConfig)).not.toThrow();
  });

  it('has the five areas in order', () => {
    expect(navConfig.areas.map((a) => a.label)).toEqual(['Partnership', 'Health', 'Children', 'Wealth', 'Creativity']);
  });

  it('Future shows every tab; an area shows only its tabs', () => {
    expect(tabsForFilter(navConfig, 'future')).toHaveLength(navConfig.tabs.length);
    for (const area of navConfig.areas) {
      const tabs = tabsForFilter(navConfig, area.id);
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.every((t) => t.area === area.id)).toBe(true);
    }
  });

  it('every tab belongs to exactly one area', () => {
    const counts = navConfig.tabs.map((t) => navConfig.areas.filter((a) => tabsForFilter(navConfig, a.id).includes(t)).length);
    expect(counts.every((c) => c === 1)).toBe(true);
  });

  it('Wealth > Finances has the seven tabs in order', () => {
    const finances = tabsForFilter(navConfig, 'wealth').find((t) => t.id === 'finances');
    expect(finances?.pageTabs?.map((p) => p.label)).toEqual([
      'Dashboard', 'Budget', 'Investments', 'Net Worth', 'Insurance', 'Taxes', 'Commitments',
    ]);
  });

  it('Future ordering follows area order', () => {
    const rank = navConfig.areas.map((a) => a.id);
    const seq = orderedTabs(navConfig).map((t) => rank.indexOf(t.area));
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });

  it('rejects nesting deeper than one level', () => {
    const bad = structuredClone(navConfig) as NavConfig;
    (bad.tabs[0] as any).children = [{ id: 'x', label: 'X', children: [{ id: 'y', label: 'Y' }] }];
    expect(() => validateNavConfig(bad)).toThrow(/one level/);
  });

  it('rejects the word "goals"', () => {
    const bad = structuredClone(navConfig);
    bad.tabs[0].label = 'Goals';
    expect(() => validateNavConfig(bad)).toThrow(/goals/);
  });

  it('nav mode swap is config only', () => {
    const flat: NavConfig = { ...navConfig, mode: 'flat-tabs' };
    expect(() => validateNavConfig(flat)).not.toThrow();
    expect(flat.tabs).toBe(navConfig.tabs);
  });
});
