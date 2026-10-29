import {createDebouncedTask} from '../shared/debounce';
import {queryTabs, removeTabs, storageGet, storageSet} from '../shared/webextension';

/** Hard cap on open normal tabs once enough tabs have been user-activated. */
export const TAB_LIMIT = 20;

const TOUCHED_STORAGE_KEY = 'tabLimitTouchedV1';

/** Tab ids the user has activated, mapped to last touch time (ms since epoch). */
export type TouchedMap = Readonly<Record<string, number>>;

export interface TabLimitTab {
  readonly id: number | undefined;
  readonly active: boolean;
  readonly pinned: boolean;
  readonly audible: boolean;
  readonly incognito: boolean;
}

interface CountedTab {
  readonly id: number;
  readonly active: boolean;
  readonly pinned: boolean;
  readonly audible: boolean;
}

const ACTIVATION_DEBOUNCE_MS = 2_000;

export function validateTouchedMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const touched: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    if (/^\d+$/.test(key) && typeof raw === 'number' && Number.isFinite(raw)) {
      touched[key] = raw;
    }
  }
  return touched;
}

export function pruneTouchedMap(touched: TouchedMap, openTabIds: readonly number[]): Record<string, number> {
  const openIds = new Set(openTabIds.map((id) => String(id)));
  const pruned: Record<string, number> = {};
  for (const [tabId, lastAccessMs] of Object.entries(touched)) {
    if (openIds.has(tabId)) {
      pruned[tabId] = lastAccessMs;
    }
  }
  return pruned;
}

export function touchTab(
  touched: TouchedMap,
  tabId: number,
  lastAccessMs: number = Date.now(),
): Record<string, number> {
  return {...touched, [String(tabId)]: lastAccessMs};
}

export function untouchTab(touched: TouchedMap, tabId: number): Record<string, number> {
  const key = String(tabId);
  const next: Record<string, number> = {};
  for (const [id, lastAccessMs] of Object.entries(touched)) {
    if (id !== key) {
      next[id] = lastAccessMs;
    }
  }
  return next;
}

export function countKnownOpenTabs(tabs: readonly TabLimitTab[], touched: TouchedMap): number {
  return countableTabs(tabs).filter((tab) => isKnownTab(tab.id, touched)).length;
}

/**
 * Returns tab ids to close. Fresh install (empty touched) never closes.
 * Enforcement runs only when more than `limit` open counted tabs appear in
 * `touched`, and only while total open counted tabs exceed `limit`.
 *
 * Victims: unknown background tabs first (unpinned before pinned, then
 * non-audible before audible), then known tabs by ascending touch time.
 */
export function selectTabsToClose(
  tabs: readonly TabLimitTab[],
  touched: TouchedMap,
  limit: number = TAB_LIMIT,
): readonly number[] {
  const counted = countableTabs(tabs);
  if (countKnownOpenTabs(tabs, touched) <= limit) {
    return [];
  }
  if (counted.length <= limit) {
    return [];
  }
  const excess = counted.length - limit;
  return counted
    .filter((tab) => !tab.active)
    .map((tab) => toVictim(tab, touched))
    .sort(compareVictims)
    .slice(0, excess)
    .map((victim) => victim.id);
}

interface VictimCandidate {
  readonly id: number;
  readonly known: boolean;
  readonly touchedAt: number | undefined;
  readonly pinned: boolean;
  readonly audible: boolean;
}

function toVictim(tab: CountedTab, touched: TouchedMap): VictimCandidate {
  const key = String(tab.id);
  const touchedAt = touched[key];
  return {
    id: tab.id,
    known: touchedAt !== undefined,
    touchedAt,
    pinned: tab.pinned,
    audible: tab.audible,
  };
}

function compareVictims(left: VictimCandidate, right: VictimCandidate): number {
  if (left.known !== right.known) {
    return left.known ? 1 : -1;
  }
  if (left.pinned !== right.pinned) {
    return left.pinned ? 1 : -1;
  }
  if (left.audible !== right.audible) {
    return left.audible ? 1 : -1;
  }
  if (left.known && right.known) {
    const leftTime = left.touchedAt ?? 0;
    const rightTime = right.touchedAt ?? 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
  }
  return left.id - right.id;
}

function countableTabs(tabs: readonly TabLimitTab[]): CountedTab[] {
  return tabs.flatMap((tab) => {
    if (tab.incognito || !isTabId(tab.id)) {
      return [];
    }
    return [{
      id: tab.id,
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible,
    }];
  });
}

function isKnownTab(tabId: number, touched: TouchedMap): boolean {
  return touched[String(tabId)] !== undefined;
}

function isTabId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

function toLimitTab(tab: chrome.tabs.Tab): TabLimitTab {
  return {
    id: tab.id,
    active: tab.active,
    pinned: tab.pinned,
    audible: tab.audible === true,
    incognito: tab.incognito,
  };
}

async function readTouchedMap(): Promise<Record<string, number>> {
  const stored = await storageGet(TOUCHED_STORAGE_KEY);
  return validateTouchedMap(stored[TOUCHED_STORAGE_KEY]);
}

async function writeTouchedMap(touched: TouchedMap): Promise<void> {
  await storageSet({[TOUCHED_STORAGE_KEY]: touched});
}

let enforcement: Promise<void> = Promise.resolve();
let pendingActivationTabId: number | undefined;

const debouncedActivationTouch = createDebouncedTask((): void => {
  if (pendingActivationTabId === undefined) {
    return;
  }
  const tabId = pendingActivationTabId;
  pendingActivationTabId = undefined;
  void recordTabTouch(tabId);
}, ACTIVATION_DEBOUNCE_MS);

async function recordTabTouch(tabId: number): Promise<void> {
  if (!isTabId(tabId)) {
    return;
  }
  const touched = touchTab(await readTouchedMap(), tabId);
  await writeTouchedMap(touched);
  scheduleTabLimitEnforcement();
}

export function scheduleTabLimitEnforcement(): void {
  enforcement = enforcement
    .then(() => enforceTabLimit())
    .catch(() => undefined);
}

async function enforceTabLimit(): Promise<void> {
  const tabs = await queryTabs({});
  const openIds = tabs.flatMap((tab) => tab.id === undefined ? [] : [tab.id]);
  let touched = await readTouchedMap();
  const pruned = pruneTouchedMap(touched, openIds);
  if (JSON.stringify(pruned) !== JSON.stringify(touched)) {
    touched = pruned;
    await writeTouchedMap(touched);
  }
  const ids = selectTabsToClose(tabs.map(toLimitTab), touched);
  if (ids.length === 0) {
    return;
  }
  await Promise.all(ids.map((id) => removeTabs([id]).catch(() => undefined)));
}

export async function initializeTabLimit(): Promise<void> {
  const tabs = await queryTabs({});
  const openIds = tabs.flatMap((tab) => tab.id === undefined ? [] : [tab.id]);
  const touched = await readTouchedMap();
  const pruned = pruneTouchedMap(touched, openIds);
  if (JSON.stringify(pruned) !== JSON.stringify(touched)) {
    await writeTouchedMap(pruned);
  }
  scheduleTabLimitEnforcement();
}

export function handleTabActivated(tabId: number): void {
  pendingActivationTabId = tabId;
  debouncedActivationTouch.schedule();
}

export function handleTabCreated(tab: chrome.tabs.Tab): void {
  if (tab.active && tab.id !== undefined) {
    void recordTabTouch(tab.id);
  }
}

export async function handleTabRemoved(tabId: number): Promise<void> {
  const touched = untouchTab(await readTouchedMap(), tabId);
  await writeTouchedMap(touched);
}
