import {describe, expect, it} from 'vitest';
import {
  TAB_LIMIT,
  countCountableOpenTabs,
  countKnownOpenTabs,
  formatTabLimitBadge,
  pruneTouchedMap,
  selectTabsToClose,
  touchTab,
  type TabLimitTab,
  type TouchedMap,
} from '../src/background/tab-limit';

function tab(id: number | undefined, overrides: Partial<TabLimitTab> = {}): TabLimitTab {
  return {
    id,
    active: overrides.active ?? false,
    pinned: overrides.pinned ?? false,
    audible: overrides.audible ?? false,
    incognito: overrides.incognito ?? false,
  };
}

function touched(entries: readonly (readonly [number, number])[]): TouchedMap {
  return Object.fromEntries(entries.map(([id, ms]) => [String(id), ms]));
}

describe('tab limit touched map', () => {
  it('closes excess tabs on a fresh install with many open tabs and an empty touched map', () => {
    const tabs = [
      ...Array.from({length: 39}, (_, index) => tab(index + 1)),
      tab(999, {active: true}),
    ];
    expect(countKnownOpenTabs(tabs, {})).toBe(0);
    expect(countCountableOpenTabs(tabs)).toBe(40);
    const closes = selectTabsToClose(tabs, {});
    expect(closes).toHaveLength(20);
    expect(closes).not.toContain(999);
  });

  it('closes when total open tabs exceed the limit even if known count stays at or below 20', () => {
    const map = touched(Array.from({length: 15}, (_, index) => [index + 1, 1_000 + index] as const));
    const tabs = [
      ...Array.from({length: 15}, (_, index) => tab(index + 1)),
      ...Array.from({length: 35}, (_, index) => tab(100 + index)),
      tab(999, {active: true}),
    ];
    expect(countKnownOpenTabs(tabs, map)).toBe(15);
    expect(countCountableOpenTabs(tabs)).toBe(51);
    const closes = selectTabsToClose(tabs, map);
    expect(closes).toHaveLength(31);
    expect(closes).not.toContain(999);
    expect(closes.every((id) => id >= 100 || (id >= 1 && id <= 15))).toBe(true);
  });

  it('closes once total tabs exceed the limit, preferring unknown tabs and never the active tab', () => {
    const map = touched(Array.from({length: 21}, (_, index) => [index + 1, 10_000 + index] as const));
    const tabs = [
      ...Array.from({length: 20}, (_, index) => tab(index + 1)),
      tab(21, {active: true}),
      tab(501),
      tab(502, {pinned: true}),
      tab(503, {audible: true}),
    ];
    expect(countKnownOpenTabs(tabs, map)).toBe(21);
    expect(selectTabsToClose(tabs, map)).toEqual([501, 503, 502, 1]);
  });

  it('closes coldest known tabs after unknown background tabs are gone', () => {
    const map = touched([
      [1, 100],
      [2, 200],
      [3, 50],
      [4, 300],
      ...Array.from({length: 17}, (_, index) => [10 + index, 1_000 + index] as const),
    ]);
    const tabs = [
      tab(1),
      tab(2),
      tab(3),
      tab(4),
      ...Array.from({length: 17}, (_, index) => tab(10 + index)),
      tab(99, {active: true}),
    ];
    expect(selectTabsToClose(tabs, map)).toEqual([3, 1]);
  });

  it('never counts or closes private tabs', () => {
    const map = touched(Array.from({length: 21}, (_, index) => [index + 1, index] as const));
    const tabs = [
      ...Array.from({length: 21}, (_, index) => tab(index + 1)),
      tab(900, {incognito: true}),
      tab(901, {incognito: true, active: true}),
    ];
    expect(selectTabsToClose(tabs, map)).toEqual([1]);
    expect(selectTabsToClose(tabs, map)).not.toContain(900);
    expect(selectTabsToClose(tabs, map)).not.toContain(901);
  });

  it('prunes touched entries for tabs that are no longer open', () => {
    expect(pruneTouchedMap(touched([[1, 10], [2, 20], [3, 30]]), [2, 4])).toEqual({'2': 20});
  });

  it('records a new touch without mutating the prior map', () => {
    const before = touched([[1, 10]]);
    const after = touchTab(before, 2, 99);
    expect(before).toEqual({'1': 10});
    expect(after).toEqual({'1': 10, '2': 99});
  });

  it('respects the hard limit constant', () => {
    expect(TAB_LIMIT).toBe(20);
  });
});

describe('tab limit badge', () => {
  it('shows the total open count with OK color at or under the limit', () => {
    expect(formatTabLimitBadge(20)).toEqual({text: '20', backgroundColor: '#34C759'});
    expect(formatTabLimitBadge(5)).toEqual({text: '5', backgroundColor: '#34C759'});
  });

  it('shows the total open count with OVER color above the limit', () => {
    expect(formatTabLimitBadge(21)).toEqual({text: '21', backgroundColor: '#FF3B30'});
  });
});
