import {fetchResource} from './resource-fetch';
import {initializeSettings, readSettings, writeSettings} from './storage';
import {
  TAB_LIMIT_RECHECK_ALARM,
  TAB_LIMIT_RETRY_ALARM,
  handleTabActivated,
  handleTabCreated,
  handleTabRemoved,
  initializeTabLimit,
  scheduleTabLimitEnforcement,
} from './tab-limit';
import {isRuntimeRequest} from '../shared/contracts';
import type {PageState, RuntimeRequest, SettingsChangedMessage} from '../shared/contracts';
import {createTab, queryTabs, sendTabMessage} from '../shared/webextension';

const pageStates = new Map<number, PageState>();

async function broadcastSettings(settings: SettingsChangedMessage['settings']): Promise<void> {
  const tabs = await queryTabs({});
  await Promise.all(tabs.flatMap((tab) => tab.id === undefined ? [] : [
    sendTabMessage(tab.id, {type: 'settings-changed', settings} satisfies SettingsChangedMessage)
      .catch(() => undefined),
  ]));
}

async function handleRequest(
  request: RuntimeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (request.type) {
    case 'resource-fetch': {
      const senderUrl = sender.tab?.url;
      if (sender.id !== chrome.runtime.id || sender.tab === undefined || senderUrl === undefined || !/^https?:\/\//.test(senderUrl)) {
        return {ok: false, code: 'invalid-url', message: 'Resource requests are accepted only from HTTP(S) content scripts.'};
      }
      return fetchResource(request.url);
    }
    case 'get-settings':
      return readSettings();
    case 'replace-settings': {
      const settings = await writeSettings(request.settings);
      await broadcastSettings(settings);
      return settings;
    }
    case 'report-page-state':
      if (sender.tab?.id !== undefined) {
        pageStates.set(sender.tab.id, request.state);
      }
      return {ok: true};
    case 'get-page-state':
      return pageStates.get(request.tabId);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse): boolean => {
  if (!isRuntimeRequest(message)) {
    return false;
  }
  void handleRequest(message, sender).then(sendResponse).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : 'Unexpected background error';
    sendResponse({error: text});
  });
  return true;
});

chrome.runtime.onInstalled.addListener((details): void => {
  void initializeSettings();
  // install and update both land here, so a version bump re-runs the cap
  // even when Safari kept an old service worker until the manifest changed.
  void initializeTabLimit();
  if (details.reason === 'install') {
    void createTab({url: chrome.runtime.getURL('onboarding/index.html')});
  }
});

if (typeof chrome.alarms !== 'undefined') {
  chrome.alarms.onAlarm.addListener((alarm): void => {
    if (alarm.name === TAB_LIMIT_RECHECK_ALARM || alarm.name === TAB_LIMIT_RETRY_ALARM) {
      scheduleTabLimitEnforcement();
    }
  });
}

chrome.runtime.onStartup.addListener((): void => {
  void initializeTabLimit();
});

chrome.tabs.onActivated.addListener((activeInfo): void => {
  handleTabActivated(activeInfo.tabId);
});

chrome.tabs.onCreated.addListener((tab): void => {
  handleTabCreated(tab);
});

chrome.tabs.onRemoved.addListener((tabId): void => {
  pageStates.delete(tabId);
  void handleTabRemoved(tabId);
});

void initializeSettings();
void initializeTabLimit();
