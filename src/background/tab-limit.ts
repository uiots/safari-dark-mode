import {createDebouncedTask} from '../shared/debounce';
import {
  alarmExists,
  clearAlarm,
  createAlarm,
  getAllWindows,
  queryTabs,
  removeTabs,
  setActionBadge,
  storageGet,
  storageSet,
} from '../shared/webextension';

/** Hard cap on open normal (non-private) tabs. */
export const TAB_LIMIT = 20;
export const TAB_LIMIT_STATUS_KEY = 'tabLimitStatusV1';
export const TAB_LIMIT_RECHECK_ALARM = 'tab-limit-recheck';
export const TAB_LIMIT_RETRY_ALARM = 'tab-limit-retry';

const BADGE_OK_COLOR = '#34C759';
const BADGE_OVER_COLOR = '#FF3B30';

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

export function countCountableOpenTabs(tabs: readonly TabLimitTab[]): number {
  return countableTabs(tabs).length;
}

export function countKnownOpenTabs(tabs: readonly TabLimitTab[], touched: TouchedMap): number {
  return countableTabs(tabs).filter((tab) => isKnownTab(tab.id, touched)).length;
}

export interface TabLimitStatus {
  readonly openCount: number;
  readonly limit: number;
  readonly overLimit: boolean;
  readonly lastError: string | null;
}

export function tabLimitStatus(openCount: number, failures: readonly string[], limit: number = TAB_LIMIT): TabLimitStatus {
  const overLimit = openCount > limit;
  const lastError = overLimit && failures.length > 0 ? failures.slice(0, 3).join('; ') : null;
  return {openCount, limit, overLimit, lastError};
}

export function validateTabLimitStatus(value: unknown): TabLimitStatus | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (typeof candidate.openCount !== 'number' || !Number.isFinite(candidate.openCount)) {
    return null;
  }
  if (typeof candidate.limit !== 'number' || !Number.isFinite(candidate.limit)) {
    return null;
  }
  if (typeof candidate.overLimit !== 'boolean') {
    return null;
  }
  if (candidate.lastError !== null && typeof candidate.lastError !== 'string') {
    return null;
  }
  return {
    openCount: candidate.openCount,
    limit: candidate.limit,
    overLimit: candidate.overLimit,
    lastError: candidate.lastError ?? null,
  };
}

export function formatTabLimitNotice(status: TabLimitStatus | null): string {
  if (status === null) {
    return '';
  }
  if (status.lastError !== null && status.openCount < 0) {
    return `Tab limit could not run: ${status.lastError}`;
  }
  if (!status.overLimit) {
    return '';
  }
  const base = `${String(status.openCount)} tabs open, limit ${String(status.limit)}.`;
  if (status.lastError === null) {
    return `${base} Extra background tabs will be closed.`;
  }
  return `${base} Safari did not close a tab: ${status.lastError}`;
}

export function formatTabLimitBadge(
  openCount: number,
  limit: number = TAB_LIMIT,
): {readonly text: string; readonly backgroundColor: string} {
  return {
    text: String(openCount),
    backgroundColor: openCount > limit ? BADGE_OVER_COLOR : BADGE_OK_COLOR,
  };
}

/**
 * Returns tab ids to close whenever total open counted tabs exceed `limit`.
 * The touched map does not gate enforcement; it only ranks known-tab victims.
 *
 * Victims: unknown background tabs first (unpinned before pinned, then
 * non-audible before audible), then known tabs by ascending touch time.
 * The active tab is never closed.
 */
export function selectTabsToClose(
  tabs: readonly TabLimitTab[],
  touched: TouchedMap,
  limit: number = TAB_LIMIT,
): readonly number[] {
  const counted = countableTabs(tabs);
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

async function listOpenTabs(): Promise<chrome.tabs.Tab[]> {
  const queried = await queryTabs({});
  const byId = new Map<number, chrome.tabs.Tab>();
  for (const tab of queried) {
    if (tab.id !== undefined) {
      byId.set(tab.id, tab);
    }
  }
  try {
    const windows = await getAllWindows();
    for (const entry of windows) {
      for (const tab of entry.tabs ?? []) {
        if (tab.id !== undefined && !byId.has(tab.id)) {
          byId.set(tab.id, tab);
        }
      }
    }
  } catch {
    // tabs.query is enough when windows.getAll is unavailable.
  }
  return [...byId.values()];
}

async function rememberStatus(status: TabLimitStatus): Promise<void> {
  await storageSet({[TAB_LIMIT_STATUS_KEY]: status});
}

async function updateTabLimitBadge(openCount: number): Promise<void> {
  const {text, backgroundColor} = formatTabLimitBadge(openCount);
  await setActionBadge({text, color: backgroundColor});
}

async function syncRecheckAlarm(overLimit: boolean, hadFailure: boolean): Promise<void> {
  if (!overLimit) {
    await clearAlarm(TAB_LIMIT_RECHECK_ALARM);
    await clearAlarm(TAB_LIMIT_RETRY_ALARM);
    return;
  }
  if (!await alarmExists(TAB_LIMIT_RECHECK_ALARM)) {
    await createAlarm(TAB_LIMIT_RECHECK_ALARM, {periodInMinutes: 1});
  }
  if (hadFailure) {
    await createAlarm(TAB_LIMIT_RETRY_ALARM, {delayInMinutes: 0.5});
  }
}

async function closeTabs(ids: readonly number[]): Promise<string[]> {
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await removeTabs([id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'tabs.remove failed';
      failures.push(`${String(id)}: ${message}`);
    }
  }
  return failures;
}

async function publishCount(openCount: number, failures: readonly string[]): Promise<void> {
  const status = tabLimitStatus(openCount, failures);
  await rememberStatus(status);
  if (openCount < 0) {
    await setActionBadge({text: '!', color: BADGE_OVER_COLOR});
  } else {
    await updateTabLimitBadge(openCount);
  }
  await syncRecheckAlarm(status.overLimit || openCount < 0, status.lastError !== null);
}

async function enforceTabLimit(): Promise<void> {
  const tabs = await listOpenTabs();
  const limitTabs = tabs.map(toLimitTab);
  const openIds = tabs.flatMap((tab) => tab.id === undefined ? [] : [tab.id]);
  let touched = await readTouchedMap();
  const pruned = pruneTouchedMap(touched, openIds);
  if (JSON.stringify(pruned) !== JSON.stringify(touched)) {
    touched = pruned;
    await writeTouchedMap(touched);
  }
  const ids = selectTabsToClose(limitTabs, touched);
  const failures = ids.length > 0 ? await closeTabs(ids) : [];
  const afterTabs = ids.length > 0 ? await listOpenTabs() : tabs;
  const openCount = countCountableOpenTabs(afterTabs.map(toLimitTab));
  await publishCount(openCount, failures);
}

export function scheduleTabLimitEnforcement(): void {
  enforcement = enforcement.then(() => enforceTabLimit()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Tab limit enforcement failed';
    return publishCount(-1, [message]).catch(() => undefined);
  });
}

export async function initializeTabLimit(): Promise<void> {
  const tabs = await queryTabs({});
  const openIds = tabs.flatMap((tab) => tab.id === undefined ? [] : [tab.id]);
  const touched = await readTouchedMap();
  const pruned = pruneTouchedMap(touched, openIds);
  if (JSON.stringify(pruned) !== JSON.stringify(touched)) {
    await writeTouchedMap(pruned);
  }
  await updateTabLimitBadge(countCountableOpenTabs(tabs.map(toLimitTab)));
  scheduleTabLimitEnforcement();
}

export function handleTabActivated(tabId: number): void {
  pendingActivationTabId = tabId;
  debouncedActivationTouch.schedule();
}

export function handleTabCreated(tab: chrome.tabs.Tab): void {
  if (tab.active && tab.id !== undefined) {
    void recordTabTouch(tab.id);
    return;
  }
  scheduleTabLimitEnforcement();
}

export async function handleTabRemoved(tabId: number): Promise<void> {
  const touched = untouchTab(await readTouchedMap(), tabId);
  await writeTouchedMap(touched);
  scheduleTabLimitEnforcement();
}
