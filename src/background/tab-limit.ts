import {queryTabs, removeTabs} from '../shared/webextension';

/**
 * Hard cap on normal, non-private tabs across normal Safari windows.
 * Not a setting: there is no slider, toggle, or stored override.
 */
export const TAB_LIMIT = 20;

/**
 * A tab from `tabs.query({windowType: 'normal'})`.
 * `lastAccessed` stays `undefined` when Safari omits it.
 */
export interface TabLimitTab {
  readonly id: number | undefined;
  readonly active: boolean;
  readonly incognito: boolean;
  readonly lastAccessed: number | undefined;
}

interface CountedTab {
  readonly id: number;
  readonly active: boolean;
  readonly lastAccessed: number | undefined;
}

/**
 * Ids of background tabs to close so the counted set fits in `limit`.
 *
 * Counted tabs have a positive integer id and are not private. Active tabs
 * count toward the limit and are never closed. The caller must pass only
 * normal-window tabs.
 *
 * Finite `lastAccessed` sorts ascending (oldest first). A missing or
 * non-finite timestamp is colder than every finite timestamp. Ties break by
 * ascending tab id. Current WebKit omits `lastAccessed` from
 * `toWebAPI(WebExtensionTabParameters)`, so Safari ties every tab and the
 * lowest id is closed first. That id is not a stored access history.
 */
export function selectTabsToClose(tabs: readonly TabLimitTab[], limit: number = TAB_LIMIT): readonly number[] {
  const counted = countableTabs(tabs);
  const excess = counted.length - limit;
  if (excess <= 0) {
    return [];
  }
  return counted
    .filter((tab) => !tab.active)
    .sort(compareColdest)
    .slice(0, excess)
    .map((tab) => tab.id);
}

function countableTabs(tabs: readonly TabLimitTab[]): CountedTab[] {
  return tabs.flatMap((tab) => {
    if (tab.incognito || !isTabId(tab.id)) {
      return [];
    }
    return [{
      id: tab.id,
      active: tab.active,
      lastAccessed: finiteTimestamp(tab.lastAccessed),
    }];
  });
}

function isTabId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

function finiteTimestamp(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function compareColdest(left: CountedTab, right: CountedTab): number {
  if (left.lastAccessed === undefined || right.lastAccessed === undefined) {
    if (left.lastAccessed === undefined && right.lastAccessed === undefined) {
      return left.id - right.id;
    }
    return left.lastAccessed === undefined ? -1 : 1;
  }
  if (left.lastAccessed !== right.lastAccessed) {
    return left.lastAccessed - right.lastAccessed;
  }
  return left.id - right.id;
}

function toLimitTab(tab: chrome.tabs.Tab): TabLimitTab {
  return {
    id: tab.id,
    active: tab.active,
    incognito: tab.incognito,
    lastAccessed: finiteTimestamp(tab.lastAccessed),
  };
}

let enforcement: Promise<void> = Promise.resolve();

/**
 * Run enforcement one-at-a-time. Overlapping `tabs.onCreated` storms each
 * re-query after the previous pass, so two passes cannot close the same excess.
 */
export function scheduleTabLimitEnforcement(): void {
  enforcement = enforcement
    .then(() => enforceTabLimit())
    .catch(() => undefined);
}

async function enforceTabLimit(): Promise<void> {
  // Private windows are also `windowType: "normal"` and set `incognito`.
  // They are dropped in selection, so they are neither counted nor closed.
  // WebKit hides them from query entirely unless Private Browsing access is on.
  const tabs = await queryTabs({windowType: 'normal'});
  const ids = selectTabsToClose(tabs.map(toLimitTab));
  await Promise.all(ids.map((id) => removeTabs([id]).catch(() => undefined)));
}
