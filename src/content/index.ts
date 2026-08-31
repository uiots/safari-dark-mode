import type {PageState, SettingsChangedMessage, SettingsV1} from '../shared/contracts';
import {createDebouncedTask} from '../shared/debounce';
import {decidePolicy} from '../shared/policy';
import {validateSettings} from '../shared/settings';
import {detectNativeDark, observeThemeChanges} from './detector';
import {disableEngine, enableEngine} from './engine';
import {getDetectorHint} from './upstream-config';
import {sendRuntimeMessage} from '../shared/webextension';

const PRELOAD_ID = 'safari-dark-mode-preload';
let settings: SettingsV1;
let themeObserver: MutationObserver | undefined;

function installPreload(): void {
  if (document.getElementById(PRELOAD_ID) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = PRELOAD_ID;
  style.dataset.safariDarkMode = 'preload';
  style.textContent = ':root{background:#181a1b!important;color-scheme:dark}';
  (document.querySelector('head') ?? document.documentElement).append(style);
}

function removePreload(): void {
  document.getElementById(PRELOAD_ID)?.remove();
}

function report(state: PageState): void {
  if (window === window.top) {
    void sendRuntimeMessage({type: 'report-page-state', state}).catch(() => undefined);
  }
}

function reevaluate(): void {
  const hostname = location.hostname.toLowerCase();
  if (!/^https?:$/.test(location.protocol)) {
    disableEngine();
    removePreload();
    report({hostname, status: 'unsupported'});
    return;
  }
  const nativeDark = detectNativeDark(document, getDetectorHint(location.href));
  const decision = decidePolicy(settings, hostname, nativeDark);
  if (decision.apply) {
    enableEngine(settings, location.href);
  } else {
    disableEngine();
  }
  removePreload();
  report({hostname, status: decision.status});
}

const debouncedReevaluation = createDebouncedTask(reevaluate, 180);

function watchChanges(): void {
  themeObserver?.disconnect();
  themeObserver = observeThemeChanges(document, debouncedReevaluation.schedule);
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>): void {
      original.apply(history, args);
      debouncedReevaluation.schedule();
    } as History[typeof method];
  }
  addEventListener('popstate', debouncedReevaluation.schedule);
  addEventListener('hashchange', debouncedReevaluation.schedule);
}

async function initialize(): Promise<void> {
  try {
    settings = validateSettings(await sendRuntimeMessage({type: 'get-settings'}));
    reevaluate();
    watchChanges();
  } catch {
    removePreload();
    report({hostname: location.hostname.toLowerCase(), status: 'access-unavailable'});
  }
}

installPreload();
void initialize();

chrome.runtime.onMessage.addListener((message: unknown): void => {
  const candidate = message as Partial<SettingsChangedMessage>;
  if (candidate.type === 'settings-changed') {
    settings = validateSettings(candidate.settings);
    debouncedReevaluation.schedule();
  }
});
