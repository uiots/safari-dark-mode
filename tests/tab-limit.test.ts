import {describe, expect, it} from 'vitest';
import {TAB_LIMIT, selectTabsToClose, type TabLimitTab} from '../src/background/tab-limit';

function tab(id: number | undefined, overrides: Partial<TabLimitTab> = {}): TabLimitTab {
  return {
    id,
    active: overrides.active ?? false,
    incognito: overrides.incognito ?? false,
    lastAccessed: overrides.lastAccessed,
  };
}

describe('selectTabsToClose', () => {
  it('closes nothing at or under the hard limit', () => {
    const under = Array.from({length: TAB_LIMIT - 1}, (_, index) => tab(index + 1, {lastAccessed: index}));
    const exact = Array.from({length: TAB_LIMIT}, (_, index) => tab(index + 1, {lastAccessed: index}));
    expect(TAB_LIMIT).toBe(20);
    expect(selectTabsToClose(under)).toEqual([]);
    expect(selectTabsToClose(exact)).toEqual([]);
  });

  it('closes the oldest non-active tab once the count exceeds 20', () => {
    const tabs = Array.from({length: 21}, (_, index) => tab(index + 1, {
      active: index === 20,
      lastAccessed: index + 1,
    }));
    expect(selectTabsToClose(tabs)).toEqual([1]);
  });

  it('never closes an active tab, even when it is the oldest', () => {
    const tabs = [
      tab(1, {active: true, lastAccessed: 1}),
      tab(2, {active: true, lastAccessed: 2}),
      tab(3, {lastAccessed: 3}),
      tab(4, {lastAccessed: 4}),
      tab(5, {lastAccessed: 50}),
    ];
    expect(selectTabsToClose(tabs, 3)).toEqual([3, 4]);
  });

  it('closes every background tab and stops when active tabs still exceed the limit', () => {
    const tabs = [
      tab(1, {active: true, lastAccessed: 1}),
      tab(2, {active: true, lastAccessed: 2}),
      tab(3, {active: true, lastAccessed: 3}),
      tab(4, {lastAccessed: 4}),
    ];
    expect(selectTabsToClose(tabs, 2)).toEqual([4]);
  });

  it('sorts finite lastAccessed ascending ahead of tab id', () => {
    const tabs = [
      tab(9, {lastAccessed: 1}),
      tab(2, {lastAccessed: 100}),
      tab(3, {active: true, lastAccessed: 0}),
    ];
    expect(selectTabsToClose(tabs, 2)).toEqual([9]);
  });

  it('treats a missing timestamp as colder than any finite timestamp, including zero', () => {
    const tabs = [
      tab(1, {lastAccessed: 0}),
      tab(2),
      tab(3, {lastAccessed: 5}),
      tab(4, {active: true, lastAccessed: 9}),
    ];
    expect(selectTabsToClose(tabs, 2)).toEqual([2, 1]);
  });

  it('treats non-finite timestamps as missing', () => {
    const tabs = [
      tab(1, {lastAccessed: Number.NaN}),
      tab(2, {lastAccessed: Number.POSITIVE_INFINITY}),
      tab(3, {lastAccessed: 10}),
      tab(4, {active: true}),
    ];
    expect(selectTabsToClose(tabs, 2)).toEqual([1, 2]);
  });

  it('breaks equal or missing timestamps by ascending id', () => {
    const tabs = [
      tab(8, {lastAccessed: 100}),
      tab(3, {lastAccessed: 100}),
      tab(9),
      tab(2),
      tab(1, {active: true}),
    ];
    expect(selectTabsToClose(tabs, 1)).toEqual([2, 9, 3, 8]);
  });

  it('does not count or close private tabs', () => {
    const tabs = [
      tab(1, {incognito: true, lastAccessed: 1}),
      tab(2, {incognito: true, active: true}),
      tab(3, {lastAccessed: 5}),
      tab(4, {active: true, lastAccessed: 6}),
      ...Array.from({length: 10}, (_, index) => tab(100 + index, {incognito: true})),
    ];
    expect(selectTabsToClose(tabs, 1)).toEqual([3]);
  });

  it('ignores tabs that cannot be removed', () => {
    const tabs = [
      tab(undefined, {lastAccessed: 1}),
      tab(0, {lastAccessed: 1}),
      tab(-1, {lastAccessed: 1}),
      tab(1.5, {lastAccessed: 1}),
      tab(4, {active: true, lastAccessed: 1}),
      tab(5, {lastAccessed: 2}),
    ];
    expect(selectTabsToClose(tabs, 1)).toEqual([5]);
  });

  it('does not mutate the input', () => {
    const tabs = [
      tab(2, {lastAccessed: 2}),
      tab(1, {lastAccessed: 1}),
    ];
    const snapshot = tabs.map((entry) => ({...entry}));
    expect(selectTabsToClose(tabs, 1)).toEqual([1]);
    expect(tabs).toEqual(snapshot);
  });
});
